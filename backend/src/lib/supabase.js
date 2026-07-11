const {
  verifyAuth,
  createContextClient,
  createAdminClient,
  resolveEnv,
} = require('@supabase/server/core');

function isSupabaseConfigured() {
  const { data, error } = resolveEnv();
  if (error || !data?.url) return false;
  const hasPublishable = Object.keys(data.publishableKeys || {}).length > 0;
  const hasJwks = Boolean(data.jwks);
  return hasPublishable && hasJwks;
}

function expressToRequest(req) {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const url = `${protocol}://${host}${req.originalUrl}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  return new Request(url, { method: req.method, headers });
}

async function verifySupabaseUser(req) {
  if (!isSupabaseConfigured()) return null;
  const { data: auth, error } = await verifyAuth(expressToRequest(req), {
    auth: 'user',
  });
  if (error || !auth?.userClaims) return null;
  return auth;
}

function createUserClient(token) {
  return createContextClient({ auth: { token } });
}

function getAdminClient() {
  return createAdminClient();
}

module.exports = {
  isSupabaseConfigured,
  expressToRequest,
  verifySupabaseUser,
  createUserClient,
  getAdminClient,
  resolveEnv,
};
