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
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'الاسم والبريد وكلمة المرور مطلوبة' });
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: 'البريد الإلكتروني مستخدم بالفعل' });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, passwordHash, role: role === 'ADMIN' ? 'ADMIN' : 'STUDENT' },
  });
  res.status(201).json({ token: sign(user), user: publicUser(user) });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  res.json({ token: sign(user), user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

module.exports = router;
