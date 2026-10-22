import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest, authenticate } from '../functions/[[path]].js';
import { createSession, verifySession, passwordMatches } from '../shared/session.js';

const SECRET = 'x'.repeat(40);
let attempts, nextCalls;
const db = {
  prepare: sql => ({ bind: (...args) => ({
    sql, args,
    first: async () => ({ attempts: attempts.filter(a => a.ip === args[0] && a.at > args[1]).length }),
    run: async () => { if (/DELETE FROM login_attempts WHERE ip/.test(sql)) attempts = attempts.filter(a => a.ip !== args[0]); }
  }) }),
  batch: async list => { for (const item of list) if (/INSERT INTO login_attempts/.test(item.sql)) attempts.push({ ip: item.args[0], at: item.args[1] }); return []; }
};
const env = { DB: db, ADMIN_PASSWORD: 'correct horse battery', SESSION_SECRET: SECRET };
const context = (path, { method = 'GET', headers = {}, body, e = env } = {}) => ({
  request: new Request(`https://smartqr.uk${path}`, { method, headers: { 'CF-Connecting-IP': '1.2.3.4', ...headers }, body }),
  env: e, next: async () => { nextCalls++; return new Response('<html>dashboard</html>', { headers: { 'content-type': 'text/html' } }); }
});
const login = (password, extra = {}) => onRequest(context('/admin/login', { method: 'POST', headers: { origin: 'https://smartqr.uk', 'content-type': 'application/x-www-form-urlencoded' }, body: `password=${encodeURIComponent(password)}`, ...extra }));
const cookieFrom = response => response.headers.get('set-cookie').split(';')[0];
beforeEach(() => { attempts = []; nextCalls = 0; });

test('session tokens verify, expire and reject tampering', async () => {
  const token = await createSession(SECRET);
  assert.equal(await verifySession(SECRET, token), true);
  assert.equal(await verifySession(SECRET, token, Date.now() + 13 * 3600e3), false, 'expired');
  assert.equal(await verifySession('y'.repeat(40), token), false, 'wrong secret');
  const [exp, sig] = token.split('.');
  assert.equal(await verifySession(SECRET, `${Number(exp) + 99999}.${sig}`), false, 'extended expiry');
  assert.equal(await verifySession(SECRET, 'garbage'), false);
});
test('password comparison', async () => {
  assert.equal(await passwordMatches('abc', 'abc'), true);
  assert.equal(await passwordMatches('abc', 'abd'), false);
  assert.equal(await passwordMatches('abc', ''), false);
});
test('the dashboard redirects to the login page when signed out', async () => {
  const response = await onRequest(context('/admin/'));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/admin/login');
  assert.equal(nextCalls, 0);
});
test('a wrong password is refused and no cookie is set', async () => {
  const response = await login('nope');
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.match(await response.text(), /not correct/);
  assert.equal(attempts.length, 1);
});
test('the right password sets a secure cookie that unlocks the dashboard and API', async () => {
  const response = await login(env.ADMIN_PASSWORD);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/admin/');
  assert.match(response.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Strict/);
  const cookie = cookieFrom(response);
  const page = await onRequest(context('/admin/', { headers: { cookie } }));
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.equal(nextCalls, 1);
  const api = await onRequest({ ...context('/api/links', { headers: { cookie } }), env: { ...env, DB: { ...db, prepare: () => ({ all: async () => ({ results: [] }) }) } } });
  assert.equal(api.status, 200);
  assert.equal((await authenticate(context('/x', { headers: { cookie } }).request, env)).email, 'admin (password)');
});
test('the API stays locked without a session', async () => {
  assert.equal((await onRequest(context('/api/links'))).status, 401);
  assert.equal((await onRequest(context('/api/links', { headers: { cookie: 'qr_session=1.abc' } }))).status, 401);
});
test('repeated wrong passwords are throttled, even for the right password', async () => {
  for (let i = 0; i < 8; i++) await login('wrong');
  const response = await login(env.ADMIN_PASSWORD);
  assert.equal(response.status, 401);
  assert.match(await response.text(), /Too many attempts/);
  assert.equal(response.headers.get('set-cookie'), null);
});
test('login from another origin is refused', async () => {
  const response = await login(env.ADMIN_PASSWORD, { headers: { origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' } });
  assert.equal(response.status, 403);
});
test('logout clears the cookie', async () => {
  const response = await onRequest(context('/admin/logout', { method: 'POST', headers: { origin: 'https://smartqr.uk' } }));
  assert.equal(response.status, 302);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
});
test('without a password and strong secret configured, sign-in is off and everything stays locked', async () => {
  for (const e of [{ DB: db }, { DB: db, ADMIN_PASSWORD: 'pw', SESSION_SECRET: 'short' }]) {
    assert.equal((await onRequest(context('/admin/login', { e }))).status, 404);
    assert.equal((await onRequest(context('/admin/', { e }))).status, 401);
    assert.equal((await onRequest(context('/api/links', { e }))).status, 401);
  }
});
