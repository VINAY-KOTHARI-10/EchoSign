'use strict';

describe('frontends (one backend, several websites)', () => {
  const load = (env) => {
    jest.resetModules();
    process.env.FRONTEND_URL = env.FRONTEND_URL;
    process.env.FRONTEND_URLS = env.FRONTEND_URLS || '';
    process.env.ALLOWED_ORIGINS = env.ALLOWED_ORIGINS || '';
    return require('../src/config/frontends');
  };

  test('the main site comes from FRONTEND_URL, with no trailing slash', () => {
    const f = load({ FRONTEND_URL: 'https://react.example.app/' });
    expect(f.defaultFrontend()).toBe('https://react.example.app');
  });

  test('a listed second site is sent back to; an unknown site falls back to the main one', () => {
    const f = load({ FRONTEND_URL: 'https://react.example.app', FRONTEND_URLS: 'https://next.example.app' });
    expect(f.frontendFor('https://next.example.app')).toBe('https://next.example.app');
    expect(f.frontendFor('https://evil.example.com')).toBe('https://react.example.app');
    expect(f.frontendFor('not a url')).toBe('https://react.example.app');
    expect(f.frontendFor(undefined)).toBe('https://react.example.app');
  });

  test('the site is read from the Origin header, or the Referer when there is none', () => {
    const f = load({ FRONTEND_URL: 'https://react.example.app', FRONTEND_URLS: 'https://next.example.app' });
    expect(f.originFromRequest({ headers: { origin: 'https://next.example.app' } })).toBe('https://next.example.app');
    expect(f.originFromRequest({ headers: { referer: 'https://next.example.app/login?x=1' } })).toBe('https://next.example.app');
    expect(f.originFromRequest({ headers: {} })).toBeNull();
  });

  test('local development origins are still accepted', () => {
    const f = load({ FRONTEND_URL: 'https://react.example.app' });
    expect(f.frontendFor('http://localhost:3000')).toBe('http://localhost:3000');
  });
});

describe('Google callback address per website', () => {
  const load = (env) => {
    jest.resetModules();
    Object.assign(process.env, { FRONTEND_URL: env.FRONTEND_URL, FRONTEND_URLS: env.FRONTEND_URLS || '', GOOGLE_CALLBACK_URL: env.GOOGLE_CALLBACK_URL });
    return require('../src/config/frontends');
  };
  test('one website: the configured callback is used unchanged', () => {
    const f = load({ FRONTEND_URL: 'http://localhost:5173', GOOGLE_CALLBACK_URL: 'http://localhost:5000/api/v1/auth/google/callback' });
    expect(f.googleCallbackFor('http://localhost:5173')).toBe('http://localhost:5000/api/v1/auth/google/callback');
  });
  test('two websites: each gets a callback on its own address; unknown sites get the main one', () => {
    const f = load({ FRONTEND_URL: 'https://react.example.app', FRONTEND_URLS: 'https://next.example.app', GOOGLE_CALLBACK_URL: 'https://react.example.app/api/v1/auth/google/callback' });
    expect(f.googleCallbackFor('https://next.example.app')).toBe('https://next.example.app/api/v1/auth/google/callback');
    expect(f.googleCallbackFor('https://react.example.app')).toBe('https://react.example.app/api/v1/auth/google/callback');
    expect(f.googleCallbackFor('https://evil.example.com')).toBe('https://react.example.app/api/v1/auth/google/callback');
  });
});
