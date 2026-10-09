import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { createHttpServer } from '../src/http.mjs';
import { makeFixture, IDS, PNG, imageMeta, postOperation, json } from './fixtures.mjs';
import { sha256 } from '../src/store.mjs';

const OWNER = IDS.outsider;
const APK = Buffer.from('TEST-APK-NOT-INSTALLABLE-RELEASE');
async function serve(t, f) {
  const server = createHttpServer(f.service, { rateLimits: false });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return 'http://127.0.0.1:' + server.address().port;
}
const headers = app => ({ Authorization: 'Bearer ' + app.claim.sessionToken });
async function appLogin(f, id = IDS.user) { f.state.oauthUser = { id, username: 'Konto-' + id, global_name: 'Konto ' + id }; return f.login(); }
async function portalLogin(f, origin, id = IDS.user) {
  f.state.oauthUser = { id, username: 'Konto-' + id, global_name: 'Konto ' + id };
  const start = await fetch(origin + '/portal/login', { redirect: 'manual' }); assert.equal(start.status, 302);
  const url = new URL(start.headers.get('location')), oauthCookie = start.headers.get('set-cookie').split(';')[0];
  const callbackPath = '/portal/callback?state=' + url.searchParams.get('state') + '&code=fake-code';
  const callback = await fetch(origin + callbackPath, { redirect: 'manual', headers: { Cookie: oauthCookie } }); assert.equal(callback.status, 303);
  const fullCookie = callback.headers.getSetCookie().find(value => value.startsWith('ms_portal=')), cookie = fullCookie.split(';')[0];
  const info = await (await fetch(origin + '/portal/api/session', { headers: { Cookie: cookie } })).json();
  return { start, url, oauthCookie, callback, callbackPath, fullCookie, cookie, info,
    headers: { Cookie: cookie, Origin: f.config.publicOrigin, 'X-CSRF-Token': info.csrfToken, 'Content-Type': 'application/json' } };
}
async function register(origin, portal, note = '') {
  const response = await fetch(origin + '/portal/api/register', { method: 'POST', headers: portal.headers, body: JSON.stringify({ note }) });
  assert.equal(response.status, 200); return response.json();
}
const decide = (origin, owner, id, decision, expectedVersion, reason = '') => fetch(origin + '/v2/admin/registrations/' + id + '/decision', {
  method: 'POST', headers: { ...headers(owner), 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, expectedVersion, reason }) });
function installApk(f) { f.config.apkPath = path.join(f.dataDir, 'private-test.apk'); fs.writeFileSync(f.config.apkPath, APK, { mode: 0o600 }); }
async function prepared(t) {
  const f = makeFixture(t, { ownerId: OWNER }), origin = await serve(t, f), user = await appLogin(f), portal = await portalLogin(f, origin), owner = await appLogin(f, OWNER);
  return { f, origin, user, portal, owner };
}

test('portal OAuth uses protected separate cookies, bound PKCE, clean redirect and encrypted session secrets', async t => {
  const f = makeFixture(t, { ownerId: OWNER }), origin = await serve(t, f);
  assert.deepEqual(await (await fetch(origin + '/portal/api/session')).json(), { ok: true, configured: true, authenticated: false, user: null, access: null, csrfToken: null, expiresAt: null,
    download: { available: false, url: '/portal/download', filename: 'Crazy_Batto-Discord-App-2.2.0.apk', version: '2.2.0' } });
  const p = await portalLogin(f, origin);
  assert.equal(p.url.origin, 'https://discord.com'); assert.equal(p.url.searchParams.get('redirect_uri'), f.config.portalRedirectUri);
  assert.equal(p.url.searchParams.get('scope'), 'identify guilds guilds.members.read');
  assert.equal(Buffer.from(sha256(f.state.lastTokenFields.code_verifier), 'hex').toString('base64url'), p.url.searchParams.get('code_challenge'));
  assert.match(p.fullCookie, /HttpOnly; Secure; SameSite=Lax; Path=\/portal;/);
  assert.equal(p.callback.headers.get('location'), '/portal'); assert.equal(await p.callback.text(), '');
  assert.equal(p.info.access.status, 'unregistered'); assert.equal(Object.keys(f.store.data.access.registrations).length, 0);
  const token = p.cookie.slice('ms_portal='.length);
  assert.equal((await fetch(origin + '/v2/session', { headers: { Authorization: 'Bearer ' + token } })).status, 401);
  const raw = fs.readFileSync(f.store.filename, 'utf8'); assert.equal(raw.includes(token), false); assert.equal(raw.includes(p.info.csrfToken), false);
  assert.equal((await fetch(origin + p.callbackPath, { redirect: 'manual', headers: { Cookie: p.oauthCookie } })).status, 401);
  assert.equal(f.state.posts.length, 0);
});

test('forged callbacks, missing binding and portal/device state confusion never call Discord', async t => {
  const f = makeFixture(t, { ownerId: OWNER }), origin = await serve(t, f);
  const portal = f.service.portal.start(), pState = new URL(portal.url).searchParams.get('state');
  assert.equal((await fetch(origin + '/portal/callback?state=' + pState + '&code=fake')).status, 401);
  const confused = await fetch(origin + '/oauth/callback?state=' + pState + '&code=fake', { headers: { Cookie: portal.cookie.split(';')[0].replace('ms_portal_oauth=', 'ms_oauth=') } });
  assert.equal(confused.status, 401);
  const native = f.service.auth.start(sha256('a'.repeat(43))), browser = f.service.auth.browserStart(native.loginId);
  assert.equal((await fetch(origin + '/portal/callback?state=' + new URL(browser.url).searchParams.get('state') + '&code=fake', { headers: { Cookie: browser.cookie.split(';')[0].replace('ms_oauth=', 'ms_portal_oauth=') } })).status, 401);
  assert.equal(f.state.calls.filter(call => call.route === '/oauth2/token').length, 0);
});

test('registration requires current cookie, Origin and CSRF; posted identity or role never grants access', async t => {
  const { f, origin, portal } = await prepared(t);
  const variants = [{ ...portal.headers, Origin: 'https://attacker.example.test' }, { ...portal.headers, Origin: undefined },
    { ...portal.headers, 'X-CSRF-Token': undefined }, { ...portal.headers, 'X-CSRF-Token': 'incorrect' }, { ...portal.headers, 'Sec-Fetch-Site': 'cross-site' }];
  for (const h of variants) {
    for (const key of Object.keys(h)) if (h[key] === undefined) delete h[key];
    assert.equal((await fetch(origin + '/portal/api/register', { method: 'POST', headers: h, body: '{}' })).status, 403);
  }
  assert.equal((await fetch(origin + '/portal/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
  assert.equal(f.store.data.access.revision, 0);
  const response = await fetch(origin + '/portal/api/register', { method: 'POST', headers: portal.headers,
    body: JSON.stringify({ userId: OWNER, status: 'approved', isOwner: true, note: 'Mein Stream-Team' }) });
  assert.equal(response.status, 200); assert.equal((await response.json()).access.status, 'pending');
  assert.equal(f.store.data.access.registrations[OWNER], undefined); assert.equal(f.store.data.access.registrations[IDS.user].note, 'Mein Stream-Team');
  assert.equal(f.store.data.access.audit[0].actorId, IDS.user);
});

test('unregistered/pending accounts retain session status but all ordinary API routes and GET/HEAD APK are blocked', async t => {
  const { f, origin, user, portal } = await prepared(t); installApk(f);
  const session = await (await fetch(origin + '/v2/session', { headers: headers(user) })).json(); assert.equal(session.access.status, 'unregistered');
  await register(origin, portal); const calls = f.state.calls.length;
  for (const [method, route] of [['GET', '/v2/guilds'], ['GET', '/v2/guilds/' + IDS.guild + '/setup'], ['PUT', '/v2/guilds/' + IDS.guild + '/moderator-role'],
    ['GET', '/v2/guilds/' + IDS.guild + '/install'], ['GET', '/v2/guilds/' + IDS.guild + '/events'], ['POST', '/v2/operations'],
    ['GET', '/v2/operations/operation-test-00000001'], ['GET', '/v2/operations/operation-test-00000001/poll'], ['POST', '/v2/operations/operation-test-00000001/retry']]) {
    const response = await fetch(origin + route, { method, headers: headers(user) }); assert.equal(response.status, 403, method + ' ' + route);
    const body = await response.json(); assert.equal(body.kind, 'access'); assert.equal(body.access.status, 'pending');
  }
  for (const method of ['GET', 'HEAD']) {
    const response = await fetch(origin + '/portal/download', { method, headers: { Cookie: portal.cookie } }); assert.equal(response.status, 403); assert.match(response.headers.get('cache-control'), /no-store/);
    if (method === 'HEAD') assert.equal((await response.arrayBuffer()).byteLength, 0);
  }
  assert.equal(f.state.calls.length, calls);
  assert.equal((await fetch(origin + '/v2/auth/logout', { method: 'POST', headers: headers(user) })).status, 200);
  assert.equal((await fetch(origin + '/v2/session', { headers: headers(user) })).status, 401);
});

test('first registrant and Discord manager cannot administer; owner is explicit and approved users stay ordinary', async t => {
  const { f, origin, user, portal, owner } = await prepared(t);
  assert.equal((await register(origin, portal)).access.isOwner, false);
  for (const route of ['/v2/admin/summary', '/v2/admin/registrations']) assert.equal((await fetch(origin + route, { headers: headers(user) })).status, 403);
  assert.equal((await decide(origin, user, IDS.user, 'approve', 1)).status, 403);
  const ownerStatus = await (await fetch(origin + '/v2/session', { headers: headers(owner) })).json();
  assert.equal(ownerStatus.access.status, 'approved'); assert.equal(ownerStatus.access.isOwner, true);
  const summary = await (await fetch(origin + '/v2/admin/summary', { headers: headers(owner) })).json(); assert.equal(summary.pendingCount, 1); assert.equal(summary.revision, 1);
  const list = await (await fetch(origin + '/v2/admin/registrations', { headers: headers(owner) })).json(); assert.equal(list.registrations[0].userId, IDS.user);
  assert.equal((await decide(origin, owner, IDS.user, 'approve', 1)).status, 200);
  assert.equal((await fetch(origin + '/v2/admin/summary', { headers: headers(user) })).status, 403);
  assert.equal((await decide(origin, user, IDS.user, 'revoke', 2)).status, 403);
  assert.equal((await decide(origin, owner, OWNER, 'approve', 1)).status, 403);
  assert.equal(f.state.posts.length, 0);
});

test('approval unlocks private exact APK and API; revocation blocks existing app and browser sessions', async t => {
  const { f, origin, user, portal, owner } = await prepared(t); installApk(f); await register(origin, portal);
  assert.equal((await decide(origin, owner, IDS.user, 'approve', 1, 'Viel Spaß!')).status, 200);
  const info = await (await fetch(origin + '/portal/api/session', { headers: { Cookie: portal.cookie } })).json(); assert.equal(info.download.available, true); assert.equal(info.access.reason, 'Viel Spaß!');
  const download = await fetch(origin + '/portal/download?file=/etc/passwd', { headers: { Cookie: portal.cookie } }); assert.equal(download.status, 200); assert.deepEqual(Buffer.from(await download.arrayBuffer()), APK);
  assert.equal(download.headers.get('content-type'), 'application/vnd.android.package-archive'); assert.equal(download.headers.get('content-disposition'), 'attachment; filename="Crazy_Batto-Discord-App-2.2.0.apk"');
  assert.match(download.headers.get('cache-control'), /private, no-store/); assert.equal(download.headers.get('vary'), 'Cookie');
  const head = await fetch(origin + '/portal/download', { method: 'HEAD', headers: { Cookie: portal.cookie } }); assert.equal(head.status, 200); assert.equal(Number(head.headers.get('content-length')), APK.length); assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal((await fetch(origin + '/v2/guilds', { headers: headers(user) })).status, 200);
  assert.equal((await decide(origin, owner, IDS.user, 'revoke', 2, 'Gesperrt')).status, 200);
  for (const method of ['GET', 'HEAD']) assert.equal((await fetch(origin + '/portal/download', { method, headers: { Cookie: portal.cookie } })).status, 403);
  const denied = await fetch(origin + '/v2/guilds', { headers: headers(user) }); assert.equal(denied.status, 403); assert.equal((await denied.json()).access.status, 'revoked');
  assert.equal((await (await fetch(origin + '/v2/session', { headers: headers(user) })).json()).access.reason, 'Gesperrt');
});

test('duplicate registration is idempotent, rejection/revocation cannot be reset, and stale decisions conflict', async t => {
  const { f, origin, portal, owner } = await prepared(t);
  await register(origin, portal, 'Erster Antrag'); await Promise.all([register(origin, portal, 'A'), register(origin, portal, 'B')]);
  assert.equal(f.store.data.access.revision, 1); assert.equal(f.store.data.access.registrations[IDS.user].note, 'Erster Antrag');
  assert.equal((await decide(origin, owner, IDS.user, 'reject', 1)).status, 200); assert.equal((await register(origin, portal)).access.status, 'rejected');
  const stale = await decide(origin, owner, IDS.user, 'approve', 1); assert.equal(stale.status, 409); assert.equal((await stale.json()).kind, 'conflict');
  assert.equal((await decide(origin, owner, IDS.user, 'approve', 2)).status, 200);
  assert.equal((await decide(origin, owner, IDS.user, 'reject', 3)).status, 409);
  assert.equal((await decide(origin, owner, IDS.user, 'revoke', 3)).status, 200); assert.equal((await register(origin, portal)).access.status, 'revoked');
  assert.equal((await decide(origin, owner, IDS.user, 'approve', 4)).status, 200);
  assert.equal((await decide(origin, owner, IDS.otherGuild, 'approve', 1)).status, 404);
  const audit = f.store.data.access.audit; assert.deepEqual(audit.map(row => row.action), ['register', 'reject', 'approve', 'revoke', 'approve']);
  assert.deepEqual(audit.map(row => row.toVersion), [1, 2, 3, 4, 5]); assert.ok(audit.slice(1).every(row => row.actorId === OWNER));
});

test('registrations, review audit, portal CSRF and existing app sessions survive restart', async t => {
  const { f, origin, user, portal, owner } = await prepared(t); installApk(f); await register(origin, portal);
  assert.equal((await decide(origin, owner, IDS.user, 'approve', 1)).status, 200); const audit = structuredClone(f.store.data.access.audit);
  f.restart(); const restarted = await serve(t, f);
  const info = await (await fetch(restarted + '/portal/api/session', { headers: { Cookie: portal.cookie } })).json(); assert.equal(info.access.status, 'approved'); assert.equal(info.csrfToken, portal.info.csrfToken);
  assert.equal((await fetch(restarted + '/v2/guilds', { headers: headers(user) })).status, 200); assert.equal((await fetch(restarted + '/portal/download', { headers: { Cookie: portal.cookie } })).status, 200);
  await register(restarted, portal); assert.deepEqual(f.store.data.access.audit, audit);
  assert.equal((await decide(restarted, owner, IDS.user, 'revoke', 2)).status, 200); assert.equal((await fetch(restarted + '/v2/guilds', { headers: headers(user) })).status, 403);
});

test('legacy 2.0 database migration requires approval for every existing non-owner account', async t => {
  const f = makeFixture(t, { ownerId: OWNER }), user = await appLogin(f), legacy = structuredClone(f.store.data);
  delete legacy.access; delete legacy.portalSessions; delete legacy.portalLogins;
  f.store.close(); fs.writeFileSync(f.store.filename, JSON.stringify(legacy), { mode: 0o600 }); f.restart(); const origin = await serve(t, f);
  assert.equal((await (await fetch(origin + '/v2/session', { headers: headers(user) })).json()).access.status, 'unregistered');
  assert.equal((await fetch(origin + '/v2/guilds', { headers: headers(user) })).status, 403); assert.equal(f.store.data.access.audit.length, 0);
});

test('missing owner fails closed; changing configured owner removes old operator privileges', async t => {
  const f = makeFixture(t, { env: { OWNER_DISCORD_ID: '' } }), origin = await serve(t, f);
  const health = await (await fetch(origin + '/health')).json(); assert.equal(health.configured, false); assert.equal(health.accessControl, true); assert.equal(health.appVersion, '2.2.0');
  assert.equal((await fetch(origin + '/portal/login', { redirect: 'manual' })).status, 503);
  assert.equal((await fetch(origin + '/v2/auth/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge: 'a'.repeat(64) }) })).status, 503);
  assert.equal((await (await fetch(origin + '/portal/api/session')).json()).configured, false);
  const g = makeFixture(t, { ownerId: OWNER }), owner = await appLogin(g, OWNER), secondOrigin = await serve(t, g);
  assert.equal((await fetch(secondOrigin + '/v2/admin/summary', { headers: headers(owner) })).status, 200);
  g.config.ownerDiscordId = IDS.user;
  assert.equal((await fetch(secondOrigin + '/v2/admin/summary', { headers: headers(owner) })).status, 403); assert.equal((await decide(secondOrigin, owner, IDS.otherGuild, 'approve', 1)).status, 403);
});

test('portal logout is protected, expired cookies and native tokens cannot download GET or HEAD', async t => {
  const { f, origin, user } = await prepared(t), portal = await portalLogin(f, origin, OWNER); installApk(f);
  assert.equal((await fetch(origin + '/portal/download', { headers: { Cookie: 'ms_portal=' + user.claim.sessionToken } })).status, 401);
  assert.equal((await fetch(origin + '/portal/api/logout', { method: 'POST', headers: { Cookie: portal.cookie, 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  const logout = await fetch(origin + '/portal/api/logout', { method: 'POST', headers: portal.headers, body: '{}' }); assert.equal(logout.status, 200); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  for (const method of ['GET', 'HEAD']) assert.equal((await fetch(origin + '/portal/download', { method, headers: { Cookie: portal.cookie } })).status, 401);
  assert.equal((await (await fetch(origin + '/portal/api/session', { headers: { Cookie: portal.cookie } })).json()).authenticated, false);
  const expires = await portalLogin(f, origin, OWNER); f.advance(f.config.portalSessionLifetimeMs + 1);
  assert.equal((await fetch(origin + '/portal/download', { method: 'HEAD', headers: { Cookie: expires.cookie } })).status, 401);
  assert.equal((await (await fetch(origin + '/portal/api/session', { headers: { Cookie: expires.cookie } })).json()).authenticated, false);
});

test('APK cannot be fetched publicly; missing and symlinked releases never expose arbitrary private bytes', async t => {
  const { f, origin } = await prepared(t), portal = await portalLogin(f, origin, OWNER);
  f.config.apkPath = path.join(f.dataDir, 'missing.apk'); assert.equal((await fetch(origin + '/portal/download', { headers: { Cookie: portal.cookie } })).status, 503);
  for (const route of ['/portal/download', '/releases/Crazy_Batto-Discord-App-2.2.0.apk', '/portal/assets/Crazy_Batto-Discord-App-2.2.0.apk']) assert.ok([401, 404].includes((await fetch(origin + route)).status));
  const secret = path.join(f.dataDir, 'private-secret'); fs.writeFileSync(secret, 'DO-NOT-EXPOSE'); fs.symlinkSync(secret, f.config.apkPath);
  assert.equal((await (await fetch(origin + '/portal/api/session', { headers: { Cookie: portal.cookie } })).json()).download.available, false);
  const response = await fetch(origin + '/portal/download', { headers: { Cookie: portal.cookie } }); assert.equal(response.status, 503); assert.equal((await response.text()).includes('DO-NOT-EXPOSE'), false);
});

// The request is already authenticated before its body finishes. The actual
// decision must still recheck the current operator session at commit time.
test('logout while an admin decision JSON body is arriving prevents the queued decision', { timeout: 5000 }, async t => {
  const { f, origin, portal, owner } = await prepared(t); await register(origin, portal);
  let entered, release; const bodyEntered = new Promise(resolve => { entered = resolve; });
  const bodyWait = new Promise(resolve => { release = resolve; });
  const original = f.service.access.requireOwner.bind(f.service.access); let calls = 0;
  f.service.access.requireOwner = session => { original(session); if (++calls === 1) entered(); };
  const payload = JSON.stringify({ decision: 'approve', expectedVersion: 1 });
  const responsePromise = new Promise((resolve, reject) => {
    const request = http.request(origin + '/v2/admin/registrations/' + IDS.user + '/decision', { method: 'POST', headers: { ...headers(owner), 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, response => {
      const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks)) }));
    });
    request.on('error', reject); request.write(payload.slice(0, 10)); bodyWait.then(() => request.end(payload.slice(10)));
  });
  await bodyEntered; assert.equal((await fetch(origin + '/v2/auth/logout', { method: 'POST', headers: headers(owner) })).status, 200); release();
  const response = await responsePromise; assert.equal(response.status, 401); assert.equal(response.body.kind, 'auth'); assert.equal(f.store.data.access.registrations[IDS.user].status, 'pending');
});

test('revocation during asynchronous Discord permission read blocks the first POST', { timeout: 5000 }, async t => {
  const { f, origin, user, portal, owner } = await prepared(t); await register(origin, portal); assert.equal((await decide(origin, owner, IDS.user, 'approve', 1)).status, 200);
  let release, reached; const block = new Promise(resolve => { release = resolve; }), arrived = new Promise(resolve => { reached = resolve; });
  const original = f.service.auth.userRequest.bind(f.service.auth);
  f.service.auth.userRequest = async (id, route) => { if (id === IDS.user && route.endsWith('/member')) { reached(); await block; } return original(id, route); };
  const pending = fetch(origin + '/v2/operations', { method: 'POST', headers: { ...headers(user), 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: postOperation() }) });
  await arrived; assert.equal((await decide(origin, owner, IDS.user, 'revoke', 2)).status, 200); release();
  const response = await pending; assert.equal(response.status, 403); assert.equal((await response.json()).kind, 'access'); assert.equal(f.state.posts.length, 0); assert.equal(Object.keys(f.store.data.operations).length, 0);
});

test('revocation after image delivery preserves acknowledgement and blocks the second poll message', async t => {
  const { f, origin, user, portal, owner } = await prepared(t); await register(origin, portal); assert.equal((await decide(origin, owner, IDS.user, 'approve', 1)).status, 200);
  const operation = postOperation({ category: 'poll', image: imageMeta(PNG), data: { title: 'Umfrage', text: 'Mit Bild', poll: { question: 'Dabei?', answers: ['Ja', 'Nein'], durationHours: 24 } } });
  f.state.postResponses.push(() => { f.service.access.decide(owner.session, IDS.user, { decision: 'revoke', expectedVersion: 2 }); return json({ id: '811111111111111111', channel_id: IDS.channel, attachments: [{ url: 'https://cdn.discordapp.com/attachments/a/b/bild.png' }] }); });
  const body = new FormData(); body.set('operation', JSON.stringify(operation)); body.set('image', new Blob([PNG], { type: 'image/png' }), operation.image.name);
  const response = await fetch(origin + '/v2/operations', { method: 'POST', headers: headers(user), body });
  assert.equal(response.status, 403); assert.equal((await response.json()).kind, 'access'); assert.equal(f.state.posts.length, 1);
  const phases = f.store.data.operations[operation.id].phases; assert.equal(phases[0].status, 'sent'); assert.equal(phases[0].messageId, '811111111111111111'); assert.equal(phases[1].status, 'pending');
});

test('pagination, filters, field validation and cross-origin session reads enforce their boundaries', async t => {
  const { f, origin, user, portal, owner } = await prepared(t); await register(origin, portal); f.advance(1000);
  const second = await portalLogin(f, origin, IDS.manager); await register(origin, second);
  let data = await (await fetch(origin + '/v2/admin/registrations?limit=1', { headers: headers(owner) })).json(); assert.equal(data.total, 2); assert.equal(data.nextOffset, 1); assert.equal(data.registrations[0].userId, IDS.manager);
  data = await (await fetch(origin + '/v2/admin/registrations?limit=1&offset=1', { headers: headers(owner) })).json(); assert.equal(data.nextOffset, null); assert.equal(data.registrations[0].userId, IDS.user);
  for (const query of ['limit=0', 'limit=201', 'offset=-1', 'status=owner']) assert.equal((await fetch(origin + '/v2/admin/registrations?' + query, { headers: headers(owner) })).status, 400);
  assert.equal((await fetch(origin + '/v2/admin/registrations', { headers: headers(user) })).status, 403);
  assert.equal((await fetch(origin + '/portal/api/session', { headers: { Cookie: portal.cookie, Origin: 'https://attacker.example.test' } })).status, 403);
  assert.equal((await fetch(origin + '/portal/api/register', { method: 'POST', headers: portal.headers, body: JSON.stringify({ note: 'X'.repeat(501) }) })).status, 400); assert.equal(f.store.data.access.revision, 2);
});
