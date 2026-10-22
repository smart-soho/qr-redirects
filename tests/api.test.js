import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/[[path]].js';

let statements, failBatch;
const db = {
  prepare: sql => ({ bind: (...args) => ({ sql, args }) }),
  batch: async list => { statements.push(...list); if (failBatch) throw new Error('UNIQUE constraint failed: links.path'); return list.map(() => ({ meta: { changes: 1 } })); }
};
const valid = { name: 'Spring', target: 'https://example.com', path: 'spring', foreground: '#111827', background: '#FFFFFF' };
const call = (method, path, body) => onRequest({
  request: new Request(`https://smartqr.uk${path}`, { method, headers: { 'Cf-Access-Authenticated-User-Email': 'staff@smartsoho.co.uk', origin: 'https://smartqr.uk', 'content-type': 'application/json' }, body: body && JSON.stringify(body) }),
  env: { DB: db }, next: () => { throw Error('unexpected'); }
});
beforeEach(() => {
  statements = []; failBatch = false;
});

test('creating a link records who made it and writes history in one batch', async () => {
  const response = await call('POST', '/api/links', valid);
  assert.equal(response.status, 201);
  assert.match(statements[0].sql, /INSERT INTO links/);
  assert.equal(statements[0].args.at(-1), 'staff@smartsoho.co.uk');
  assert.match(statements[1].sql, /INSERT INTO link_history/);
});
test('updating a link records history and keeps the scan link', async () => {
  const response = await call('PUT', '/api/links/Borough-yards/ScanWin', { ...valid, target: 'https://example.org' });
  assert.equal(response.status, 200);
  assert.equal(statements[0].args.at(-1), 'Borough-yards/ScanWin');
  assert.match(statements[1].sql, /link_history/);
});
test('duplicate scan links return 409', async () => {
  failBatch = true;
  assert.equal((await call('POST', '/api/links', valid)).status, 409);
});
test('reserved links, inverted colours and bad destinations are rejected with clear messages', async () => {
  let response = await call('POST', '/api/links', { ...valid, path: 'admin' });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /reserved/);
  response = await call('POST', '/api/links', { ...valid, foreground: '#FFFFFF', background: '#111827' });
  assert.match((await response.json()).error, /darker than the background/);
  response = await call('POST', '/api/links', { ...valid, target: 'javascript:alert(1)' });
  assert.equal(response.status, 400);
  assert.equal(statements.length, 0);
});
test('cross-origin writes are refused', async () => {
  const response = await onRequest({
    request: new Request('https://smartqr.uk/api/links', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: JSON.stringify(valid) }),
    env: { DB: db }
  });
  assert.equal(response.status, 403);
});
