import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { isAuthorised, clearKeyCache } from '../functions/[[path]].js';

const b64 = input => Buffer.from(input).toString('base64url');
const TEAM = 'team.cloudflareaccess.com', AUD = 'aud-123';
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'k1' };
const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };

async function token(claims = {}, header = { alg: 'RS256', kid: 'k1' }) {
  const payload = { iss: `https://${TEAM}`, aud: [AUD], exp: Date.now() / 1000 + 600, email: 'staff@smartsoho.co.uk', ...claims };
  for (const key of Object.keys(payload)) if (payload[key] === undefined) delete payload[key];
  const signing = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(signing));
  return `${signing}.${Buffer.from(signature).toString('base64url')}`;
}
const req = jwt => new Request('https://smartqr.uk/api/links', { headers: { 'Cf-Access-Jwt-Assertion': jwt } });
let fetches;
beforeEach(() => {
  clearKeyCache(); fetches = 0;
  globalThis.fetch = async () => { fetches++; return Response.json({ keys: [jwk] }); };
});

test('accepts a valid token and returns its claims', async () => {
  const result = await isAuthorised(req(await token()), env);
  assert.equal(result.email, 'staff@smartsoho.co.uk');
});
test('caches Access signing keys between requests', async () => {
  await isAuthorised(req(await token()), env);
  await isAuthorised(req(await token()), env);
  assert.equal(fetches, 1);
});
test('rejects expired, missing-expiry, wrong audience and tampered tokens', async () => {
  assert.equal(await isAuthorised(req(await token({ exp: Date.now() / 1000 - 5 })), env), false);
  assert.equal(await isAuthorised(req(await token({ exp: undefined })), env), false);
  assert.equal(await isAuthorised(req(await token({ aud: ['other'] })), env), false);
  assert.equal(await isAuthorised(req(await token({ nbf: Date.now() / 1000 + 600 })), env), false);
  const good = await token();
  const [h, , s] = good.split('.');
  assert.equal(await isAuthorised(req(`${h}.${b64(JSON.stringify({ iss: `https://${TEAM}`, aud: [AUD], exp: Date.now() / 1000 + 600, email: 'evil@x.com' }))}.${s}`), env), false);
});
test('an unknown key id does not trigger repeated key downloads', async () => {
  const unknown = await token({}, { alg: 'RS256', kid: 'nope' });
  assert.equal(await isAuthorised(req(unknown), env), false);
  assert.equal(await isAuthorised(req(unknown), env), false);
  assert.equal(fetches, 1);
});
test('a failing key download rejects instead of throwing', async () => {
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.equal(await isAuthorised(req(await token()), env), false);
});
