const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const userRepo = require('../repositories/user.repository');
const AppError = require('../lib/AppError');
const {
  isSupabaseConfigured,
  verifySupabaseUser,
  createUserClient,
} = require('../lib/supabase');

async function resolvePrismaUserFromSupabase(auth) {
  const claims = auth.userClaims;
  const email = claims.email;
  if (!email) return null;

  const normalizedEmail = email.trim().toLowerCase();
  let user = await userRepo.findUserByEmail(normalizedEmail);
  if (!user) {
    const name =
      claims.userMetadata?.name ||
      claims.userMetadata?.full_name ||
      email.split('@')[0];
    const passwordHash = await bcrypt.hash(crypto.randomUUID(), 10);
    user = await userRepo.createUser({
      name,
      email: normalizedEmail,
      passwordHash,
      role: 'STUDENT',
      avatar: claims.userMetadata?.avatar_url || null,
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

function requireSameOrigin(req, res, next) {
  const origin = req.get('origin');
  if (!origin) {
    if (process.env.NODE_ENV === 'production') {
      return next(new AppError('مصدر الطلب غير مسموح', 403));
    }
    return next();
  }
  const configured = (process.env.CLIENT_ORIGIN || '').split(',').map((value) => value.trim());
  if (configured.includes(origin)) return next();
  return next(new AppError('مصدر الطلب غير مسموح', 403));
}

async function requireAuth(req, _res, next) {
  const token = req.cookies?.token || null;
  if (!token) return next(new AppError('مطلوب تسجيل الدخول', 401));

  if (process.env.JWT_SECRET) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (payload.id && payload.tokenVersion !== undefined) {
        const user = await userRepo.findUserAuthFields(payload.id);
        if (!user || user.tokenVersion !== payload.tokenVersion) {
          return next(new AppError('الجلسة انتهت، سجّل الدخول مجدداً', 401));
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

  if (isSupabaseConfigured()) {
    try {
      const auth = await verifySupabaseUser(req);
      if (auth) {
        const user = await resolvePrismaUserFromSupabase(auth);
        if (!user) return next(new AppError('جلسة غير صالحة', 401));
        req.user = user;
        req.supabase = createUserClient(auth.token);
        return next();
      }
    } catch (_) {
      return next(new AppError('جلسة غير صالحة', 401));
    }
  }

  return next(new AppError('جلسة غير صالحة', 401));
}

function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'ADMIN') {
    return next(new AppError('صلاحيات المدير مطلوبة', 403));
  }
  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireSameOrigin,
  resolvePrismaUserFromSupabase,
};
