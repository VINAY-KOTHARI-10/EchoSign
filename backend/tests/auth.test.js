// tests/auth.test.js
// API tests for the authentication routes (databases and email mocked; the real flow is covered by npm run e2e).

'use strict';

const request = require('supertest');

// The per-IP limiter is shared by every request in this file; its own behaviour is not what these tests are about.
jest.mock('../src/middleware/rateLimiter', () => {
  const pass = (req, res, next) => next();
  return { rateLimiter: pass, strictAuthLimiter: pass, speechRateLimiter: pass, otpResendLimiter: pass };
});
jest.mock('../src/config/mongodb', () => ({ connectMongoDB: jest.fn().mockResolvedValue(true) }));
jest.mock('../src/config/postgres', () => ({
  connectPostgres: jest.fn().mockResolvedValue(true),
  prisma: {
    user: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    userProfile: { create: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  },
}));
jest.mock('../src/models/mongo/UserActivity', () => ({ create: jest.fn(), findOne: jest.fn() }));
jest.mock('../src/models/mongo/OtpRecord', () => ({ upsertOtp: jest.fn().mockResolvedValue({}), findOne: jest.fn() }));
jest.mock('../src/Services/emailService', () => ({
  sendLoginOtp: jest.fn(),
  sendWelcome: jest.fn().mockResolvedValue(undefined),
  sendPasswordReset: jest.fn(),
  sendPasswordChanged: jest.fn().mockResolvedValue(undefined),
  sendOAuthWelcome: jest.fn().mockResolvedValue(undefined),
  sendVerifyEmail: jest.fn(),
  isConfigured: jest.fn().mockReturnValue(true),
}));

const app = require('../src/app');
const { prisma } = require('../src/config/postgres');
const UserActivity = require('../src/models/mongo/UserActivity');
const EmailService = require('../src/Services/emailService');

const mockNewUser = () => {
  prisma.user.findFirst.mockResolvedValue(null);
  prisma.$transaction.mockImplementation(async (cb) => cb({
    user: { create: jest.fn().mockResolvedValue({ id: 'uuid-123', email: 'test@test.com', username: 'testuser', role: 'USER' }) },
    userProfile: { create: jest.fn().mockResolvedValue({}) },
  }));
  UserActivity.create.mockResolvedValue({});
};
const registerBody = { email: 'test@test.com', username: 'testuser', password: 'Tr1cky-Horse9' };

describe('Auth API', () => {
  describe('POST /api/v1/auth/register', () => {
    it('should return 400 for missing fields', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({ email: 'invalid' });
      expect(res.status).toBe(400);
    });

    it('should return 400 for short password', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({ email: 'test@test.com', username: 'testuser', password: '123' });
      expect(res.status).toBe(400);
    });

    it('creates the account and asks for the emailed code (no tokens yet)', async () => {
      mockNewUser();
      EmailService.sendLoginOtp.mockResolvedValue(undefined);
      const res = await request(app).post('/api/v1/auth/register').send(registerBody);
      expect(res.status).toBe(201);
      expect(res.body.requiresOtp).toBe(true);
      expect(res.body.emailSent).toBe(true);
      expect(res.body.preAuthToken).toBeTruthy();
      expect(res.body.data).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
    });

    it('does not pretend the email was sent when delivery fails', async () => {
      mockNewUser();
      EmailService.sendLoginOtp.mockRejectedValue(Object.assign(new Error('Email delivery failed'), { code: 'EMAIL_FAILED' }));
      const res = await request(app).post('/api/v1/auth/register').send(registerBody);
      expect(res.status).toBe(201);
      expect(res.body.emailSent).toBe(false);
      expect(res.body.message).toMatch(/could not email/i);
    });

    it('should return 409 for duplicate user', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'existing', email: 'test@test.com' });
      const res = await request(app).post('/api/v1/auth/register').send(registerBody);
      expect(res.status).toBe(409);
    });

    it('refuses an address that is already confirmed (409), even with the same details', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', email: 'test@test.com', username: 'testuser', emailVerified: true });
      const res = await request(app).post('/api/v1/auth/register').send(registerBody);
      expect(res.status).toBe(409);
    });

    it('signing up again with an address nobody confirmed takes it over and sends a fresh code', async () => {
      prisma.user.findFirst.mockReset();
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'u1', email: 'test@test.com', username: 'testuser', emailVerified: false });
      prisma.user.update.mockResolvedValue({});
      EmailService.sendLoginOtp.mockReset().mockResolvedValue(undefined);
      EmailService.sendWelcome.mockClear();
      const res = await request(app).post('/api/v1/auth/register').send(registerBody);
      expect(res.status).toBe(201);
      expect(res.body.requiresOtp).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' } }));
      expect(EmailService.sendLoginOtp).toHaveBeenCalledTimes(1);
    });

    it('does not send the welcome email before the address is confirmed', async () => {
      mockNewUser();
      EmailService.sendLoginOtp.mockResolvedValue(undefined);
      EmailService.sendWelcome.mockClear();
      await request(app).post('/api/v1/auth/register').send(registerBody);
      expect(EmailService.sendWelcome).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should return 400 for missing credentials', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({});
      expect(res.status).toBe(400);
    });

    it('should return 401 for non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const res = await request(app).post('/api/v1/auth/login').send({ email: 'noone@test.com', password: 'password' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/forgot-password', () => {
    it('says so (503) when the server has no email service, whether or not the address exists', async () => {
      EmailService.isConfigured.mockReturnValueOnce(false);
      const res = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'anyone@test.com' });
      expect(res.status).toBe(503);
      expect(res.body.error || res.body.message).toMatch(/not set up|configure/i);
    });

    it('gives the same reply for a known and an unknown address when email works', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      const unknown = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'ghost@test.com' });
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1', email: 'real@test.com', username: 'real' });
      prisma.user.update.mockResolvedValue({});
      EmailService.sendPasswordReset.mockResolvedValue(undefined);
      const known = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'real@test.com' });
      expect(unknown.status).toBe(200);
      expect(known.status).toBe(200);
      expect(known.body.message).toBe(unknown.body.message);
      expect(EmailService.sendPasswordReset).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('answers 401 (not 500) when there is no refresh token or an invalid one', async () => {
      expect((await request(app).post('/api/v1/auth/refresh')).status).toBe(401);
      const bad = await request(app).post('/api/v1/auth/refresh').set('Cookie', 'refreshToken=not-a-jwt');
      expect(bad.status).toBe(401);
      expect(bad.body.code).toBe('INVALID_REFRESH');
    });

    it('blocks a cross-site request that carries the cookie', async () => {
      const res = await request(app).post('/api/v1/auth/refresh').set('Origin', 'https://evil.example').set('Cookie', 'refreshToken=x');
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CSRF_BLOCKED');
    });
  });

  describe('access control', () => {
    it('does not accept an access token from a cookie', async () => {
      const res = await request(app).get('/api/v1/users/me').set('Cookie', 'accessToken=anything');
      expect(res.status).toBe(401);
    });
    it('admin routes need a token', async () => {
      expect((await request(app).get('/api/v1/admin/stats')).status).toBe(401);
    });
  });

  describe('health and errors', () => {
    it('GET /health and /health/live are up without touching a database', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect((await request(app).get('/health/live')).status).toBe(200);
    });

    it('GET /health/ready reports 503 when a database is down', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('db down'));
      const res = await request(app).get('/health/ready');
      expect(res.status).toBe(503);
      expect(res.body.checks.postgres).toBe('down');
    });

    it('unknown routes return 404 with a request id', async () => {
      const res = await request(app).get('/api/v1/unknown-route');
      expect(res.status).toBe(404);
      expect(res.body.requestId).toBeTruthy();
    });

    it('sends a Content-Security-Policy and a request id on every response', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['content-security-policy']).toMatch(/default-src 'self'/);
      expect(res.headers['x-request-id']).toBeTruthy();
    });

    it('rejects oversized JSON bodies', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({ email: 'a@b.co', password: 'x'.repeat(600 * 1024) });
      expect(res.status).toBe(413);
    });
  });
});
