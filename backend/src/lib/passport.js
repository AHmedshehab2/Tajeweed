const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { Strategy: FacebookStrategy } = require('passport-facebook');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../prisma');

const CALLBACK_BASE = process.env.OAUTH_CALLBACK_URL
  || (process.env.NODE_ENV === 'production'
    ? (process.env.CLIENT_ORIGIN || '').split(',')[0].trim()
    : `http://localhost:${process.env.PORT || 4000}`);

function isGoogleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function isFacebookConfigured() {
  return !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
}

// Shared resolver: find or create a user from an OAuth profile.
// Handles account linking (if email already exists, link the provider to that account).
// SECURITY: We only auto-link and only grant ADMIN (ADMIN_BOOTSTRAP_EMAIL) when the
//   OAuth provider has explicitly verified the email address.
//   - Google: profile.emails[0].verified must be true
//   - Facebook: treated as unverified unless the provider explicitly flags it
async function resolveOAuthUser(provider, profile) {
  const emailEntry = profile.emails && profile.emails[0];
  const email = emailEntry?.value;
  // Only treat the email as verified if the provider explicitly flags it.
  // Google includes `verified: true`; Facebook may not — unverified emails never
  // qualify for auto-linking or ADMIN bootstrap promotion.
  const emailVerified = Boolean(emailEntry?.verified);
  const avatar = (profile.photos && profile.photos[0] && profile.photos[0].value) || null;
  const providerId = profile.id;
  const displayName = profile.displayName || (email ? email.split('@')[0] : 'مستخدم');

  const idField = `${provider}Id`;

  // 1. Try to find an existing user by provider ID
  const existingByProvider = await prisma.user.findFirst({ where: { [idField]: providerId } });
  if (existingByProvider) {
    const bootstrap = (process.env.ADMIN_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
    if (
      bootstrap &&
      emailVerified &&
      email &&
      email.trim().toLowerCase() === bootstrap &&
      existingByProvider.email?.toLowerCase() === bootstrap &&
      existingByProvider.role !== 'ADMIN'
    ) {
      return prisma.user.update({ where: { id: existingByProvider.id }, data: { role: 'ADMIN' } });
    }
    return existingByProvider;
  }

  const bootstrapEmail = (process.env.ADMIN_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
  const shouldBeAdmin = !!(email && bootstrapEmail && emailVerified && email.toLowerCase() === bootstrapEmail);

  // 2. Try to find an existing user by email — link the provider to the existing account.
  //    SECURITY: Only link if the OAuth provider has verified this email address.
  //    This prevents account hijacking: an attacker cannot register an OAuth account
  //    with someone else's email to gain access to their local account.
  if (email && emailVerified) {
    const normalizedEmail = email.trim().toLowerCase();
    const existingByEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingByEmail) {
      const updated = await prisma.user.update({
        where: { id: existingByEmail.id },
        data: {
          [idField]: providerId,
          avatar: existingByEmail.avatar || avatar,
          provider: existingByEmail.provider || provider,
          ...(shouldBeAdmin && existingByEmail.role !== 'ADMIN' ? { role: 'ADMIN' } : {}),
        },
      });
      return updated;
    }
  }

  // 3. Create a new user.
  //    If email is present but unverified (e.g. Facebook), still store it — but we
  //    did not link it to an existing account, so there is no hijack risk.
  const newUser = await prisma.user.create({
    data: {
      name: displayName,
      email: email
        ? email.trim().toLowerCase()
        : `${provider}_${providerId}_${Date.now()}@oauth.placeholder`,
      passwordHash: await bcrypt.hash(crypto.randomUUID(), 10),
      role: shouldBeAdmin ? 'ADMIN' : 'STUDENT',
      avatar,
      provider,
      [idField]: providerId,
    },
  });
  return newUser;
}

// Google Strategy
if (isGoogleConfigured()) {
  passport.use(new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: CALLBACK_BASE + '/api/auth/google/callback',
      scope: ['profile', 'email'],
      proxy: true,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const user = await resolveOAuthUser('google', profile);
        done(null, user);
      } catch (err) {
        done(err, null);
      }
    },
  ));
}

// Facebook Strategy
if (isFacebookConfigured()) {
  passport.use(new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: CALLBACK_BASE + '/api/auth/facebook/callback',
      profileFields: ['id', 'displayName', 'emails', 'photos'],
      enableProof: true,
      proxy: true,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const user = await resolveOAuthUser('facebook', profile);
        done(null, user);
      } catch (err) {
        done(err, null);
      }
    },
  ));
}

module.exports = { passport, isGoogleConfigured, isFacebookConfigured, resolveOAuthUser };
