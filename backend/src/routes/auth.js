const router = require('express').Router();
const crypto = require('crypto');
const passport = require('passport');
const rateLimit = require('express-rate-limit');
const authService = require('../services/auth.service');
const { requireSameOrigin } = require('../middleware/auth');
const { isSupabaseConfigured } = require('../lib/supabase');
const { isGoogleConfigured, isFacebookConfigured } = require('../lib/passport');
const asyncHandler = require('../lib/asyncHandler');
const AppError = require('../lib/AppError');

const OAUTH_STATE_COOKIE = 'oauth_state';
const OAUTH_STATE_MAX_AGE = 10 * 60 * 1000; // 10 minutes

function resolveClientOrigin(req) {
  const allowed = (process.env.CLIENT_ORIGIN || 'http://localhost:4000').split(',').map(s => s.trim());
  const origin = req.headers.origin || req.headers.referer;
  if (origin) {
    const base = origin.replace(/\/+$/, '');
    const match = allowed.find(a => a.replace(/\/+$/, '') === base);
    if (match) return match;
  }
  return allowed[0];
}

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

function generateOAuthState(req, res) {
  const state = crypto.randomBytes(32).toString('hex');
  const origin = resolveClientOrigin(req);
  const payload = JSON.stringify({ state, origin });
  const encoded = Buffer.from(payload).toString('base64');
  const opts = authService.cookieOptions();
  delete opts.maxAge;
  res.cookie(OAUTH_STATE_COOKIE, encoded, { ...opts, sameSite: 'lax', maxAge: OAUTH_STATE_MAX_AGE });
  return state;
}

function verifyOAuthState(req, res) {
  const provided = req.query?.state;
  const stored = req.cookies?.[OAUTH_STATE_COOKIE];
  const opts = authService.cookieOptions();
  delete opts.maxAge;
  res.clearCookie(OAUTH_STATE_COOKIE, { ...opts, path: '/' });
  if (!provided || !stored) return null;
  try {
    const decoded = JSON.parse(Buffer.from(stored, 'base64').toString());
    return decoded.state === provided ? decoded.origin : null;
  } catch {
    return null;
  }
}

// OAuth callback handler. Any error in the provider exchange (token fetch,
// profile load, or the local find-or-create DB work) is logged in full
// server-side and the user is redirected to the app with ?auth_error=1 —
// never a raw JSON 500 that gives no hint of what happened.
function oauthCallback(provider) {
  return (req, res) => {
    const origin = req._oauthOrigin || resolveClientOrigin(req);
    passport.authenticate(provider, { session: false }, (err, user) => {
      if (err) {
        console.error(`[${provider}] OAuth callback error:`, err);
        return res.redirect(`${origin}/?auth_error=1`);
      }
      if (!user) return res.redirect(`${origin}/?auth_error=1`);
      try {
        res.cookie(authService.COOKIE_NAME, authService.signToken(user), authService.cookieOptions());
        res.redirect(origin);
      } catch (_) {
        res.redirect(`${origin}/?auth_error=1`);
      }
    })(req, res);
  };
}

// Public config for frontend
router.get('/config', (_req, res) => {
  res.json({
    supabase: isSupabaseConfigured()
      ? { enabled: true, url: process.env.SUPABASE_URL, publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY }
      : { enabled: false },
    google: { enabled: isGoogleConfigured() },
    facebook: { enabled: isFacebookConfigured() },
  });
});

// Exchange Supabase token for app JWT
router.post('/supabase', requireSameOrigin, asyncHandler(async (req, res) => {
  const result = await authService.exchangeSupabaseToken(req);
  res.cookie(authService.COOKIE_NAME, result.jwt, authService.cookieOptions()).json({
    user: result.user,
    provider: 'supabase',
  });
}));

// Local Register
router.post('/register', requireSameOrigin, registerLimiter, asyncHandler(async (req, res) => {
  const result = await authService.registerUser(req.body);
  res.status(201)
    .cookie(authService.COOKIE_NAME, result.jwt, authService.cookieOptions())
    .json({ user: result.user });
}));

// Local Login
router.post('/login', requireSameOrigin, loginLimiter, asyncHandler(async (req, res) => {
  const result = await authService.loginUser(req.body);
  res.cookie(authService.COOKIE_NAME, result.jwt, authService.cookieOptions())
    .json({ user: result.user });
}));

// Get Current User Profile
router.get('/me', asyncHandler(async (req, res) => {
  const token = req.cookies?.token;
  const user = await authService.getCurrentUser(token);
  res.json({ user });
}));

// Logout
router.post('/logout', requireSameOrigin, (_req, res) => {
  res.setHeader('Clear-Site-Data', '"cookies"');
  const opts = authService.cookieOptions();
  delete opts.maxAge;
  res.clearCookie(authService.COOKIE_NAME, { ...opts, path: '/' }).json({ ok: true });
});

// ---- Google OAuth ----
router.get('/google', oauthLimiter, (req, res, next) => {
  const origin = resolveClientOrigin(req);
  if (!isGoogleConfigured()) return res.redirect(`${origin}/?auth_error=provider`);
  const state = generateOAuthState(req, res);
  passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account', state })(req, res, next);
});

router.get('/google/callback',
  (req, res, next) => {
    if (!isGoogleConfigured()) return res.redirect(`${resolveClientOrigin(req)}/?auth_error=1`);
    const origin = verifyOAuthState(req, res);
    if (!origin) return next(new AppError('حالة تسجيل الدخول غير صالحة', 400));
    req._oauthOrigin = origin;
    next();
  },
  oauthCallback('google'),
);

// ---- Facebook OAuth ----
router.get('/facebook', oauthLimiter, (req, res, next) => {
  const origin = resolveClientOrigin(req);
  if (!isFacebookConfigured()) return res.redirect(`${origin}/?auth_error=provider`);
  const state = generateOAuthState(req, res);
  passport.authenticate('facebook', { scope: ['email'], state })(req, res, next);
});

router.get('/facebook/callback',
  (req, res, next) => {
    if (!isFacebookConfigured()) return res.redirect(`${resolveClientOrigin(req)}/?auth_error=1`);
    const origin = verifyOAuthState(req, res);
    if (!origin) return next(new AppError('حالة تسجيل الدخول غير صالحة', 400));
    req._oauthOrigin = origin;
    next();
  },
  oauthCallback('facebook'),
);

module.exports = router;
