import test from 'node:test';
import assert from 'node:assert/strict';
import { normalisePath, validTarget, isAuthorised, onRequest } from '../functions/[[path]].js';

test('legacy mixed-case paths remain intact', () => {
  assert.equal(normalisePath('/ARC/BASEcamp/flythrough/'), 'ARC/BASEcamp/flythrough');
  assert.equal(normalisePath('Borough-yards/RentSpace/YourPopUpSpaceQR'), 'Borough-yards/RentSpace/YourPopUpSpaceQR');
  assert.equal(normalisePath('/by.html'), 'by.html');
  assert.equal(normalisePath('/other.html'), null);
  assert.equal(normalisePath('api/links'), null);
  assert.equal(normalisePath('../admin'), null);
});
test('only ordinary web destinations are accepted', () => {
  assert.equal(validTarget('https://example.com/page'), true);
  assert.equal(validTarget('javascript:alert(1)'), false);
  assert.equal(validTarget('https://user:password@example.com'), false);
});
test('management API fails closed without Access settings', async () => {
  assert.equal(await isAuthorised(new Request('https://smartqr.uk/api/links'), {}), false);
  const result = await onRequest({ request: new Request('https://smartqr.uk/api/links'), env: {}, next: () => { throw Error('unexpected'); } });
  assert.equal(result.status, 401);
});
test('public scan redirects and never caches the target', async () => {
  const db = { prepare: () => ({ bind: path => ({ first: async () => path === 'ARC/BASEcamp/flythrough' ? { target: 'https://example.com/video' } : null }) }) };
  const context = { request: new Request('https://smartqr.uk/ARC/BASEcamp/flythrough/index.html'), env: { DB: db }, next: () => { throw Error('unexpected'); } };
  const result = await onRequest(context);
  assert.equal(result.status, 302);
  assert.equal(result.headers.get('location'), 'https://example.com/video');
  assert.equal(result.headers.get('cache-control'), 'no-store');
});
test('the legacy by.html URL remains a public redirect', async () => {
  const db = { prepare: () => ({ bind: path => ({ first: async () => path === 'by.html' ? { target: 'https://ftw.boroughyards.com/' } : null }) }) };
  const context = { request: new Request('https://smartqr.uk/by.html'), env: { DB: db }, next: () => { throw Error('unexpected'); } };
  const result = await onRequest(context);
  assert.equal(result.status, 302);
  assert.equal(result.headers.get('location'), 'https://ftw.boroughyards.com/');
});
