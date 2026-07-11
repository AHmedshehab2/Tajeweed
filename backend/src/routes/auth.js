const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME = 100;
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 128;

// Simple in-memory rate limiter: max attempts per IP per window
const rateLimitMap = new Map();
function rateLimit(key, maxAttempts, windowMs) {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now - entry.start > windowMs) {
    rateLimitMap.set(key, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= maxAttempts;
}
// Clean up old entries every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 600_000;
  for (const [key, entry] of rateLimitMap) {
    if (entry.start < cutoff) rateLimitMap.delete(key);
  }
}, 600_000);

function sign(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar },
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

// Public config for Supabase client on the frontend
router.get('/config', (_req, res) => {
  if (!isSupabaseConfigured()) {
    return res.json({ enabled: false });
  }
  res.json({
    enabled: true,
    url: process.env.SUPABASE_URL,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
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
    res.json({ token, user: publicUser(user), provider: 'supabase' });
  } catch (_) {
    res.status(401).json({ error: 'جلسة غير صالحة' });
  }
});

router.post('/register', async (req, res) => {
  const ip = req.ip;
  if (!rateLimit(`register:${ip}`, 5, 15 * 60 * 1000)) {
    return res.status(429).json({ error: 'محاولات كثيرة، حاول بعد 15 دقيقة' });
  }

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

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name: name.trim(), email: normalizedEmail, passwordHash, role: role === 'ADMIN' ? 'ADMIN' : 'STUDENT' },
  });
  res.status(201).json({ token: sign(user), user: publicUser(user) });
});

router.post('/login', async (req, res) => {
  const ip = req.ip;
  if (!rateLimit(`login:${ip}`, 10, 15 * 60 * 1000)) {
    return res.status(429).json({ error: 'محاولات كثيرة، حاول بعد 15 دقيقة' });
  }

  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'البريد وكلمة المرور مطلوبة' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  const ok = await bcrypt.compare(String(password), user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  res.json({ token: sign(user), user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

module.exports = router;
