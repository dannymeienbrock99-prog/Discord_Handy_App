import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeFixture, IDS, json } from './fixtures.mjs';
import { sha256 } from '../src/store.mjs';
import { readConfig } from '../src/config.mjs';

test('no configuration reports unconfigured and never fabricates login', t => {
  const f = makeFixture(t);
  f.service.config.configured = false;
  assert.equal(f.service.health().configured, false);
  assert.throws(() => f.service.auth.start('a'.repeat(64)), { kind: 'unconfigured' });
  assert.equal(Object.keys(f.store.data.logins).length, 0);
  assert.equal(readConfig({}).configured, false);
});

test('device claim is bound to verifier and repeats the same encrypted session for two minutes', async t => {
  const f = makeFixture(t), login = await f.login();
  assert.match(login.start.loginId, /^[A-Za-z0-9_-]{16,128}$/);
  assert.match(login.start.displayCode, /^[A-Za-z0-9 -]{4,32}$/);
  assert.equal(login.start.authorizePath, '/oauth/start/' + login.start.loginId);
  assert.equal(f.state.lastTokenFields.redirect_uri, f.config.redirectUri);
  assert.equal(Buffer.from(sha256(f.state.lastTokenFields.code_verifier), 'hex').toString('base64url'), login.oauth.searchParams.get('code_challenge'));
  assert.throws(() => f.service.auth.poll(login.start.loginId, 'x'.repeat(43)), { kind: 'auth' });
  const repeated = f.service.auth.poll(login.start.loginId, login.verifier);
  assert.equal(repeated.sessionToken, login.claim.sessionToken);
  assert.equal(Object.keys(f.store.data.sessions).length, 1);
  const saved = fs.readFileSync(f.store.filename, 'utf8');
  for (const privateValue of [login.verifier, login.claim.sessionToken, 'test-access-token-not-a-real-credential', 'test-refresh-token-not-a-real-credential', f.config.clientSecret, f.config.botToken]) assert.equal(saved.includes(privateValue), false);
  f.restart();
  assert.equal(f.service.auth.poll(login.start.loginId, login.verifier).sessionToken, login.claim.sessionToken);
  f.advance(120_001);
  assert.throws(() => f.service.auth.poll(login.start.loginId, login.verifier), { kind: 'auth' });
  assert.equal(f.service.auth.session(login.claim.sessionToken).userId, IDS.user);
});

test('OAuth state and browser binding reject forged callbacks, missing scopes and replay', async t => {
  const f = makeFixture(t), verifier = 'z'.repeat(43), start = f.service.auth.start(sha256(verifier));
  const browser = f.service.auth.browserStart(start.loginId), url = new URL(browser.url), browserSecret = /^ms_oauth=([^;]+)/.exec(browser.cookie)[1];
  const state = url.searchParams.get('state');
  await assert.rejects(f.service.auth.callback({ state, code: 'fake', browserSecret: 'bad' }), { kind: 'auth' });
  assert.equal(f.state.calls.filter(call => call.route === '/oauth2/token').length, 0);
  await f.service.auth.callback({ state, code: 'fake', browserSecret });
  await assert.rejects(f.service.auth.callback({ state, code: 'fake', browserSecret }), { kind: 'auth' });
  assert.equal(f.state.calls.filter(call => call.route === '/oauth2/token').length, 1);
  const next = f.service.auth.start(sha256(verifier)), nextBrowser = f.service.auth.browserStart(next.loginId);
  f.state.oauthResponses.push(() => json({ access_token: 'test-access-token-different', refresh_token: 'test-refresh-token-different', expires_in: 3600, scope: 'identify' }));
  await assert.rejects(f.service.auth.callback({ state: new URL(nextBrowser.url).searchParams.get('state'), code: 'fake', browserSecret: /^ms_oauth=([^;]+)/.exec(nextBrowser.cookie)[1] }), { kind: 'auth' });
  assert.throws(() => f.service.auth.poll(next.loginId, verifier), { kind: 'auth' });
});

test('cancel, expiry and logout cannot be mistaken for authenticated state', async t => {
  const f = makeFixture(t), verifier = 'Q'.repeat(43), start = f.service.auth.start(sha256(verifier));
  assert.equal(f.service.auth.poll(start.loginId, verifier).status, 'pending');
  f.service.auth.cancel(start.loginId, verifier);
  assert.throws(() => f.service.auth.poll(start.loginId, verifier), { kind: 'auth' });
  const expired = f.service.auth.start(sha256(verifier)); f.advance(600_001);
  assert.throws(() => f.service.auth.browserStart(expired.loginId), { kind: 'auth' });
  const login = await f.login();
  f.service.auth.logout(login.session);
  assert.throws(() => f.service.auth.session(login.claim.sessionToken), { kind: 'auth' });
  assert.throws(() => f.service.auth.poll(login.start.loginId, login.verifier), { kind: 'auth' });
});

test('native display-code character contract holds for independent login requests', t => {
  const f = makeFixture(t);
  for (let i = 0; i < 40; i++) assert.match(f.service.auth.start(sha256('independent-verifier-' + i)).displayCode, /^[A-Za-z0-9 -]{4,32}$/);
});

test('expired Discord tokens refresh once across concurrent reads and remain encrypted', async t => {
  const f = makeFixture(t), { session } = await f.login();
  f.advance(3600_000);
  const before = f.state.calls.filter(call => call.route === '/oauth2/token').length;
  await Promise.all([f.service.auth.userRequest(session.userId, '/users/@me'), f.service.auth.userRequest(session.userId, '/users/@me')]);
  assert.equal(f.state.calls.filter(call => call.route === '/oauth2/token').length, before + 1);
  assert.equal(f.state.lastTokenFields.grant_type, 'refresh_token');
  assert.equal(fs.readFileSync(f.store.filename, 'utf8').includes('test-refresh-token-not-a-real-credential'), false);
});

test('temporary OAuth failures keep tokens and all app sessions; a later refresh can succeed', async t => {
  const f = makeFixture(t), login = await f.login();
  f.advance(3600_000);
  const original = JSON.stringify(f.store.data.users[IDS.user].oauth);
  for (const [response, kind] of [
    [() => new Response('<html>unavailable</html>', { status: 503 }), 'network'],
    [() => new Response('not-json', { status: 200 }), 'network'],
    [() => json({ unavailable: true }, 200), 'network'],
    [() => new Response('<html>limited</html>', { status: 429, headers: { 'retry-after': '2' } }), 'rate_limited'],
    [() => json({ error: 'invalid_client' }, 401), 'unconfigured']
  ]) {
    f.state.oauthResponses.push(response);
    await assert.rejects(f.service.auth.userRequest(IDS.user, '/users/@me'), { kind });
    assert.equal(JSON.stringify(f.store.data.users[IDS.user].oauth), original);
    assert.equal(f.service.auth.session(login.claim.sessionToken).userId, IDS.user);
  }
  const user = await f.service.auth.userRequest(IDS.user, '/users/@me');
  assert.equal(user.id, IDS.user);
  assert.notEqual(JSON.stringify(f.store.data.users[IDS.user].oauth), original);
});

test('confirmed invalid_grant revokes the app sessions that can no longer authenticate', async t => {
  const f = makeFixture(t), login = await f.login(); f.advance(3600_000);
  f.state.oauthResponses.push(() => json({ error: 'invalid_grant' }, 400));
  await assert.rejects(f.service.auth.userRequest(IDS.user, '/users/@me'), { kind: 'auth' });
  assert.equal(f.store.data.users[IDS.user].oauth, undefined);
  assert.throws(() => f.service.auth.session(login.claim.sessionToken), { kind: 'auth' });
});
