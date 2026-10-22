import { normalisePath, pathError, validTarget, validColour, colourError } from '../shared/validation.js';

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
// Copies the saved row into link_history; inserts nothing if the path does not exist.
const recordHistory = (db, path) => db.prepare('INSERT INTO link_history (path, name, target, changed_by) SELECT path, name, target, updated_by FROM links WHERE path = ?').bind(path);
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
  if (pathname === '/api/links' || pathname.startsWith('/api/links/')) {
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
      // Cloudflare Access adds the signed-in person's email to requests that pass through it.
      const actor = (request.headers.get('Cf-Access-Authenticated-User-Email') || 'unknown').slice(0, 200);
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
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return context.next(); // Protected by Cloudflare Access.
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  const path = normalisePath(pathname.replace(/\/index\.html$/i, ''));
  if (!path) return new Response('Not found', { status: 404 });
  if (!env.DB) return new Response('Redirect service unavailable', { status: 503 });
  const link = await env.DB.prepare('SELECT target FROM links WHERE path = ?').bind(path).first();
  if (!link) return new Response('QR code not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  return new Response(null, { status: 302, headers: { location: link.target, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}
