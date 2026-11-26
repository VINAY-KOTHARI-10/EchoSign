
// src/app.js
// Express Application Configuration

'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const passport = require('passport');




const logger = require('./utils/logger');
const { expressOriginCallback } = require('./config/cors');
const { errorHandler, notFoundHandler } = require('./middleware/errorMiddleware');
const { requestLogger } = require('./middleware/requestLogger');
const { rateLimiter } = require('./middleware/rateLimiter');
const { csrfGuard } = require('./middleware/csrfGuard');



// ─── Route Imports ─────────────────────────────────────────────────────────────
const authRoutes = require('./routes/v1/authRoutes');
const userRoutes = require('./routes/v1/userRoutes');
const sessionRoutes = require('./routes/v1/sessionRoutes');
const speechRoutes = require('./routes/v1/speechRoutes');
const chatRoutes = require('./routes/v1/chatRoutes');
const adminRoutes = require('./routes/v1/adminRoutes');
const languageRoutes = require('./routes/v1/languageRoutes');
const conversationRoutes = require('./routes/v1/conversationRoutes');
const phraseRoutes = require('./routes/v1/phraseRoutes');
const classroomRoutes = require('./routes/v1/classroomRoutes');


// ✅ CREATE APP FIRST
const app = express();

// Trust the first proxy (e.g., when running behind Render/nginx) so secure
// cookies and req.protocol are correct. Adjust if you have multiple proxies.
app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1); // 2 when Vercel proxies to Render (so req.ip is the visitor)

// ─── Request id first, so every log line and error response carries it ──────
app.use(requestLogger);

// ─── Security Middleware ──────────────────────────────────────────────────────
// CSP is written for what the app really loads: its own bundle, Google Fonts, and the MediaPipe hand-tracking
// runtime + model (jsdelivr / storage.googleapis.com). Camera and microphone stay available to our own pages.
const isProd = process.env.NODE_ENV === 'production';
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'wasm-unsafe-eval'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      mediaSrc: ["'self'", 'blob:', 'mediastream:'],
      connectSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://storage.googleapis.com', 'wss:', 'ws:'],
      workerSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      ...(isProd ? { upgradeInsecureRequests: [] } : {}),
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(), payment=()');
  next();
});

// ─── CORS ─────────────────────────────────────────────────────────────────────
// In production: origins from ALLOWED_ORIGINS env var (comma-separated)
// In development: all localhost ports are allowed dynamically
app.use(cors({ origin: expressOriginCallback, credentials: true }));

// ─── Compression ─────────────────────────────────────────────────────────────
app.use(compression({ level: 6 }));

// ─── Body Parsing ─────────────────────────────────────────────────────────────
// 512 KB is plenty (the largest legitimate body is a teacher's custom-gesture samples, ~200 KB).
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: true, limit: '64kb' }));
app.use(csrfGuard);

// ─── Cookie & Session Middleware ──────────────────────────────────────────────
app.use(cookieParser(process.env.SESSION_SECRET));

// Use express-session for OAuth flows (passport expects session methods like regenerate)
// Do not use cookie-session here — express-session provides the methods Passport relies on.
// A random per-process secret outside production keeps local dev working without a .env value; production
// refuses to start without one (see config/env.js), because sessions would otherwise be lost on every restart.
const sessionSecret = process.env.SESSION_SECRET || require('crypto').randomBytes(32).toString('hex');
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
  },
}));

// ─── Logging ──────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.http(msg.trim()) },
  }));
}
const { initPassport } = require('./config/passport');
initPassport(); // ✅ THIS WAS MISSING

app.use(passport.initialize());
app.use(passport.session());

// ─── Custom Middleware ────────────────────────────────────────────────────────
app.use(rateLimiter);

// ─── Static Files ─────────────────────────────────────────────────────────────

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ─── Health ───────────────────────────────────────────────────────────────────
// /health and /health/live: the process is up (use for liveness; never touches a database).
// /health/ready: both databases answer (use for readiness and deploy health checks).
const livePayload = () => ({ status: 'ok', service: 'EchoSign API', version: '1.0.0', timestamp: new Date().toISOString(), uptime: process.uptime() });
app.get(['/health', '/health/live'], (req, res) => res.json(livePayload()));
app.get('/health/ready', async (req, res) => {
  const checks = { postgres: 'down', mongodb: 'down' };
  try { await require('./config/postgres').prisma.$queryRaw`SELECT 1`; checks.postgres = 'up'; } catch { /* reported below */ }
  checks.mongodb = require('mongoose').connection.readyState === 1 ? 'up' : 'down';
  const ready = Object.values(checks).every((v) => v === 'up');
  res.status(ready ? 200 : 503).json({ ...livePayload(), status: ready ? 'ready' : 'degraded', checks });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
const API_V1 = '/api/v1';

app.use(`${API_V1}/auth`, authRoutes);
app.use(`${API_V1}/users`, userRoutes);
app.use(`${API_V1}/sessions`, sessionRoutes);
app.use(`${API_V1}/speech`, speechRoutes);
app.use(`${API_V1}/chat`, chatRoutes);
app.use(`${API_V1}/admin`, adminRoutes);
app.use(`${API_V1}/languages`, languageRoutes);
app.use(`${API_V1}/conversation`, conversationRoutes);
app.use(`${API_V1}/phrases`, phraseRoutes);
app.use(`${API_V1}/classrooms`, classroomRoutes);

// ─── API Docs ────────────────────────────────────────────────────────────────
app.get('/api', (req, res) => {
  res.json({
    name: 'EchoSign API',
    version: 'v1',
    endpoints: [
      'POST /api/v1/auth/register',
      'POST /api/v1/auth/login',
      'POST /api/v1/auth/refresh',
      'GET  /api/v1/users/me',
      'GET  /api/v1/sessions',
      'POST /api/v1/sessions',
      'POST /api/v1/speech/analyze',
      'GET  /api/v1/languages',
      'GET  /api/v1/chat/messages',
      'GET  /api/v1/phrases/daily',
      'GET /api/v1/phrases/random'
    ],
  });
});

// ─── Frontend (production) ────────────────────────────────────────────────────
// The React app is built into frontend-reactjs/dist and served from this same service, so the browser sees one
// origin: no CORS, and the login cookie is first-party. Deep links fall back to index.html.
const distDir = path.join(__dirname, '../../frontend-reactjs/dist');
if (fs.existsSync(path.join(distDir, 'index.html'))) {
  // Hashed files under /assets never change, so they can be cached for a year. The service worker, manifest and
  // index.html must always be re-checked, or users would keep an old app after a deploy.
  app.use(express.static(distDir, {
    index: false,
    maxAge: '1h',
    setHeaders: (res, file) => {
      if (/[\\/]assets[\\/]/.test(file)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      else if (/(sw\.js|manifest\.webmanifest)$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  app.get(/^\/(?!api(\/|$)|health|uploads\/|socket\.io\/).*/, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// ─── Error Handling (MUST BE LAST) ────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
