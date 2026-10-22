// Master-password sessions: a signed, expiring cookie. No server-side session storage needed.
export const SESSION_COOKIE = 'qr_session';
export const SESSION_SECONDS = 12 * 60 * 60;
const encoder = new TextEncoder();
const toBase64Url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const hmacKey = secret => crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

// Password login is only on when both values are set and the secret is long enough to be unguessable.
export const passwordLoginEnabled = env => !!env.ADMIN_PASSWORD && typeof env.SESSION_SECRET === 'string' && env.SESSION_SECRET.length >= 32;

export async function createSession(secret, now = Date.now()) {
  const expires = Math.floor(now / 1000) + SESSION_SECONDS;
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(`session:${expires}`));
  return `${expires}.${toBase64Url(signature)}`;
}
export async function verifySession(secret, value, now = Date.now()) {
  try {
    const [expires, signature, extra] = String(value).split('.');
    if (extra !== undefined || !/^\d{1,12}$/.test(expires) || !signature || Number(expires) <= now / 1000) return false;
    return await crypto.subtle.verify('HMAC', await hmacKey(secret), fromBase64Url(signature), encoder.encode(`session:${expires}`));
  } catch { return false; }
}
// Compares SHA-256 digests without stopping at the first difference.
export async function passwordMatches(expected, supplied) {
  const [a, b] = await Promise.all([expected, supplied].map(async value => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(String(value))))));
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
export function getCookie(request, name) {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}
export const sessionCookie = (value, maxAge = SESSION_SECONDS) => `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
