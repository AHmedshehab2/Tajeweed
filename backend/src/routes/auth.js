const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');
const { requireAuth } = require('../middleware/auth');

function sign(user) {
  return jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

router.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'الاسم والبريد وكلمة المرور مطلوبة' });
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: 'البريد الإلكتروني مستخدم بالفعل' });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, passwordHash, role: role === 'ADMIN' ? 'ADMIN' : 'STUDENT' },
  });
  res.status(201).json({ token: sign(user), user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar } });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  res.json({ token: sign(user), user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar } });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

module.exports = router;
