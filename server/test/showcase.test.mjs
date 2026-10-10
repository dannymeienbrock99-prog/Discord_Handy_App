import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createHttpServer } from '../src/http.mjs';
import { makeFixture, IDS } from './fixtures.mjs';
import { sha256 } from '../src/store.mjs';

const showcaseDir = fileURLToPath(new URL('../public/showcase/', import.meta.url));
const pages = ['index.html', 'altes-setup.html', 'gaming-setup.html', 'software.html', 'discord-app.html', 'registrierung.html'];

async function serve(t, fixture) {
  const server = createHttpServer(fixture.service, { rateLimits: false });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return 'http://127.0.0.1:' + server.address().port;
}

function strictCsp(response) {
  const csp = response.headers.get('content-security-policy');
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /style-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
}

test('six showcase pages and portal aliases serve complete live markup with strict CSP; the CMS remains separate', async t => {
  const f = makeFixture(t), origin = await serve(t, f);
  const routes = new Map(pages.map(filename => ['/' + filename, filename]));
  routes.set('/', 'index.html'); routes.set('/portal', 'registrierung.html'); routes.set('/portal/', 'registrierung.html');
  for (const [route, filename] of routes) {
    const expected = fs.readFileSync(path.join(showcaseDir, filename), 'utf8');
    const response = await fetch(origin + route);
    assert.equal(response.status, 200, route); strictCsp(response);
    assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
    const html = await response.text();
    assert.equal(html, expected, route);
    assert.match(html, /id=["']cb-website["']/);
    assert.match(html, /["']\/assets\/site\.css["']/);
    assert.match(html, /["']\/assets\/site\.js["']/);
    assert.doesNotMatch(html, /<style\b|\sstyle\s*=|<script(?![^>]*\bsrc=)[^>]*>\s*[^<\s]/i);
    if (filename === 'registrierung.html') assert.match(html, /data-portal-mode=["']live["']/);
    const head = await fetch(origin + route, { method: 'HEAD' });
    assert.equal(head.status, 200, route); strictCsp(head);
    assert.equal(Number(head.headers.get('content-length')), Buffer.byteLength(expected));
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    assert.equal((await fetch(origin + route, { method: 'POST' })).status, 405, route);
  }
  for (const route of ['/site', '/site/']) {
    const response = await fetch(origin + route); assert.equal(response.status, 200, route);
    const html = await response.text();
    assert.match(html, /\/site\/assets\/site\.js/);
    assert.match(html, /id="about-text"/);
    assert.doesNotMatch(html, /id=["']cb-website["']/);
  }
  const content = await (await fetch(origin + '/site/api/content')).json();
  assert.equal(content.ok, true); assert.equal(content.draft, undefined);
  assert.equal(Object.keys(f.store.data.portalSessions).length, 0);
  assert.equal(Object.keys(f.store.data.access.registrations).length, 0);
  assert.equal(f.state.calls.length, 0);
});

test('every packaged website image and script has an explicit public asset route and correct bytes', async t => {
  const f = makeFixture(t), origin = await serve(t, f);
  const mimeTypes = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
  const directory = path.join(showcaseDir, 'assets');
  const files = fs.readdirSync(directory).filter(name => Object.hasOwn(mimeTypes, path.extname(name)));
  assert.equal(files.length, 27, '25 supplied images/animations and the two website code files');
  for (const name of files) {
    const response = await fetch(origin + '/assets/' + name);
    assert.equal(response.status, 200, name); strictCsp(response);
    assert.equal(response.headers.get('content-type'), mimeTypes[path.extname(name)], name);
    const expected = fs.readFileSync(path.join(directory, name));
    assert.equal(Number(response.headers.get('content-length')), expected.length, name);
    assert.equal(sha256(Buffer.from(await response.arrayBuffer())), sha256(expected), name);
  }
  const head = await fetch(origin + '/assets/header.gif', { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal((await head.arrayBuffer()).byteLength, 0);
  for (const method of ['POST', 'PUT', 'DELETE']) assert.equal((await fetch(origin + '/assets/site.css', { method })).status, 405, method);
  assert.equal(f.state.calls.length, 0);
});

test('new website routes expose no source material, private APK or arbitrary filesystem paths', async t => {
  const f = makeFixture(t), origin = await serve(t, f);
  const blocked = [
    '/assets/marble-gold-prompt.txt', '/assets/README.md', '/assets/site-default.json',
    '/assets/../site-default.json', '/assets/%2e%2e%2fsite-default.json',
    '/assets/%252e%252e%252fsite-default.json', '/assets/..%5csite-default.json',
    '/assets/site.css/extra', '/assets//site.css', '/public/showcase/index.html',
    '/showcase/index.html', '/quellcode/build.py', '/registrierung.html/extra',
    '/assets/Crazy_Batto-Discord-App-2.2.0.apk', '/Crazy_Batto-Discord-App-2.2.0.apk',
    '/releases/Crazy_Batto-Discord-App-2.2.0.apk', '/assets/../../releases/Crazy_Batto-Discord-App-2.2.0.apk'
  ];
  for (const route of blocked) assert.equal((await fetch(origin + route)).status, 404, route);
  for (const method of ['GET', 'HEAD']) assert.equal((await fetch(origin + '/portal/download', { method })).status, 401, method);
  assert.equal((await fetch(origin + '/v2/admin/registrations')).status, 401);
  assert.equal((await fetch(origin + '/v2/admin/site')).status, 401);
  assert.equal(f.state.calls.length, 0);
});

test('the new registration view preserves the portal callback, cookie path and pending download gate', async t => {
  const f = makeFixture(t, { ownerId: IDS.outsider }), origin = await serve(t, f);
  f.config.apkPath = path.join(f.dataDir, 'private-test.apk');
  fs.writeFileSync(f.config.apkPath, 'TEST-APK-NOT-AN-INSTALLABLE-RELEASE', { mode: 0o600 });
  const start = await fetch(origin + '/portal/login', { redirect: 'manual' }); assert.equal(start.status, 302);
  const discordUrl = new URL(start.headers.get('location'));
  assert.equal(discordUrl.origin, 'https://discord.com');
  const oauthCookie = start.headers.get('set-cookie').split(';')[0];
  const callback = await fetch(origin + '/portal/callback?state=' + discordUrl.searchParams.get('state') + '&code=fake-showcase-code', {
    redirect: 'manual', headers: { Cookie: oauthCookie }
  });
  assert.equal(callback.status, 303); assert.equal(callback.headers.get('location'), '/portal');
  const fullCookie = callback.headers.getSetCookie().find(value => value.startsWith('ms_portal='));
  assert.match(fullCookie, /HttpOnly; Secure; SameSite=Lax; Path=\/portal;/);
  const cookie = fullCookie.split(';')[0];
  const session = await (await fetch(origin + '/portal/api/session', { headers: { Cookie: cookie } })).json();
  assert.equal(session.authenticated, true); assert.equal(session.access.status, 'unregistered');
  for (const route of ['/portal', '/registrierung.html']) {
    const view = await fetch(origin + route, { headers: { Cookie: cookie } });
    assert.equal(view.status, 200); assert.match(await view.text(), /data-portal-mode=["']live["']/);
  }
  const registered = await fetch(origin + '/portal/api/register', {
    method: 'POST', headers: { Cookie: cookie, Origin: f.config.publicOrigin, 'X-CSRF-Token': session.csrfToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ note: 'Zugang über die neue Registrierungsseite' })
  });
  assert.equal(registered.status, 200); assert.equal((await registered.json()).access.status, 'pending');
  const pending = await (await fetch(origin + '/portal/api/session', { headers: { Cookie: cookie } })).json();
  assert.equal(pending.access.status, 'pending'); assert.equal(pending.download.available, false);
  for (const method of ['GET', 'HEAD']) {
    const download = await fetch(origin + '/portal/download', { method, headers: { Cookie: cookie } });
    assert.equal(download.status, 403, method); assert.match(download.headers.get('cache-control'), /no-store/);
  }
  assert.equal(f.state.posts.length, 0);
});
