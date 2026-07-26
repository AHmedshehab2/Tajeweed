const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
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
  requireSameOrigin,
  resolvePrismaUserFromSupabase,
} = require('../middleware/auth');
const { isGoogleConfigured, isFacebookConfigured } = require('../lib/passport');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME = 100;
const MIN_PASSWORD = 8;
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

const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'محاولات كثيرة، حاول بعد 15 دقيقة' },
});

const OAUTH_STATE_COOKIE = 'oauth_state';
const OAUTH_STATE_MAX_AGE = 10 * 60 * 1000; // 10 minutes

function generateOAuthState(res) {
  const state = crypto.randomBytes(32).toString('hex');
  const opts = cookieOptions();
  delete opts.maxAge;
  res.cookie(OAUTH_STATE_COOKIE, state, { ...opts, sameSite: 'lax', maxAge: OAUTH_STATE_MAX_AGE });
  return state;
}

function verifyOAuthState(req, res) {
  const provided = req.query?.state;
  const stored = req.cookies?.[OAUTH_STATE_COOKIE];
  const opts = cookieOptions();
  delete opts.maxAge;
  res.clearCookie(OAUTH_STATE_COOKIE, { ...opts, path: '/' });
  return provided && stored && provided === stored;
}

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

function hasVerifiedEmail(claims) {
  return Boolean(claims?.email_verified || claims?.emailVerifiedAt || claims?.email_confirmed_at);
}

async function promoteVerifiedBootstrapUser(user, claims) {
  const bootstrapEmail = (process.env.ADMIN_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
  if (!bootstrapEmail || user.email !== bootstrapEmail || !hasVerifiedEmail(claims) || user.role === 'ADMIN') return user;
  return prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN', tokenVersion: { increment: 1 } } });
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
router.post('/supabase', requireSameOrigin, async (req, res) => {
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
    let user = await resolvePrismaUserFromSupabase(auth);
    if (!user) return res.status(401).json({ error: 'جلسة غير صالحة' });

    if (req.body?.purpose === 'password_reset') {
      await prisma.user.update({
        where: { id: user.id },
        data: { tokenVersion: { increment: 1 } },
      });
    }

    user = await promoteVerifiedBootstrapUser(user, auth.userClaims);

    // Fetch the full user record (including tokenVersion) so sign() embeds the
    // correct version, enabling server-side revocation the same way local JWTs work.
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, name: true, email: true, role: true, avatar: true, tokenVersion: true },
    });
    if (!fullUser) return res.status(401).json({ error: 'جلسة غير صالحة' });

    // Issue our own app JWT — do NOT store the raw Supabase access_token.
    // Supabase tokens expire in ~1 hour; our JWT uses the standard 30-day window
    // and participates in the tokenVersion revocation scheme.
    res.cookie(COOKIE_NAME, sign(fullUser), cookieOptions()).json({ user: publicUser(fullUser), provider: 'supabase' });
  } catch (_) {
    res.status(401).json({ error: 'جلسة غير صالحة' });
  }
});

router.post('/register', requireSameOrigin, registerLimiter, async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(403).json({ error: 'التسجيل المحلي غير متاح في الإنتاج' });
  const { name, email, password } = req.body;

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
  const passwordHash = await bcrypt.hash(password, 10);
  let user;
  try {
    user = await prisma.user.create({
      data: { name: name.trim(), email: normalizedEmail, passwordHash, role: 'STUDENT' },
    });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'البريد الإلكتروني مستخدم بالفعل' });
    throw err;
  }
  res.status(201).cookie(COOKIE_NAME, sign(user), cookieOptions()).json({ user: publicUser(user) });
});

router.post('/login', requireSameOrigin, loginLimiter, async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(403).json({ error: 'تسجيل الدخول المحلي غير متاح في الإنتاج' });
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'البريد وكلمة المرور مطلوبة' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user?.passwordHash) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  const ok = await bcrypt.compare(String(password), user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

  res.cookie(COOKIE_NAME, sign(user), cookieOptions()).json({ user: publicUser(user) });
});

// §2.6 fix: always load the current role from DB so demotions/promotions apply immediately,
// even for legacy tokens that don't carry a tokenVersion claim.
router.get('/me', (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.json({ user: null });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.id) return res.json({ user: null });

    return prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, name: true, email: true, role: true, avatar: true, tokenVersion: true },
    })
      .then(u => {
        if (!u) return res.json({ user: null });
        // Enforce revocation check only when the token carries a tokenVersion.
        // Legacy tokens (older OAuth) don't have it; still accept them if the user exists.
        if (payload.tokenVersion !== undefined && u.tokenVersion !== payload.tokenVersion) {
          return res.json({ user: null });
        }
        res.json({ user: publicUser(u) });
      })
      .catch(() => res.json({ user: null }));
  } catch (_) {
    res.json({ user: null });
  }
});

router.post('/logout', requireSameOrigin, (_req, res) => {
  res.setHeader('Clear-Site-Data', '"cookies"');
  const opts = cookieOptions();
  delete opts.maxAge;
  res.clearCookie(COOKIE_NAME, { ...opts, path: '/' }).json({ ok: true });
});

// ---- Google OAuth ----
router.get('/google', oauthLimiter, (req, res, next) => {
  if (!isGoogleConfigured()) return res.redirect(`${CLIENT_ORIGIN}/?auth_error=provider`);
  const state = generateOAuthState(res);
  passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account', state })(req, res, next);
});

router.get('/google/callback',
  (req, res, next) => {
    if (!isGoogleConfigured()) return res.redirect(`${CLIENT_ORIGIN}/?auth_error=1`);
    if (!verifyOAuthState(req, res)) return res.redirect(`${CLIENT_ORIGIN}/?auth_error=1`);
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
router.get('/facebook', oauthLimiter, (req, res, next) => {
  if (!isFacebookConfigured()) return res.redirect(`${CLIENT_ORIGIN}/?auth_error=provider`);
  const state = generateOAuthState(res);
  passport.authenticate('facebook', { scope: ['email'], state })(req, res, next);
});

router.get('/facebook/callback',
  (req, res, next) => {
    if (!isFacebookConfigured()) return res.redirect(`${CLIENT_ORIGIN}/?auth_error=1`);
    if (!verifyOAuthState(req, res)) return res.redirect(`${CLIENT_ORIGIN}/?auth_error=1`);
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
