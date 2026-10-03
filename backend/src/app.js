
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
const { originCallback } = require('./config/cors');
const { errorHandler, notFoundHandler } = require('./middleware/errorMiddleware');
const { requestLogger } = require('./middleware/requestLogger');
const { rateLimiter } = require('./middleware/rateLimiter');



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

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// ─── CORS ─────────────────────────────────────────────────────────────────────
// In production: origins from ALLOWED_ORIGINS env var (comma-separated)
// In development: all localhost ports are allowed dynamically
app.use(cors({ origin: originCallback, credentials: true }));

// ─── Compression ─────────────────────────────────────────────────────────────
app.use(compression({ level: 6 }));

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Cookie & Session Middleware ──────────────────────────────────────────────
app.use(cookieParser(process.env.SESSION_SECRET));

// Use express-session for OAuth flows (passport expects session methods like regenerate)
// Do not use cookie-session here — express-session provides the methods Passport relies on.
app.use(session({
  secret: process.env.SESSION_SECRET,
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
app.use(requestLogger);
app.use(rateLimiter);

// ─── Static Files ─────────────────────────────────────────────────────────────

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'EchoSign API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
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
// The React app is built into frontend/dist and served from this same service, so the browser sees one
// origin: no CORS, and the login cookie is first-party. Deep links fall back to index.html.
const distDir = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(path.join(distDir, 'index.html'))) {
  app.use(express.static(distDir, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api(\/|$)|health$|uploads\/|socket\.io\/).*/, (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// ─── Error Handling (MUST BE LAST) ────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
