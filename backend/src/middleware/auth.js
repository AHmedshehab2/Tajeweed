const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../prisma');
const {
  isSupabaseConfigured,
  verifySupabaseUser,
  createUserClient,
} = require('../lib/supabase');

async function resolvePrismaUserFromSupabase(auth) {
  const claims = auth.userClaims;
  const email = claims.email;
  if (!email) return null;

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const role =
      claims.appMetadata?.role === 'ADMIN' || claims.userMetadata?.role === 'admin'
        ? 'ADMIN'
        : 'STUDENT';
    const name =
      claims.userMetadata?.name ||
      claims.userMetadata?.full_name ||
      email.split('@')[0];
    user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await bcrypt.hash(crypto.randomUUID(), 10),
        role,
        avatar: claims.userMetadata?.avatar_url || null,
      },
    });
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    authProvider: 'supabase',
  };
}

async function requireAuth(req, res, next) {
  const token = req.cookies?.token || null;
  if (!token) return res.status(401).json({ error: 'مطلوب تسجيل الدخول' });

  // Local app JWT (email/password login and demo accounts)
  if (process.env.JWT_SECRET) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      // Verify tokenVersion hasn't been revoked; load role from DB so promotions apply
      if (payload.id && payload.tokenVersion !== undefined) {
        const user = await prisma.user.findUnique({
          where: { id: payload.id },
          select: { tokenVersion: true, role: true, name: true, email: true, avatar: true },
        });
        if (!user || user.tokenVersion !== payload.tokenVersion) {
          return res.status(401).json({ error: 'الجلسة انتهت، سجّل الدخول مجدداً' });
        }
        req.user = {
          id: payload.id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          tokenVersion: user.tokenVersion,
        };
        return next();
      }
      req.user = payload;
      return next();
    } catch (_) {
      /* try Supabase next */
    }
  }

  // Supabase Auth JWT
  if (isSupabaseConfigured()) {
    try {
      const auth = await verifySupabaseUser(req);
      if (auth) {
        const user = await resolvePrismaUserFromSupabase(auth);
        if (!user) return res.status(401).json({ error: 'جلسة غير صالحة' });
        req.user = user;
        req.supabase = createUserClient(auth.token);
        return next();
      }
    } catch (_) {
      return res.status(401).json({ error: 'جلسة غير صالحة' });
    }
  }

  return res.status(401).json({ error: 'جلسة غير صالحة' });
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'صلاحيات المدير مطلوبة' });
  }
  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  resolvePrismaUserFromSupabase,
};
