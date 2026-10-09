import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHttpServer } from '../src/http.mjs';
import { parseMultipart } from '../src/multipart.mjs';
import { makeFixture, IDS, PNG, imageMeta, postOperation } from './fixtures.mjs';
import { sha256 } from '../src/store.mjs';

async function serve(t, fixture) {
  const server = createHttpServer(fixture.service, { rateLimits: false });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return 'http://127.0.0.1:' + server.address().port;
}

test('HTTP unconfigured, auth failure, not_found and origin errors retain the public JSON contract', async t => {
  const f = makeFixture(t), login = await f.login(), origin = await serve(t, f);
  const denied = await fetch(origin + '/v2/guilds');
  assert.equal(denied.status, 401); assert.equal((await denied.json()).kind, 'auth');
  const missing = await fetch(origin + '/v2/operations/not-existing-operation-001', { headers: { Authorization: 'Bearer ' + login.claim.sessionToken } });
  assert.equal(missing.status, 404); assert.deepEqual(await missing.json(), { ok: false, kind: 'not_found', message: 'Dieser Auftrag ist für dein Konto nicht vorhanden.' });
  const foreign = await fetch(origin + '/v2/session', { headers: { Authorization: 'Bearer ' + login.claim.sessionToken, Origin: 'https://foreign.example.test' } });
  assert.equal(foreign.status, 403);
  f.config.configured = false;
  const health = await (await fetch(origin + '/health')).json();
  assert.equal(health.configured, false); assert.equal(health.app, 'Modstempel'); assert.equal(health.apiVersion, 2);
  const start = await fetch(origin + '/v2/auth/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge: sha256('test-device-verifier-of-correct-length') }) });
  assert.equal(start.status, 503); assert.equal((await start.json()).kind, 'unconfigured');
});

test('real HTTP multipart upload reaches the mocked Discord API unchanged and repeated JSON resumes the same ID', async t => {
  const f = makeFixture(t), login = await f.login(), origin = await serve(t, f);
  const operation = postOperation({ image: imageMeta(PNG) });
  const body = new FormData();
  body.set('operation', JSON.stringify(operation)); body.set('image', new Blob([PNG], { type: 'image/png' }), operation.image.name);
  const response = await fetch(origin + '/v2/operations', { method: 'POST', headers: { Authorization: 'Bearer ' + login.claim.sessionToken }, body });
  assert.equal(response.status, 200);
  const sent = await response.json(); assert.equal(sent.operation.status, 'sent');
  assert.deepEqual(f.state.posts[0].bytes, PNG);
  const repeated = await fetch(origin + '/v2/operations', { method: 'POST', headers: { Authorization: 'Bearer ' + login.claim.sessionToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ operation }) });
  assert.deepEqual(await repeated.json(), sent); assert.equal(f.state.posts.length, 1);
  const stored = await fetch(origin + '/v2/operations/' + operation.id, { headers: { Authorization: 'Bearer ' + login.claim.sessionToken } });
  assert.equal((await stored.json()).operation.messageId, sent.operation.messageId);
  assert.equal(f.state.posts.length, 1);
});

test('HTTP login only redirects to Discord and callback needs its protected browser cookie', async t => {
  const f = makeFixture(t), origin = await serve(t, f), verifier = 'f'.repeat(43);
  const start = await (await fetch(origin + '/v2/auth/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge: sha256(verifier) }) })).json();
  const browser = await fetch(origin + start.authorizePath, { redirect: 'manual' });
  assert.equal(browser.status, 302);
  const redirect = new URL(browser.headers.get('location'));
  assert.equal(redirect.origin, 'https://discord.com'); assert.equal(redirect.pathname, '/oauth2/authorize');
  assert.equal(redirect.searchParams.get('scope'), 'identify guilds guilds.members.read');
  assert.match(browser.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Lax/);
  const callbackPath = '/oauth/callback?state=' + redirect.searchParams.get('state') + '&code=fake-http-code';
  const unbound = await fetch(origin + callbackPath); assert.equal(unbound.status, 401);
  const cookie = browser.headers.get('set-cookie').split(';')[0];
  const callback = await fetch(origin + callbackPath, { headers: { Cookie: cookie } });
  assert.equal(callback.status, 200); assert.match(await callback.text(), /Bestätigtes Konto/);
  const poll = await (await fetch(origin + '/v2/auth/poll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ loginId: start.loginId, verifier }) })).json();
  assert.equal(poll.status, 'authorized'); assert.equal(poll.user.id, IDS.user);
  assert.equal(f.state.posts.length, 0);
});

test('multipart parser rejects duplicated fields and incomplete upload terminators', () => {
  const type = 'multipart/form-data; boundary=test-boundary';
  const field = '--test-boundary\r\nContent-Disposition: form-data; name="operation"\r\n\r\n{}\r\n';
  assert.throws(() => parseMultipart(Buffer.from(field + '--test-boundary'), type), { kind: 'validation' });
  assert.throws(() => parseMultipart(Buffer.from(field + field + '--test-boundary--\r\n'), type), { kind: 'validation' });
});
