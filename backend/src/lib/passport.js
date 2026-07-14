const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { Strategy: FacebookStrategy } = require('passport-facebook');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../prisma');

const CLIENT_ORIGIN = (process.env.CLIENT_ORIGIN || 'http://localhost:4000').split(',')[0].trim();

function isGoogleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function isFacebookConfigured() {
  return !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
}

// Shared resolver: find or create a user from an OAuth profile.
// Handles account linking (if email already exists, link the provider to that account).
async function resolveOAuthUser(provider, profile) {
  const email = profile.emails && profile.emails[0] && profile.emails[0].value;
  const avatar = (profile.photos && profile.photos[0] && profile.photos[0].value) || null;
  const providerId = profile.id;
  const displayName = profile.displayName || (email ? email.split('@')[0] : 'مستخدم');

  const idField = `${provider}Id`;

  // 1. Try to find an existing user by provider ID
  const existingByProvider = await prisma.user.findFirst({ where: { [idField]: providerId } });
  if (existingByProvider) return existingByProvider;

  // 2. Try to find an existing user by email — link the provider to the existing account
  if (email) {
    const existingByEmail = await prisma.user.findUnique({ where: { email } });
    if (existingByEmail) {
      const updated = await prisma.user.update({
        where: { id: existingByEmail.id },
        data: { [idField]: providerId, avatar: existingByEmail.avatar || avatar, provider: existingByEmail.provider || provider },
      });
      return updated;
    }
  }

  // 3. Create a new user
  const newUser = await prisma.user.create({
    data: {
      name: displayName,
      email: email || `${provider}_${providerId}_${Date.now()}@oauth.placeholder`,
      passwordHash: await bcrypt.hash(crypto.randomUUID(), 10),
      role: email && email.toLowerCase() === 'tajeweed@gmail.com' ? 'ADMIN' : 'STUDENT',
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
      callbackURL: '/api/auth/google/callback',
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
      callbackURL: '/api/auth/facebook/callback',
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

module.exports = { passport, isGoogleConfigured, isFacebookConfigured };
