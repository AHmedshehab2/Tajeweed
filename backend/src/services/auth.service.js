const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userRepo = require('../repositories/user.repository');
const AppError = require('../lib/AppError');
const { resolvePrismaUserFromSupabase } = require('../middleware/auth');
const { isSupabaseConfigured, verifySupabaseUser } = require('../lib/supabase');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME = 100;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;
const COOKIE_NAME = 'token';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

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

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      tokenVersion: user.tokenVersion,
    },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
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
  if (!bootstrapEmail || user.email !== bootstrapEmail || !hasVerifiedEmail(claims) || user.role === 'ADMIN') {
    return user;
  }
  return userRepo.promoteUserToAdmin(user.id);
}

async function exchangeSupabaseToken(req) {
  if (!isSupabaseConfigured()) {
    throw new AppError('Supabase غير مُعد', 503);
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.body?.accessToken;
  if (!token) throw new AppError('رمز الدخول مطلوب', 400);

  req.headers.authorization = `Bearer ${token}`;
  try {
    const auth = await verifySupabaseUser(req);
    if (!auth) throw new AppError('جلسة غير صالحة', 401);

    let user = await resolvePrismaUserFromSupabase(auth);
    if (!user) throw new AppError('جلسة غير صالحة', 401);

    if (req.body?.purpose === 'password_reset') {
      await userRepo.incrementTokenVersion(user.id);
    }

    user = await promoteVerifiedBootstrapUser(user, auth.userClaims);
    const fullUser = await userRepo.findUserAuthFields(user.id);
    if (!fullUser) throw new AppError('جلسة غير صالحة', 401);

    return {
      jwt: signToken(fullUser),
      user: publicUser(fullUser),
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('جلسة غير صالحة', 401);
  }
}

async function registerUser({ name, email, password }) {
  if (process.env.NODE_ENV === 'production') {
    throw new AppError('التسجيل المحلي غير متاح في الإنتاج', 403);
  }

  if (!name || !email || !password) {
    throw new AppError('الاسم والبريد وكلمة المرور مطلوبة', 400);
  }
  if (typeof name !== 'string' || name.trim().length < 2 || name.length > MAX_NAME) {
    throw new AppError(`الاسم يجب أن يكون بين 2 و${MAX_NAME} حرف`, 400);
  }
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    throw new AppError('البريد الإلكتروني غير صالح', 400);
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
    throw new AppError(`كلمة المرور يجب أن تكون بين ${MIN_PASSWORD} و${MAX_PASSWORD} حرف`, 400);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const user = await userRepo.createUser({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: 'STUDENT',
    });
    return {
      jwt: signToken(user),
      user: publicUser(user),
    };
  } catch (err) {
    if (err.code === 'P2002') {
      throw new AppError('البريد الإلكتروني مستخدم بالفعل', 409);
    }
    throw err;
  }
}

async function loginUser({ email, password }) {
  if (process.env.NODE_ENV === 'production') {
    throw new AppError('تسجيل الدخول المحلي غير متاح في الإنتاج', 403);
  }

  if (!email || !password) {
    throw new AppError('البريد وكلمة المرور مطلوبة', 400);
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await userRepo.findUserByEmail(normalizedEmail);
  if (!user?.passwordHash) throw new AppError('بيانات الدخول غير صحيحة', 401);

  const ok = await bcrypt.compare(String(password), user.passwordHash);
  if (!ok) throw new AppError('بيانات الدخول غير صحيحة', 401);

  return {
    jwt: signToken(user),
    user: publicUser(user),
  };
}

async function getCurrentUser(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.id) return null;

    const u = await userRepo.findUserAuthFields(payload.id);
    if (!u) return null;

    if (payload.tokenVersion !== undefined && u.tokenVersion !== payload.tokenVersion) {
      return null;
    }
    return publicUser(u);
  } catch (_) {
    return null;
  }
}

module.exports = {
  COOKIE_NAME,
  cookieOptions,
  signToken,
  publicUser,
  exchangeSupabaseToken,
  registerUser,
  loginUser,
  getCurrentUser,
};
