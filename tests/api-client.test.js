import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest, SESSION_MESSAGE } from '../src/api.js';

const json = (body, init = {}) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, ...init });

test('returns parsed data on success', async () => {
  assert.deepEqual(await apiRequest('/api/links', {}, async () => json({ links: [] })), { links: [] });
});
test('network failure (Access redirect blocked by CORS) shows the session message', async () => {
  await assert.rejects(apiRequest('/api/links', {}, async () => { throw new TypeError('Failed to fetch'); }), { message: SESSION_MESSAGE });
});
test('an HTML sign-in page shows the session message', async () => {
  await assert.rejects(apiRequest('/api/links', {}, async () => new Response('<html>', { headers: { 'content-type': 'text/html' } })), { message: SESSION_MESSAGE });
});
test('401 shows the session message but server errors keep their text', async () => {
  await assert.rejects(apiRequest('/x', {}, async () => json({ error: 'Sign in' }, { status: 401 })), { message: SESSION_MESSAGE });
  await assert.rejects(apiRequest('/x', {}, async () => json({ error: 'That scan link is already in use.' }, { status: 409 })), { message: 'That scan link is already in use.' });
});
