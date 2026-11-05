// Server settings come from environment variables (see README, «Облако и orvo ID»).
const env = process.env;

export const config = {
  isProd: !!env.VERCEL || env.NODE_ENV === 'production',
  // Signs the session cookie. At least 32 characters in production.
  secret: env.SESSION_SECRET || (!env.VERCEL ? 'dev-only-norma-session-secret-0000000' : ''),

  orvo: {
    url: (env.ORVO_ID_URL || 'https://orvo-id.vercel.app').replace(/\/$/, ''),
    clientId: env.ORVO_CLIENT_ID || 'norma',
    secret: env.ORVO_CLIENT_SECRET || ''
  },

  // Shared Gemini key: signed-in people use AI without their own key.
  gemini: {
    key: env.GEMINI_API_KEY || env.GOOGLE_GENERATIVE_AI_API_KEY || '',
    models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'],
    fallback: 'gemini-2.5-flash'
  },

  // AI requests per day by orvo plan. Same numbers as orvo ID shows on /plus.
  aiPerDay: {
    free: Number(env.AI_FREE || 5),
    plus: Number(env.AI_PLUS || 40),
    premium: Number(env.AI_PREMIUM || 150)
  },

  // Cloud copy of the diary, bytes.
  maxState: 3_000_000
};

export function baseUrl(req) {
  if (env.PUBLIC_URL) return env.PUBLIC_URL.replace(/\/$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:4300';
  const proto = req.headers['x-forwarded-proto'] || (String(host).startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
