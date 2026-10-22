import { normalisePath, pathError, validTarget, validColour, colourError } from '../shared/validation.js';
import { SESSION_COOKIE, passwordLoginEnabled, createSession, verifySession, passwordMatches, getCookie, sessionCookie } from '../shared/session.js';

export { normalisePath, validTarget };

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const respond = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

function inputError(body, update = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Invalid details.';
  if (!update) { const error = pathError(body.path); if (error) return error; }
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100) return 'Enter a name (up to 100 characters).';
  if (!validTarget(body.target)) return 'Enter a valid http or https destination URL.';
  if (!validColour(body.foreground) || !validColour(body.background)) return 'Choose valid QR colours.';
  if (body.transparent_background !== undefined && typeof body.transparent_background !== 'boolean') return 'Choose a valid background setting.';
  const colours = colourError(body.foreground, body.background, body.transparent_background);
  if (colours) return colours;
  if (!['square', 'rounded', 'dots'].includes(body.module_style ?? 'square') || !['square', 'rounded'].includes(body.marker_border ?? 'square') || !['square', 'circle'].includes(body.marker_center ?? 'square')) return 'Choose valid QR artwork styles.';
  return null;
}
const fromBase64Url = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

// Access signing keys rarely change, so keep them for an hour instead of fetching on every request.
const KEY_TTL = 60 * 60 * 1000, KEY_REFRESH_MIN = 60 * 1000;
const keyCache = new Map();
export function clearKeyCache() { keyCache.clear(); }
async function signingKey(team, kid) {
  const find = entry => entry?.keys.find(key => key.kid === kid && key.kty === 'RSA');
  const cached = keyCache.get(team);
  const age = cached ? Date.now() - cached.fetched : Infinity;
  if (age < KEY_TTL) {
    const key = find(cached);
    // An unknown key id may mean the keys rotated; refetch, but at most once a minute.
    if (key || age < KEY_REFRESH_MIN) return key ?? null;
  }
  try {
    const response = await fetch(`https://${team}/cdn-cgi/access/certs`);
    if (!response.ok) return find(cached) ?? null;
    const { keys } = await response.json();
    if (!Array.isArray(keys)) return find(cached) ?? null;
    const entry = { keys, fetched: Date.now() };
    keyCache.set(team, entry);
    return find(entry) ?? null;
  } catch { return find(cached) ?? null; }
}

// Resolves to the verified token payload, or false.
export async function isAuthorised(request, env) {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return false;
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return false;
  const pieces = token.split('.');
  if (pieces.length !== 3) return false;
  try {
    const header = JSON.parse(new TextDecoder().decode(fromBase64Url(pieces[0])));
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(pieces[1])));
    const team = env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const now = Date.now() / 1000;
    if (header.alg !== 'RS256' || !header.kid || payload.iss !== `https://${team}` || ![].concat(payload.aud || []).includes(env.ACCESS_AUD)) return false;
    if (typeof payload.exp !== 'number' || payload.exp <= now || (payload.nbf !== undefined && !(payload.nbf <= now))) return false;
    const jwk = await signingKey(team, header.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromBase64Url(pieces[2]), new TextEncoder().encode(`${pieces[0]}.${pieces[1]}`));
    return valid ? payload : false;
  } catch { return false; }
}
// Copies the saved row into link_history; inserts nothing if the path does not exist.
const recordHistory = (db, path) => db.prepare('INSERT INTO link_history (path, name, target, changed_by) SELECT path, name, target, updated_by FROM links WHERE path = ?').bind(path);
// Either a valid Cloudflare Access token or a valid master-password session unlocks the dashboard.
export async function authenticate(request, env) {
  const access = await isAuthorised(request, env);
  if (access) return access;
  if (passwordLoginEnabled(env)) {
    const cookie = getCookie(request, SESSION_COOKIE);
    if (cookie && await verifySession(env.SESSION_SECRET, cookie)) return { email: 'admin (password)' };
  }
  return false;
}

const LOGIN_LIMIT = 8, LOGIN_WINDOW_SECONDS = 15 * 60;
const loginPage = (error = '') => new Response(`<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Smart Soho · Sign in</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;color:#111827;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{width:min(380px,calc(100vw - 32px));background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:32px}
img{height:44px;display:block;margin-bottom:20px}h1{font-size:22px;margin:0 0 4px}p{margin:0 0 20px;color:#475569}
label{display:block;font-weight:600;font-size:14px;margin-bottom:6px}input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #cbd5e1;border-radius:10px;font:inherit}
input:focus{outline:3px solid #e8474033;border-color:#E84740}button{width:100%;margin-top:16px;padding:12px;border:0;border-radius:10px;background:#E84740;color:#fff;font:inherit;font-weight:600;cursor:pointer}
.error{background:#fef2f2;color:#991b1b;border:1px solid #fecaca;border-radius:10px;padding:10px 12px;margin-bottom:16px;font-size:14px}
</style></head><body><main><img src="/smartsoho-logo.svg" alt="Smart Soho"><h1>Smart QR</h1><p>Enter the team password to continue.</p>${error ? `<div class="error" role="alert">${error}</div>` : ''}<form method="post" action="/admin/login"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" autofocus required maxlength="200"><button type="submit">Sign in</button></form></main></body></html>`, {
  status: error ? 401 : 200,
  headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'", 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY' }
});
const redirect = (location, headers = {}) => new Response(null, { status: 302, headers: { location, 'cache-control': 'no-store', ...headers } });

async function handleLogin(request, env) {
  if (!passwordLoginEnabled(env)) return new Response('Password sign-in is not set up.', { status: 404, headers: { 'cache-control': 'no-store' } });
  if (request.method === 'GET' || request.method === 'HEAD') return await authenticate(request, env) ? redirect('/admin/') : loginPage();
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!sameOrigin(request)) return new Response('Invalid request origin.', { status: 403 });
  if (!env.DB) return new Response('The QR database is not connected.', { status: 503 });
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Math.floor(Date.now() / 1000);
  try {
    const recent = await env.DB.prepare('SELECT COUNT(*) AS attempts FROM login_attempts WHERE ip = ? AND attempted_at > ?').bind(ip, now - LOGIN_WINDOW_SECONDS).first();
    if ((recent?.attempts ?? 0) >= LOGIN_LIMIT) return loginPage('Too many attempts. Try again in 15 minutes.');
    let password = '';
    try { if (Number(request.headers.get('content-length')) < 2000) password = String((await request.formData()).get('password') ?? ''); } catch { /* treated as a wrong password */ }
    if (!await passwordMatches(env.ADMIN_PASSWORD, password)) {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM login_attempts WHERE attempted_at < ?').bind(now - 86400),
        env.DB.prepare('INSERT INTO login_attempts (ip, attempted_at) VALUES (?, ?)').bind(ip, now)
      ]);
      return loginPage('That password is not correct.');
    }
    await env.DB.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run();
  } catch { return new Response('Sign-in is temporarily unavailable.', { status: 503, headers: { 'cache-control': 'no-store' } }); }
  return redirect('/admin/', { 'set-cookie': sessionCookie(await createSession(env.SESSION_SECRET)) });
}
async function jsonBody(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) return null;
  if (Number(request.headers.get('content-length')) > 10000) return null;
  try { return await request.json(); } catch { return null; }
}
function sameOrigin(request) { return request.headers.get('origin') === new URL(request.url).origin; }
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return new Response('Not found', { status: 404 }); }
  if (pathname === '/' || pathname === '/index.html' || pathname.startsWith('/assets/') || pathname === '/favicon.ico') return context.next();
  if (pathname === '/admin/login') return handleLogin(request, env);
  if (pathname === '/admin/logout') {
    if (request.method !== 'POST' || !sameOrigin(request)) return new Response('Method not allowed', { status: 405 });
    return redirect('/admin/login', { 'set-cookie': sessionCookie('', 0) });
  }
  if (pathname === '/api/links' || pathname.startsWith('/api/links/')) {
    const access = await authenticate(request, env);
    if (!access) return respond({ error: 'Sign in to manage QR codes.' }, 401);
    if (!env.DB) return respond({ error: 'The QR database is not connected.' }, 503);
    const editPath = pathname.startsWith('/api/links/') ? normalisePath(pathname.slice('/api/links/'.length)) : null;
    if (pathname !== '/api/links' && !editPath) return respond({ error: 'Invalid scan link.' }, 400);
    if (request.method === 'GET' && !editPath) {
      const { results } = await env.DB.prepare('SELECT path, name, target, foreground, background, transparent_background, module_style, marker_border, marker_center, created_at, updated_at, updated_by FROM links ORDER BY updated_at DESC').all();
      return respond({ links: results });
    }
    if ((request.method === 'POST' && !editPath) || (request.method === 'PUT' && editPath)) {
      if (!sameOrigin(request)) return respond({ error: 'Invalid request origin.' }, 403);
      const body = await jsonBody(request);
      const error = inputError(body, !!editPath);
      if (error) return respond({ error }, 400);
      const name = body.name.trim(), target = body.target.trim();
      const foreground = body.foreground.toUpperCase(), background = body.background.toUpperCase();
      const actor = String(access.email ?? access.common_name ?? 'unknown').slice(0, 200);
      const transparentBackground = body.transparent_background ? 1 : 0;
      const moduleStyle = body.module_style ?? 'square', markerBorder = body.marker_border ?? 'square', markerCenter = body.marker_center ?? 'square';
      if (!editPath) {
        const path = normalisePath(body.path);
        try {
          await env.DB.batch([
            env.DB.prepare('INSERT INTO links (path, name, target, foreground, background, transparent_background, module_style, marker_border, marker_center, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(path, name, target, foreground, background, transparentBackground, moduleStyle, markerBorder, markerCenter, actor),
            recordHistory(env.DB, path)
          ]);
          return respond({ link: { path, name, target, foreground, background, transparent_background: transparentBackground, module_style: moduleStyle, marker_border: markerBorder, marker_center: markerCenter } }, 201);
        } catch (error) {
          if (/UNIQUE|constraint/i.test(String(error))) return respond({ error: 'That scan link is already in use.' }, 409);
          throw error;
        }
      }
      const [result] = await env.DB.batch([
        env.DB.prepare("UPDATE links SET name = ?, target = ?, foreground = ?, background = ?, transparent_background = ?, module_style = ?, marker_border = ?, marker_center = ?, updated_by = ?, updated_at = datetime('now') WHERE path = ?").bind(name, target, foreground, background, transparentBackground, moduleStyle, markerBorder, markerCenter, actor, editPath),
        recordHistory(env.DB, editPath)
      ]);
      if (!result.meta.changes) return respond({ error: 'QR code not found.' }, 404);
      return respond({ link: { path: editPath, name, target, foreground, background, transparent_background: transparentBackground, module_style: moduleStyle, marker_border: markerBorder, marker_center: markerCenter } });
    }
    return respond({ error: 'Method not allowed.' }, 405);
  }
  if (pathname.startsWith('/api/')) return respond({ error: 'Not found.' }, 404);
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    if (!await authenticate(request, env)) return passwordLoginEnabled(env) ? redirect('/admin/login') : new Response('Sign in is required.', { status: 401, headers: { 'cache-control': 'no-store' } });
    const response = await context.next();
    const guarded = new Response(response.body, response);
    guarded.headers.set('cache-control', 'no-store');
    return guarded;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  const path = normalisePath(pathname.replace(/\/index\.html$/i, ''));
  if (!path) return new Response('Not found', { status: 404 });
  if (!env.DB) return new Response('Redirect service unavailable', { status: 503 });
  const link = await env.DB.prepare('SELECT target FROM links WHERE path = ?').bind(path).first();
  if (!link) return new Response('QR code not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  return new Response(null, { status: 302, headers: { location: link.target, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}
