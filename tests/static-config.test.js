import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

test('every static file in public/ bypasses the redirect function', () => {
  const routes = JSON.parse(readFileSync('public/_routes.json', 'utf8'));
  for (const file of readdirSync('public')) {
    if (file.startsWith('_')) continue;
    assert.ok(routes.exclude.includes(`/${file}`), `/${file} must be excluded in public/_routes.json`);
  }
  for (const needed of ['/', '/admin', '/admin/*', '/assets/*']) assert.ok(routes.exclude.includes(needed), needed);
  assert.deepEqual(routes.include, ['/*']);
});
test('security headers are configured', () => {
  const headers = readFileSync('public/_headers', 'utf8');
  for (const needle of ['Content-Security-Policy', "frame-ancestors 'none'", 'X-Content-Type-Options: nosniff']) assert.ok(headers.includes(needle), needle);
});
