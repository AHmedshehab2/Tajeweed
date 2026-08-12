require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const passport = require('passport');
const prisma = require('./prisma');
const errorHandler = require('./middleware/errorHandler');
const { isSupabaseConfigured } = require('./lib/supabase');
const { requireSameOrigin } = require('./middleware/auth');
const { isSafeServeExtension } = require('./lib/sniff');
const { getStorageConfigurationError } = require('./services/r2.service');
const asyncHandler = require('./lib/asyncHandler');

// Initialize Passport strategies (Google/Facebook OAuth)
require('./lib/passport');

const authRoutes = require('./routes/auth');
const contentRoutes = require('./routes/content');
const announcementRoutes = require('./routes/announcements');
const progressRoutes = require('./routes/progress');
const uploadRoutes = require('./routes/upload');
const khutbahRoutes = require('./routes/khutbahs');
const quranRoutes = require('./routes/quran');
const scheduleRoutes = require('./routes/schedule');

const app = express();
const clientOrigin = process.env.CLIENT_ORIGIN;
const FORBIDDEN_JWT_SECRETS = ['change-this-to-a-long-random-string', 'change-me-to-a-long-random-secret'];
const jwtSecret = (process.env.JWT_SECRET || '').trim();
if (!jwtSecret || FORBIDDEN_JWT_SECRETS.includes(jwtSecret)) {
  if (process.env.NODE_ENV === 'production') {
    console.error('JWT_SECRET must be set to a strong secret in production');
    process.exit(1);
  }
  console.warn('Warning: JWT_SECRET is missing or using the default example value');
}
if (process.env.NODE_ENV === 'production' && !clientOrigin) {
  console.error('CLIENT_ORIGIN must be set in production');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && !isSupabaseConfigured()) {
  console.error('Supabase Auth must be configured in production');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production') {
  const storageConfigError = getStorageConfigurationError({
    required: process.env.REQUIRE_R2_STORAGE === 'true',
  });
  if (storageConfigError) {
    console.error(storageConfigError);
    process.exit(1);
  }
}
app.set('trust proxy', 1);
const corsOrigins = clientOrigin
  ? clientOrigin.split(',').map(s => s.trim()).filter(Boolean)
  : [];
if (process.env.NODE_ENV === 'production' && (corsOrigins.length !== 1 || corsOrigins[0] === '*')) {
  console.error('CLIENT_ORIGIN must contain one explicit HTTPS origin in production');
  process.exit(1);
}
app.use(cors({
  origin(origin, callback) {
    if (!origin || corsOrigins.includes(origin)) return callback(null, true);
    const error = new Error('Not allowed by CORS');
    error.status = 403;
    return callback(error);
  },
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
// Security headers for every response.
// NOTE: CSP is intentionally NOT set yet — the frontend relies on inline event
// handlers and inline styles, so a meaningful CSP (without 'unsafe-inline')
// requires a frontend refactor to nonce-based handlers first.
app.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return requireSameOrigin(req, res, next);
  next();
});
app.use(passport.initialize());
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  setHeaders: (res, filePath) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const ext = path.extname(filePath).toLowerCase();
    if (!isSafeServeExtension(ext)) {
      res.setHeader('Content-Type', 'application/octet-stream');
    }
  },
}));

app.use('/api/auth', authRoutes);
app.use('/api', contentRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/khutbahs', khutbahRoutes);
app.use('/api/quran', quranRoutes);
app.use('/api/schedule', scheduleRoutes);

app.get('/api/health', asyncHandler(async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ ok: true, database: 'ready' });
}));

app.use('/api', (_req, res) => res.status(404).json({ error: 'المسار غير موجود' }));

const frontendDir = path.join(__dirname, '../../frontend');
app.use(express.static(frontendDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.use(errorHandler);

function listenOnPort(port, host, allowPortFallback) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host);
    const onError = (err) => {
      server.removeListener('listening', onListening);
      if (allowPortFallback && err.code === 'EADDRINUSE') {
        console.warn(`Port ${port} is already in use. Trying ${port + 1}...`);
        resolve(listenOnPort(port + 1, host, allowPortFallback));
        return;
      }
      reject(err);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve(server);
    };
    server.once('error', onError);
    server.once('listening', onListening);
  });
}

async function gracefulShutdown(server, { exitProcess = false, timeoutMs = 10000 } = {}) {
  const forceExit = exitProcess
    ? setTimeout(() => {
      console.error('Graceful shutdown timed out');
      process.exit(1);
    }, timeoutMs)
    : null;
  forceExit?.unref();

  try {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    await prisma.$disconnect();
    if (exitProcess) process.exit(0);
  } finally {
    if (forceExit) clearTimeout(forceExit);
  }
}

async function startServer({
  port = Number(process.env.PORT || 4000),
  host = process.env.HOST || '0.0.0.0',
  allowPortFallback = true,
  registerSignalHandlers = true,
} = {}) {
  await prisma.$connect();
  let server;
  try {
    server = await listenOnPort(port, host, allowPortFallback);
  } catch (err) {
    await prisma.$disconnect();
    throw err;
  }

  if (registerSignalHandlers) {
    let shuttingDown = false;
    const shutdown = () => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log('Shutting down gracefully...');
      gracefulShutdown(server, { exitProcess: true }).catch((err) => {
        console.error('Graceful shutdown failed:', err);
        process.exit(1);
      });
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  }

  console.log(`Tajweed LMS API running on ${host}:${server.address().port}`);
  return server;
}

app.startServer = startServer;
app.gracefulShutdown = gracefulShutdown;

module.exports = app;

if (require.main === module) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
