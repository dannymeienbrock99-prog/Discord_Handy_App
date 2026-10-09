import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { createHttpServer } from '../src/http.mjs';
import { SITE_MAX_BYTES, SITE_MAX_IMAGE_BYTES, normalizeSiteContent } from '../src/site.mjs';
import { makeFixture, IDS, PNG } from './fixtures.mjs';
import { sha256 } from '../src/store.mjs';

const OWNER = IDS.outsider;
const publicJpeg = new URL('../public/background-batto.jpeg', import.meta.url);
const authHeaders = app => ({ Authorization: 'Bearer ' + app.claim.sessionToken });
const uploadBody = (bytes = PNG, filename = 'Privates-Portrait.png', mimeType = 'image/png') => ({ filename, mimeType, dataBase64: bytes.toString('base64') });
async function login(f, id) { f.state.oauthUser = { id, username: 'Konto-' + id, global_name: 'Konto ' + id }; return f.login(); }
async function serve(t, f) {
  const server = createHttpServer(f.service, { rateLimits: false }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return 'http://127.0.0.1:' + server.address().port;
}
function fixtureImages(f) {
  const folder = path.join(f.dataDir, 'test-public'); fs.mkdirSync(folder, { recursive: true });
  fs.copyFileSync(publicJpeg, path.join(folder, 'brand-dragon.jpeg')); fs.writeFileSync(path.join(folder, 'discord-app.png'), PNG);
  f.service.site.assetsDirectory = folder;
}
async function prepared(t) {
  const f = makeFixture(t, { ownerId: OWNER, emptySite: true }); fixtureImages(f);
  const owner = await login(f, OWNER), user = await login(f, IDS.user), origin = await serve(t, f);
  return { f, owner, user, origin };
}
const request = (origin, app, route, method = 'GET', body) => fetch(origin + route, { method,
  headers: { ...(app ? authHeaders(app) : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const save = (origin, owner, expectedVersion, content) => request(origin, owner, '/v2/admin/site', 'POST', { expectedVersion, content });
const publish = (origin, owner, expectedVersion) => request(origin, owner, '/v2/admin/site/publish', 'POST', { expectedVersion });
const upload = (origin, owner, body = uploadBody()) => request(origin, owner, '/v2/admin/site/images', 'POST', body);

test('an empty initial template keeps personal sections blank; only owner sees drafts and media management', async t => {
  const { f, owner, user, origin } = await prepared(t);
  const publicResult = await (await request(origin, null, '/site/api/content')).json();
  assert.equal(publicResult.ok, true); assert.equal(publicResult.content.heroTitle, 'Crazy_Batto Discord App');
  assert.equal(publicResult.content.about.text, ''); assert.equal(publicResult.content.about.imageId, null);
  assert.deepEqual(publicResult.content.setup.components, []); assert.deepEqual(publicResult.content.setup.images, []); assert.deepEqual(publicResult.content.apps, []);
  assert.equal(publicResult.version, 1); assert.equal(publicResult.publishedAt, null); assert.deepEqual(publicResult.images, []);
  assert.equal(publicResult.draft, undefined); assert.equal(publicResult.audit, undefined);
  for (const app of [null, user]) {
    const expected = app ? 403 : 401;
    assert.equal((await request(origin, app, '/v2/admin/site')).status, expected);
    assert.equal((await save(origin, app, 1, publicResult.content)).status, expected);
    assert.equal((await publish(origin, app, 1)).status, expected);
    assert.equal((await upload(origin, app)).status, expected);
  }
  const admin = await (await request(origin, owner, '/v2/admin/site')).json();
  assert.equal(admin.images.length, 2); assert.equal(admin.version, 1); assert.equal(admin.quota.maxImageBytes, SITE_MAX_IMAGE_BYTES);
  assert.ok(admin.images.every(row => row.builtIn && row.width > 0 && row.height > 0 && row.size > 0));
  const health = f.service.health(); assert.equal(health.app, 'Modstempel'); assert.equal(health.displayName, 'Crazy_Batto Discord App'); assert.equal(health.appVersion, '2.2.0'); assert.equal(health.siteContent, true);
  assert.equal(f.state.posts.length, 0);
});

test('save is a private versioned draft; publish uses that saved draft with no silent overwrite', async t => {
  const { f, owner, origin } = await prepared(t), original = f.service.site.publicContent();
  const content = structuredClone(original.content); content.about.text = 'Noch nicht öffentlich';
  let response = await save(origin, owner, 1, content); assert.equal(response.status, 200);
  const first = await response.json(); assert.equal(first.version, 2); assert.equal(first.publishedVersion, 1); assert.equal(first.draft.about.text, content.about.text); assert.equal(first.published.about.text, '');
  assert.deepEqual(f.service.site.publicContent(), original);
  assert.equal((await save(origin, owner, 1, content)).status, 409); assert.equal((await publish(origin, owner, 1)).status, 409);
  assert.equal((await request(origin, owner, '/v2/admin/site/publish', 'POST', { expectedVersion: 2, content: original.content })).status, 400);
  f.advance(500); response = await publish(origin, owner, 2); assert.equal(response.status, 200);
  const published = await response.json(); assert.equal(published.version, 3); assert.equal(published.publishedVersion, 3); assert.equal(published.publishedAt, f.now());
  assert.equal(f.service.site.publicContent().content.about.text, content.about.text);
  content.about.text = 'Zweite private Fassung'; assert.equal((await save(origin, owner, 3, content)).status, 200);
  assert.equal(f.service.site.publicContent().content.about.text, 'Noch nicht öffentlich');
  assert.deepEqual(f.store.data.site.audit.map(row => row.action), ['save', 'publish', 'save']); assert.equal(f.state.posts.length, 0);
});

test('uploaded image is private before publish, byte-exact afterward, and filenames never become public', async t => {
  const { f, owner, user, origin } = await prepared(t);
  const response = await upload(origin, owner); assert.equal(response.status, 200);
  const result = await response.json(), image = result.image, id = 'img_' + sha256(PNG);
  assert.equal(image.id, id); assert.equal(image.filename, 'Privates-Portrait.png'); assert.equal(image.mimeType, 'image/png'); assert.equal(image.width, 1); assert.equal(image.height, 1); assert.equal(image.size, PNG.length); assert.equal(image.builtIn, false);
  assert.equal(image.url, '/v2/admin/site/images/' + id); assert.equal(f.store.data.site.version, 1);
  assert.equal(fs.statSync(f.service.site.directory).mode & 0o777, 0o700); assert.equal(fs.statSync(f.service.site.imageFile(id).filename).mode & 0o777, 0o600);
  for (const method of ['GET', 'HEAD']) {
    assert.equal((await request(origin, null, '/site/media/' + id, method)).status, 404);
    assert.equal((await request(origin, null, image.url, method)).status, 401);
    assert.equal((await request(origin, user, image.url, method)).status, 403);
  }
  const preview = await request(origin, owner, image.url); assert.equal(preview.status, 200); assert.equal(preview.headers.get('vary'), 'Authorization'); assert.deepEqual(Buffer.from(await preview.arrayBuffer()), PNG);
  const content = structuredClone(f.store.data.site.draft); content.about.imageId = id; content.about.imageAlt = 'Mein Foto';
  assert.equal((await save(origin, owner, 1, content)).status, 200);
  assert.equal((await request(origin, null, '/site/media/' + id)).status, 404);
  assert.equal((await publish(origin, owner, 2)).status, 200);
  const live = await (await request(origin, null, '/site/api/content')).json(); assert.equal(live.images.length, 1); assert.equal(live.images[0].filename, undefined); assert.equal(live.images[0].url, '/site/media/' + id);
  assert.equal(JSON.stringify(live).includes('Privates-Portrait'), false); assert.equal(live.images[0].url.includes('test-public'), false);
  const media = await request(origin, null, live.images[0].url); assert.equal(media.status, 200); assert.equal(media.headers.get('content-type'), 'image/png'); assert.equal(media.headers.get('x-content-type-options'), 'nosniff'); assert.match(media.headers.get('cache-control'), /no-store/);
  assert.deepEqual(Buffer.from(await media.arrayBuffer()), PNG);
  const head = await request(origin, null, live.images[0].url, 'HEAD'); assert.equal(head.status, 200); assert.equal(Number(head.headers.get('content-length')), PNG.length); assert.equal((await head.arrayBuffer()).byteLength, 0);
});

test('published and draft references block deletion; unpublishing blocks the old media URL immediately', async t => {
  const { f, owner, origin } = await prepared(t), image = (await (await upload(origin, owner)).json()).image;
  const route = '/v2/admin/site/images/' + image.id, empty = structuredClone(f.store.data.site.draft), content = structuredClone(empty);
  content.setup.images.push({ imageId: image.id, alt: '', caption: '' });
  assert.equal((await save(origin, owner, 1, content)).status, 200); assert.equal((await request(origin, owner, route, 'DELETE')).status, 409);
  assert.equal((await publish(origin, owner, 2)).status, 200); assert.equal((await save(origin, owner, 3, empty)).status, 200);
  assert.equal((await request(origin, owner, route, 'DELETE')).status, 409); assert.equal((await request(origin, null, '/site/media/' + image.id)).status, 200);
  assert.equal((await publish(origin, owner, 4)).status, 200);
  for (const method of ['GET', 'HEAD']) assert.equal((await request(origin, null, '/site/media/' + image.id, method)).status, 404);
  const removed = await request(origin, owner, route, 'DELETE'); assert.equal(removed.status, 200); assert.equal((await removed.json()).quota.usedBytes, 0);
  assert.equal(f.store.data.site.version, 5); assert.equal(fs.readdirSync(f.service.site.directory).length, 0); assert.equal((await request(origin, owner, route)).status, 404);
  assert.equal((await request(origin, owner, '/v2/admin/site/images/brand-dragon', 'DELETE')).status, 409);
});

test('deduplicated uploads count once and use immutable safe storage paths', async t => {
  const { f, owner, origin } = await prepared(t), first = await (await upload(origin, owner)).json();
  const repeated = await (await upload(origin, owner, uploadBody(PNG, 'Anderer-Name.png'))).json();
  assert.equal(repeated.image.id, first.image.id); assert.equal(repeated.image.filename, first.image.filename); assert.equal(repeated.quota.usedBytes, PNG.length);
  assert.equal(Object.keys(f.store.data.site.images).length, 1); assert.equal(f.store.data.site.audit.filter(row => row.action === 'upload').length, 1);
  assert.deepEqual(fs.readdirSync(f.service.site.directory), [first.image.id + '.png']);
  for (const filename of ['../portrait.png', 'folder/image.png', '..\\image.png', 'line\nbreak.png', '.', '']) assert.equal((await upload(origin, owner, uploadBody(PNG, filename))).status, 400);
});

test('upload rejects malformed or disguised formats, noncanonical base64, oversized images and pixel bombs', async t => {
  const { f, owner, origin } = await prepared(t);
  const invalid = [
    { ...uploadBody(), mimeType: 'image/svg+xml' }, { ...uploadBody(), mimeType: 'text/html' }, uploadBody(Buffer.from('<html>hello</html>')),
    uploadBody(PNG, 'image.jpg', 'image/jpeg'), { ...uploadBody(), dataBase64: 'data:image/png;base64,' + PNG.toString('base64') },
    { ...uploadBody(), dataBase64: PNG.toString('base64') + '\n' }, { ...uploadBody(), dataBase64: '@@@=' },
    uploadBody(PNG.subarray(0, -4)), uploadBody(Buffer.concat([PNG, Buffer.from('trailing')])), { ...uploadBody(), extra: true }
  ];
  const bomb = Buffer.from(PNG); bomb.writeUInt32BE(10000, 16); bomb.writeUInt32BE(10000, 20); invalid.push(uploadBody(bomb));
  const emptyData = Buffer.concat([PNG.subarray(0, 33), PNG.subarray(-12)]); invalid.push(uploadBody(emptyData));
  for (const body of invalid) assert.equal((await upload(origin, owner, body)).status, 400);
  assert.equal((await upload(origin, owner, uploadBody(Buffer.alloc(SITE_MAX_IMAGE_BYTES + 1)))).status, 413);
  assert.equal(Object.keys(f.store.data.site.images).length, 0); assert.equal(fs.readdirSync(f.service.site.directory).length, 0); assert.equal(f.state.posts.length, 0);
});

test('real JPEG and lossy/lossless WebP files are accepted with server-derived dimensions', async t => {
  const { f, owner, origin } = await prepared(t);
  // Tiny actual 2x3 WebP encoder outputs exercise both supported frame formats.
  const files = [{ bytes: fs.readFileSync(publicJpeg), filename: 'Motiv.jpeg', mimeType: 'image/jpeg', width: 1122, height: 1402 },
    { bytes: Buffer.from('UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoCAAMAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=', 'base64'), filename: 'Foto.webp', mimeType: 'image/webp', width: 2, height: 3 },
    { bytes: Buffer.from('UklGRhwAAABXRUJQVlA4TA8AAAAvAYAAAAcQ/Y/+ByKi/wEA', 'base64'), filename: 'Grafik.webp', mimeType: 'image/webp', width: 2, height: 3 }];
  for (const file of files) {
    const response = await upload(origin, owner, uploadBody(file.bytes, file.filename, file.mimeType)); assert.equal(response.status, 200);
    const result = await response.json(); assert.equal(result.image.mimeType, file.mimeType); assert.equal(result.image.width, file.width); assert.equal(result.image.height, file.height);
    assert.deepEqual(fs.readFileSync(f.service.site.imageFile(result.image.id).filename), file.bytes);
  }
});

test('content validation preserves blank sections but refuses unknown fields, excessive rows and unsafe links', async t => {
  const { f, owner, origin } = await prepared(t), empty = structuredClone(f.store.data.site.draft);
  empty.about.title = ''; empty.setup.title = ''; assert.doesNotThrow(() => normalizeSiteContent(empty));
  const app = { id: 'meine-app', name: 'Meine App', description: '', imageId: null, imageAlt: '', url: null, buttonLabel: '' };
  const variants = [content => { content.extra = 'will not silently vanish'; }, content => { delete content.heroTitle; }, content => { content.about.text = 'x'.repeat(5001); },
    content => { content.setup.components = Array.from({ length: 25 }, () => ({ label: 'CPU', value: 'x' })); }, content => { content.about.imageId = 'img_' + 'f'.repeat(64); },
    content => { content.apps = [{ ...app }, { ...app }]; }, content => { content.setup.images = [{ imageId: null, alt: '', caption: '' }]; },
    content => { content.heroText = '\u0000'; }];
  for (const mutation of variants) { const content = structuredClone(empty); mutation(content); assert.equal((await save(origin, owner, 1, content)).status, 400); }
  for (const url of ['javascript:alert(1)', 'data:text/html,anything', 'http://example.test', '//example.test', '/admin', 'https://user:password@example.test', 'https://example.test:8080', 'https://example.test\\anything', 'https://example.test/' + '漢'.repeat(120)]) {
    const content = structuredClone(empty); content.apps = [{ ...app, url }]; assert.equal((await save(origin, owner, 1, content)).status, 400, url);
  }
  const safe = structuredClone(empty); safe.apps = [{ ...app, url: '/portal' }]; safe.socialLinks = [{ label: 'Mein Profil', url: 'https://example.test/profil?q=1#info' }];
  assert.equal((await save(origin, owner, 1, safe)).status, 200); assert.equal(f.store.data.site.version, 2);
});

test('binary and JSON request limits fail before a write and quota limits include all private drafts', async t => {
  const { f, owner, origin } = await prepared(t), content = structuredClone(f.store.data.site.draft);
  content.heroText = 'x'.repeat(70 * 1024); assert.equal((await save(origin, owner, 1, content)).status, 413);
  assert.equal((await request(origin, owner, '/v2/admin/site/images', 'POST', { ...uploadBody(), dataBase64: 'A'.repeat(6 * 1024 * 1024) })).status, 413);
  const oldQuota = f.service.site.quota.bind(f.service.site); f.service.site.quota = () => ({ ...oldQuota(), usedBytes: SITE_MAX_BYTES });
  assert.equal((await upload(origin, owner)).status, 409); assert.equal(Object.keys(f.store.data.site.images).length, 0); assert.equal(fs.readdirSync(f.service.site.directory).length, 0);
  f.service.site.quota = oldQuota;
  for (let i = 0; i < 100; i++) { const id = 'img_' + i.toString(16).padStart(64, '0'); f.store.data.site.images[id] = { id, mimeType: 'image/png', width: 1, height: 1, size: 1, filename: 'x.png' }; }
  assert.equal((await upload(origin, owner)).status, 409); assert.equal(fs.readdirSync(f.service.site.directory).length, 0);
});

test('site draft, publication, images and audit survive restart; old app data migrate additively', async t => {
  const { f, owner, origin } = await prepared(t), image = (await (await upload(origin, owner)).json()).image;
  const content = structuredClone(f.store.data.site.draft); content.about.imageId = image.id; content.about.text = 'Veröffentlicht';
  await save(origin, owner, 1, content); await publish(origin, owner, 2); content.about.text = 'Privater Nachtrag'; await save(origin, owner, 3, content);
  const before = structuredClone(f.store.data.site), users = structuredClone(f.store.data.users); f.restart(); fixtureImages(f);
  assert.deepEqual(f.store.data.site, before); assert.equal(f.service.site.publicContent().content.about.text, 'Veröffentlicht'); assert.equal(f.service.site.admin(owner.session).draft.about.text, 'Privater Nachtrag');
  assert.deepEqual(f.store.data.users, users); assert.deepEqual(fs.readFileSync(f.service.site.imageFile(image.id).filename), PNG);
  const legacy = structuredClone(f.store.data); delete legacy.site; f.store.close(); fs.writeFileSync(f.store.filename, JSON.stringify(legacy)); f.restart(); fixtureImages(f);
  assert.deepEqual(f.store.data.users, users); assert.equal(f.store.data.site.version, 1); assert.equal(f.store.data.site.published.about.text, ''); assert.deepEqual(fs.readdirSync(f.service.site.directory), []);
});

test('missing or symlinked private images cannot publish or expose another file', async t => {
  const { f, owner, origin } = await prepared(t), image = (await (await upload(origin, owner)).json()).image;
  const content = structuredClone(f.store.data.site.draft); content.about.imageId = image.id; await save(origin, owner, 1, content);
  const target = f.service.site.imageFile(image.id).filename, secret = path.join(f.dataDir, 'not-a-website-image'); fs.writeFileSync(secret, 'PRIVATE-DO-NOT-EXPOSE');
  fs.unlinkSync(target); assert.equal((await publish(origin, owner, 2)).status, 409);
  fs.symlinkSync(secret, target); assert.equal((await publish(origin, owner, 2)).status, 409); assert.equal((await upload(origin, owner)).status, 503);
  const preview = await request(origin, owner, image.url); assert.equal(preview.status, 503); assert.equal((await preview.text()).includes('PRIVATE-DO-NOT-EXPOSE'), false);
  assert.equal((await request(origin, null, '/site/media/' + image.id)).status, 404); assert.equal(f.store.data.site.version, 2); assert.equal(fs.readFileSync(secret, 'utf8'), 'PRIVATE-DO-NOT-EXPOSE');
});

test('failed image metadata commit exposes nothing and startup removes orphaned generated files', async t => {
  const { f, owner, origin } = await prepared(t), original = f.store.transaction.bind(f.store);
  f.store.transaction = () => { throw new Error('test: failed atomic database write'); };
  const response = await upload(origin, owner); assert.equal(response.status, 500); assert.equal(Object.keys(f.store.data.site.images).length, 0);
  const id = 'img_' + sha256(PNG); assert.equal(fs.readdirSync(f.service.site.directory).length, 1); assert.equal((await request(origin, null, '/site/media/' + id)).status, 404);
  f.store.transaction = original; f.restart(); fixtureImages(f); assert.equal(fs.readdirSync(f.service.site.directory).length, 0); assert.equal(f.store.data.site.audit.length, 0);
});

test('expired or replaced owner cannot save, publish, upload or read private previews', async t => {
  const { f, owner, origin } = await prepared(t), image = (await (await upload(origin, owner)).json()).image, content = structuredClone(f.store.data.site.draft);
  f.config.ownerDiscordId = IDS.user;
  assert.equal((await save(origin, owner, 1, content)).status, 403); assert.equal((await publish(origin, owner, 1)).status, 403); assert.equal((await upload(origin, owner)).status, 403); assert.equal((await request(origin, owner, image.url)).status, 403);
  f.config.ownerDiscordId = OWNER; f.advance(f.config.sessionLifetimeMs + 1);
  assert.equal((await save(origin, owner, 1, content)).status, 401); assert.equal((await publish(origin, owner, 1)).status, 401); assert.equal((await upload(origin, owner)).status, 401); assert.equal((await request(origin, owner, image.url)).status, 401);
  assert.equal(f.store.data.site.version, 1); assert.equal(f.state.posts.length, 0);
});

test('owner logout while upload body arrives blocks the write after initial authentication', { timeout: 5000 }, async t => {
  const { f, owner, origin } = await prepared(t);
  let entered, release; const began = new Promise(resolve => { entered = resolve; }), bodyWait = new Promise(resolve => { release = resolve; });
  const original = f.service.access.requireOwner.bind(f.service.access); let calls = 0;
  f.service.access.requireOwner = session => { original(session); if (++calls === 1) entered(); };
  const payload = JSON.stringify(uploadBody());
  const responsePromise = new Promise((resolve, reject) => {
    const pending = http.request(origin + '/v2/admin/site/images', { method: 'POST', headers: { ...authHeaders(owner), 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, response => {
      const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks)) }));
    });
    pending.on('error', reject); pending.write(payload.slice(0, 10)); bodyWait.then(() => pending.end(payload.slice(10)));
  });
  await began; await request(origin, owner, '/v2/auth/logout', 'POST'); release();
  const response = await responsePromise; assert.equal(response.status, 401); assert.equal(response.body.kind, 'auth'); assert.equal(Object.keys(f.store.data.site.images).length, 0); assert.deepEqual(fs.readdirSync(f.service.site.directory), []);
});

test('owner authorization is revalidated inside the same draft or publication commit', async t => {
  const { f, owner, origin } = await prepared(t), content = structuredClone(f.store.data.site.draft), original = f.store.transaction.bind(f.store);
  f.store.transaction = change => { f.config.ownerDiscordId = IDS.user; return original(change); };
  assert.equal((await save(origin, owner, 1, content)).status, 403); assert.equal(f.store.data.site.version, 1);
  f.config.ownerDiscordId = OWNER; assert.equal((await publish(origin, owner, 1)).status, 403); assert.equal(f.store.data.site.version, 1);
  f.store.transaction = original;
});

test('cross-origin admin requests and guessed filesystem/static paths cannot reveal drafts or uploads', async t => {
  const { f, owner, origin } = await prepared(t), image = (await (await upload(origin, owner)).json()).image;
  const cross = await fetch(origin + '/v2/admin/site', { headers: { ...authHeaders(owner), Origin: 'https://elsewhere.example.test' } }); assert.equal(cross.status, 403);
  for (const route of ['/site/assets/site-default.json', '/site/assets/' + image.id + '.png', '/site/images/' + image.id + '.png', '/site/media/../../modstempel.json', '/site/media/%2e%2e%2fmodstempel.json', '/site/assets/%2e%2e%2fsite-default.json', '/site/api/draft', '/site/api/images', '/data/site-images/' + image.id + '.png']) {
    const response = await request(origin, null, route); assert.equal(response.status, 404, route); assert.equal((await response.text()).includes('Privates-Portrait'), false);
  }
  assert.equal((await request(origin, null, '/portal')).status, 200); assert.equal(f.state.posts.length, 0);
});
