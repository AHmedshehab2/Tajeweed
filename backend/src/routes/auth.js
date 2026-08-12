const router = require('express').Router();
const crypto = require('crypto');
const passport = require('passport');
const rateLimit = require('express-rate-limit');
const authService = require('../services/auth.service');
const { requireSameOrigin } = require('../middleware/auth');
const { isSupabaseConfigured } = require('../lib/supabase');
const { isGoogleConfigured, isFacebookConfigured } = require('../lib/passport');
const asyncHandler = require('../lib/asyncHandler');

const CLIENT_ORIGIN = (process.env.CLIENT_ORIGIN || 'http://localhost:4000').split(',')[0].trim();
const OAUTH_STATE_COOKIE = 'oauth_state';
const OAUTH_STATE_MAX_AGE = 10 * 60 * 1000; // 10 minutes

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

function generateOAuthState(res) {
  const state = crypto.randomBytes(32).toString('hex');
  const opts = authService.cookieOptions();
  delete opts.maxAge;
  res.cookie(OAUTH_STATE_COOKIE, state, { ...opts, sameSite: 'lax', maxAge: OAUTH_STATE_MAX_AGE });
  return state;
}

function verifyOAuthState(req, res) {
  const provided = req.query?.state;
  const stored = req.cookies?.[OAUTH_STATE_COOKIE];
  const opts = authService.cookieOptions();
  delete opts.maxAge;
  res.clearCookie(OAUTH_STATE_COOKIE, { ...opts, path: '/' });
  return provided && stored && provided === stored;
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
      res.cookie(authService.COOKIE_NAME, authService.signToken(req.user), authService.cookieOptions());
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
      res.cookie(authService.COOKIE_NAME, authService.signToken(req.user), authService.cookieOptions());
      res.redirect(CLIENT_ORIGIN);
    } catch (_) {
      res.redirect(`${CLIENT_ORIGIN}/?auth_error=1`);
    }
  },
);

module.exports = router;
