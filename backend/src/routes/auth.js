const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const rateLimit = require('express-rate-limit');
const prisma = require('../prisma');
const {
  isSupabaseConfigured,
  verifySupabaseUser,
  createUserClient,
} = require('../lib/supabase');
const {
  requireAuth,
  resolvePrismaUserFromSupabase,
} = require('../middleware/auth');
const { isGoogleConfigured, isFacebookConfigured } = require('../lib/passport');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME = 100;
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 128;
const COOKIE_NAME = 'token';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
const CLIENT_ORIGIN = (process.env.CLIENT_ORIGIN || 'http://localhost:4000').split(',')[0].trim();

// Rate limiters — default memory store is fine for single-instance SQLite deployment.
// For multi-instance deployments, swap to a shared store (e.g. Redis).
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'محاولات كثيرة، حاول بعد 15 دقيقة' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'محاولات كثيرة، حاول بعد 15 دقيقة' },
});

function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  };
}

function sign(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar, tokenVersion: user.tokenVersion },
    process.env.JWT_SECRET,
    { expiresIn: '30d' },
  );
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
  };
}

// Public config for Supabase client and OAuth providers on the frontend
router.get('/config', (_req, res) => {
  res.json({
    supabase: isSupabaseConfigured()
      ? { enabled: true, url: process.env.SUPABASE_URL, publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY }
      : { enabled: false },
    google: { enabled: isGoogleConfigured() },
    facebook: { enabled: isFacebookConfigured() },
  });
});

// Exchange a Supabase access token for the app user profile
router.post('/supabase', async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: 'Supabase غير مُعد' });
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.body?.accessToken;
  if (!token) return res.status(400).json({ error: 'رمز الدخول مطلوب' });

  req.headers.authorization = `Bearer ${token}`;
  try {
    const auth = await verifySupabaseUser(req);
    if (!auth) return res.status(401).json({ error: 'جلسة غير صالحة' });
    const user = await resolvePrismaUserFromSupabase(auth);
    if (!user) return res.status(401).json({ error: 'جلسة غير صالحة' });
    res.cookie(COOKIE_NAME, token, cookieOptions()).json({ user: publicUser(user), provider: 'supabase' });
  } catch (_) {
    res.status(401).json({ error: 'جلسة غير صالحة' });
  }
});

router.post('/register', registerLimiter, async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'الاسم والبريد وكلمة المرور مطلوبة' });
  }
  if (typeof name !== 'string' || name.trim().length < 2 || name.length > MAX_NAME) {
    return res.status(400).json({ error: `الاسم يجب أن يكون بين 2 و${MAX_NAME} حرف` });
  }
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'البريد الإلكتروني غير صالح' });
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
    return res.status(400).json({ error: `كلمة المرور يجب أن تكون بين ${MIN_PASSWORD} و${MAX_PASSWORD} حرف` });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) return res.status(409).json({ error: 'البريد الإلكتروني مستخدم بالفعل' });

  const allowedRoles = ['STUDENT', 'ADMIN'];
  const userRole = allowedRoles.includes(role) ? role : 'STUDENT';

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name: name.trim(), email: normalizedEmail, passwordHash, role: userRole },
  });
  res.status(201).cookie(COOKIE_NAME, sign(user), cookieOptions()).json({ user: publicUser(user) });
});

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'البريد وكلمة المرور مطلوبة' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  const ok = await bcrypt.compare(String(password), user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  res.cookie(COOKIE_NAME, sign(user), cookieOptions()).json({ user: publicUser(user) });
});

router.get('/me', (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.json({ user: null });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.id && payload.tokenVersion !== undefined) {
      return prisma.user.findUnique({ where: { id: payload.id }, select: { tokenVersion: true } })
        .then(u => {
          if (!u || u.tokenVersion !== payload.tokenVersion) return res.json({ user: null });
          res.json({ user: payload });
        })
        .catch(() => res.json({ user: null }));
    }
    res.json({ user: payload });
  } catch (_) {
    res.json({ user: null });
  }
});

router.post('/logout', (_req, res) => {
  res.setHeader('Clear-Site-Data', '"cookies"');
  res.clearCookie(COOKIE_NAME, { path: '/' }).json({ ok: true });
});

// ---- Google OAuth ----
router.get('/google', (req, res, next) => {
  if (!isGoogleConfigured()) return res.redirect(`${CLIENT_ORIGIN}/?auth_error=provider`);
  passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account' })(req, res, next);
});

router.get('/google/callback',
  (req, res, next) => {
    if (!isGoogleConfigured()) return res.redirect(`${CLIENT_ORIGIN}/?auth_error=1`);
    passport.authenticate('google', { failureRedirect: `${CLIENT_ORIGIN}/?auth_error=1`, session: false })(req, res, next);
  },
  (req, res) => {
    try {
      if (!req.user) return res.redirect(`${CLIENT_ORIGIN}/?auth_error=1`);
      res.cookie(COOKIE_NAME, sign(req.user), cookieOptions());
      res.redirect(CLIENT_ORIGIN);
    } catch (_) {
      res.redirect(`${CLIENT_ORIGIN}/?auth_error=1`);
    }
  },
);

// ---- Facebook OAuth ----
router.get('/facebook', (req, res, next) => {
  if (!isFacebookConfigured()) return res.redirect(`${CLIENT_ORIGIN}/?auth_error=provider`);
  passport.authenticate('facebook', { scope: ['email'] })(req, res, next);
});

router.get('/facebook/callback',
  (req, res, next) => {
    if (!isFacebookConfigured()) return res.redirect(`${CLIENT_ORIGIN}/?auth_error=1`);
    passport.authenticate('facebook', { failureRedirect: `${CLIENT_ORIGIN}/?auth_error=1`, session: false })(req, res, next);
  },
  (req, res) => {
    try {
      if (!req.user) return res.redirect(`${CLIENT_ORIGIN}/?auth_error=1`);
      res.cookie(COOKIE_NAME, sign(req.user), cookieOptions());
      res.redirect(CLIENT_ORIGIN);
    } catch (_) {
      res.redirect(`${CLIENT_ORIGIN}/?auth_error=1`);
    }
  },
);

module.exports = router;
