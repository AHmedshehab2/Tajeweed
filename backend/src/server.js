require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const passport = require('passport');
const errorHandler = require('./middleware/errorHandler');
const { isSupabaseConfigured } = require('./lib/supabase');
const { requireSameOrigin } = require('./middleware/auth');

// Initialize Passport strategies (Google/Facebook OAuth)
require('./lib/passport');

const authRoutes = require('./routes/auth');
const contentRoutes = require('./routes/content');
const announcementRoutes = require('./routes/announcements');
const progressRoutes = require('./routes/progress');
const uploadRoutes = require('./routes/upload');
const khutbahRoutes = require('./routes/khutbahs');
const quranRoutes = require('./routes/quran');

const app = express();
const clientOrigin = process.env.CLIENT_ORIGIN;
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-this-to-a-long-random-string') {
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
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return requireSameOrigin(req, res, next);
  next();
});
app.use(passport.initialize());
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
}));

app.use('/api/auth', authRoutes);
app.use('/api', contentRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/khutbahs', khutbahRoutes);
app.use('/api/quran', quranRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api', (_req, res) => res.status(404).json({ error: 'المسار غير موجود' }));

const frontendDir = path.join(__dirname, '../../frontend');
app.use(express.static(frontendDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.use(errorHandler);

module.exports = app;

if (require.main === module) {
  const PORT = Number(process.env.PORT || 4000);
  const HOST = process.env.HOST || '0.0.0.0';

  function startServer(port) {
    const server = app.listen(port, HOST, () => console.log(`Tajweed LMS API running on ${HOST}:${port}`));

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`Port ${port} is already in use. Trying ${port + 1}...`);
        startServer(port + 1);
        return;
      }

      console.error('Failed to start server:', err);
      process.exit(1);
    });
  }

  startServer(PORT);
}
