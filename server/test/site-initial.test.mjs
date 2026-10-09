import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createHttpServer } from '../src/http.mjs';
import { Site, SITE_MAX_IMAGE_BYTES, SITE_MAX_IMAGES } from '../src/site.mjs';
import { Store, sha256 } from '../src/store.mjs';
import { makeFixture, IDS, PNG } from './fixtures.mjs';

const PORTRAIT_ID = 'img_43ce2e759bd796f53da84451067aa816aa88af14bff0596fcc9775b8ad6e9ffc';
const BIOGRAPHY = 'Crazy_Batto\nInhaber und Gründer von Team TABH\n36 Jahre alt\nSocial-Media-Content-Creator für Hardware und Gaming';
const initialContent = () => JSON.parse(fs.readFileSync(new URL('../site-default.json', import.meta.url), 'utf8'));
const portrait = () => fs.readFileSync(new URL('../site-default-images/ich.jpeg', import.meta.url));
const uploadBody = bytes => ({ filename: 'Eigene-Galerie.png', mimeType: 'image/png', dataBase64: bytes.toString('base64') });
const request = (origin, owner, route, method = 'GET', body) => fetch(origin + route, {
  method, headers: { ...(owner ? { Authorization: 'Bearer ' + owner.claim.sessionToken } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) })
});
async function serve(t, f) {
  const server = createHttpServer(f.service, { rateLimits: false }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return 'http://127.0.0.1:' + server.address().port;
}
function isolatedInitial(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crazy-batto-initial-test-'));
  const defaultFile = path.join(root, 'site-default.json'), defaultImagesDirectory = path.join(root, 'site-default-images');
  fs.mkdirSync(defaultImagesDirectory);
  fs.writeFileSync(defaultFile, JSON.stringify(initialContent()));
  fs.copyFileSync(new URL('../site-default-images/manifest.json', import.meta.url), path.join(defaultImagesDirectory, 'manifest.json'));
  fs.writeFileSync(path.join(defaultImagesDirectory, 'ich.jpeg'), portrait());
  const store = new Store(path.join(root, 'data'));
  t.after(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, store, defaultFile, defaultImagesDirectory,
    start: () => new Site({}, store, null, { defaultFile, defaultImagesDirectory }),
    manifest(value) { fs.writeFileSync(path.join(defaultImagesDirectory, 'manifest.json'), JSON.stringify(value)); },
    content(value) { fs.writeFileSync(defaultFile, JSON.stringify(value)); }
  };
}

test('packaged introduction initializes the exact approved text and byte-exact editable portrait', async t => {
  const f = makeFixture(t), origin = await serve(t, f), original = portrait();
  assert.equal(original.length, 86319); assert.equal('img_' + sha256(original), PORTRAIT_ID);
  const response = await request(origin, null, '/site/api/content'); assert.equal(response.status, 200);
  const published = await response.json();
  assert.equal(published.content.about.title, 'Über mich'); assert.equal(published.content.about.text, BIOGRAPHY);
  assert.equal(published.content.about.imageId, PORTRAIT_ID); assert.equal(published.content.about.imageAlt, 'Porträt von Crazy_Batto');
  assert.equal(published.content.heroText, ''); assert.equal(published.content.setup.text, '');
  assert.deepEqual(published.content.setup.components, []); assert.deepEqual(published.content.setup.images, []);
  assert.deepEqual(published.content.apps, []); assert.deepEqual(published.content.socialLinks, []);
  assert.equal(published.version, 1); assert.equal(published.publishedAt, null);
  assert.equal(published.images.length, 1); assert.equal(published.images[0].id, PORTRAIT_ID);
  assert.equal(published.images[0].builtIn, false); assert.equal(published.images[0].filename, undefined);
  assert.equal(published.images[0].url, '/site/media/' + PORTRAIT_ID);
  const media = await request(origin, null, published.images[0].url); assert.equal(media.status, 200);
  assert.equal(media.headers.get('content-type'), 'image/jpeg'); assert.match(media.headers.get('cache-control'), /no-store/);
  assert.deepEqual(Buffer.from(await media.arrayBuffer()), original);
  const owner = await f.login(), api = await (await request(origin, owner, '/v2/admin/site')).json();
  const row = api.images.find(image => image.id === PORTRAIT_ID);
  assert.equal(row.builtIn, false); assert.equal(row.filename, 'ich.jpeg'); assert.equal(row.size, original.length);
  assert.ok(row.width > 0 && row.height > 0); assert.equal(row.mimeType, 'image/jpeg');
  assert.equal(row.url, '/v2/admin/site/images/' + PORTRAIT_ID); assert.equal(api.quota.usedBytes, original.length);
  assert.equal(api.images.length, 3); assert.deepEqual(api.draft, api.published);
  assert.deepEqual(fs.readFileSync(f.service.site.imageFile(PORTRAIT_ID).filename), original);
  assert.equal(fs.statSync(f.service.site.directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(f.service.site.imageFile(PORTRAIT_ID).filename).mode & 0o777, 0o600);
  assert.equal(f.state.posts.length, 0);
});

test('existing published content, private drafts, uploads and app records survive restart without consulting initial files', async t => {
  const f = makeFixture(t), owner = await f.login(), site = f.service.site;
  const image = site.upload(owner.session, uploadBody(PNG)).image;
  const content = structuredClone(site.publicContent().content); content.about.text = 'Eigener veröffentlichter Text';
  site.save(owner.session, { expectedVersion: 1, content }); site.publish(owner.session, { expectedVersion: 2 });
  content.about.text = 'Noch privater Nachtrag'; content.setup.images = [{ imageId: image.id, alt: '', caption: '' }];
  site.save(owner.session, { expectedVersion: 3, content });
  const before = structuredClone(f.store.data), files = fs.readdirSync(site.directory).sort();
  const corruptInitialFile = path.join(f.dataDir, 'invalid-initial.json'); fs.writeFileSync(corruptInitialFile, '{broken');
  new Site(f.config, f.store, f.service.access, { defaultFile: corruptInitialFile, defaultImagesDirectory: corruptInitialFile });
  assert.deepEqual(f.store.data, before);
  f.restart(); assert.deepEqual(f.store.data, before); assert.deepEqual(fs.readdirSync(f.service.site.directory).sort(), files);
  assert.equal(f.service.site.publicContent().content.about.text, 'Eigener veröffentlichter Text');
  assert.equal(f.service.site.admin(owner.session).draft.about.text, 'Noch privater Nachtrag');
  assert.deepEqual(fs.readFileSync(f.service.site.imageFile(image.id).filename), PNG);
  assert.deepEqual(fs.readFileSync(f.service.site.imageFile(PORTRAIT_ID).filename), portrait());
  const origin = await serve(t, f);
  assert.equal((await request(origin, null, '/site/media/' + image.id)).status, 404);
  assert.equal((await request(origin, null, '/site/media/' + PORTRAIT_ID)).status, 200);
  assert.equal(f.state.posts.length, 0);
});

test('removing the portrait from publication blocks its old URL and deleted content is never reimported', async t => {
  const f = makeFixture(t), owner = await f.login(), origin = await serve(t, f), route = '/v2/admin/site/images/' + PORTRAIT_ID;
  const content = structuredClone(f.service.site.publicContent().content); content.about.imageId = null; content.about.imageAlt = ''; content.about.text = '';
  assert.equal((await request(origin, owner, route, 'DELETE')).status, 409);
  assert.equal((await request(origin, owner, '/v2/admin/site', 'POST', { expectedVersion: 1, content })).status, 200);
  assert.equal((await request(origin, null, '/site/media/' + PORTRAIT_ID)).status, 200);
  assert.equal((await request(origin, owner, '/v2/admin/site/publish', 'POST', { expectedVersion: 2 })).status, 200);
  for (const method of ['GET', 'HEAD']) assert.equal((await request(origin, null, '/site/media/' + PORTRAIT_ID, method)).status, 404);
  for (const path of ['/site-default-images/ich.jpeg', '/site-default-images/manifest.json', '/site/assets/ich.jpeg', '/site/assets/site-default-images/ich.jpeg', '/site/assets/../site-default-images/ich.jpeg', '/site/assets/%2e%2e%2fsite-default-images/ich.jpeg']) {
    assert.equal((await request(origin, null, path)).status, 404, path);
  }
  const removed = await request(origin, owner, route, 'DELETE'); assert.equal(removed.status, 200); assert.equal((await removed.json()).quota.usedBytes, 0);
  const before = structuredClone(f.store.data); f.restart(); assert.deepEqual(f.store.data, before);
  assert.deepEqual(fs.readdirSync(f.service.site.directory), []); assert.equal(f.service.site.publicContent().content.about.text, '');
  const restartedOrigin = await serve(t, f); assert.equal((await request(restartedOrigin, null, '/site/media/' + PORTRAIT_ID)).status, 404);
  assert.equal((await request(restartedOrigin, owner, route)).status, 404); assert.equal(f.state.posts.length, 0);
});

test('unused manifest images are not imported or exposed and a missing template keeps the blank fallback', t => {
  const f = isolatedInitial(t), pngId = 'img_' + sha256(PNG);
  const manifest = JSON.parse(fs.readFileSync(path.join(f.defaultImagesDirectory, 'manifest.json'), 'utf8'));
  manifest.images.push({ id: pngId, filename: 'Unused-and-not-present.png', mimeType: 'image/png' }); f.manifest(manifest);
  const site = f.start(); assert.deepEqual(Object.keys(f.store.data.site.images), [PORTRAIT_ID]);
  assert.throws(() => site.imageFile(pngId), error => error.status === 404); assert.equal(site.quota().usedBytes, portrait().length);
  f.store.transaction(draft => { delete draft.site; }); fs.unlinkSync(f.defaultFile);
  const fallback = f.start(); assert.equal(fallback.publicContent().content.about.text, '');
  assert.equal(fallback.publicContent().content.about.imageId, null); assert.deepEqual(fallback.publicContent().images, []);
  assert.deepEqual(fs.readdirSync(fallback.directory), []);
});

test('invalid initial images, unsafe paths and excess limits fail before committing site data', async t => {
  const cases = [
    ['digest mismatch', f => fs.writeFileSync(path.join(f.defaultImagesDirectory, 'ich.jpeg'), fs.readFileSync(new URL('../public/background-batto.jpeg', import.meta.url)))],
    ['filename traversal', f => f.manifest({ images: [{ id: PORTRAIT_ID, filename: '../ich.jpeg', mimeType: 'image/jpeg' }] })],
    ['image symlink', f => { const target = path.join(f.root, 'original.jpeg'); fs.renameSync(path.join(f.defaultImagesDirectory, 'ich.jpeg'), target); fs.symlinkSync(target, path.join(f.defaultImagesDirectory, 'ich.jpeg')); }],
    ['manifest symlink', f => { const target = path.join(f.root, 'manifest.json'); fs.renameSync(path.join(f.defaultImagesDirectory, 'manifest.json'), target); fs.symlinkSync(target, path.join(f.defaultImagesDirectory, 'manifest.json')); }],
    ['directory symlink', f => { const target = path.join(f.root, 'other-directory'); fs.renameSync(f.defaultImagesDirectory, target); fs.symlinkSync(target, f.defaultImagesDirectory); }],
    ['oversized bytes', f => fs.writeFileSync(path.join(f.defaultImagesDirectory, 'ich.jpeg'), Buffer.alloc(SITE_MAX_IMAGE_BYTES + 1))],
    ['too many images', f => f.manifest({ images: Array.from({ length: SITE_MAX_IMAGES + 1 }, (_, i) => ({ id: 'img_' + i.toString(16).padStart(64, '0'), filename: 'a.jpeg', mimeType: 'image/jpeg' })) })],
    ['missing portrait file', f => fs.unlinkSync(path.join(f.defaultImagesDirectory, 'ich.jpeg'))],
    ['disguised markup', f => fs.writeFileSync(path.join(f.defaultImagesDirectory, 'ich.jpeg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ['too many pixels', f => {
      const bytes = Buffer.from(PNG); bytes.writeUInt32BE(10000, 16); bytes.writeUInt32BE(10000, 20);
      const id = 'img_' + sha256(bytes), content = initialContent(); content.about.imageId = id; f.content(content);
      f.manifest({ images: [{ id, filename: 'large.png', mimeType: 'image/png' }] }); fs.writeFileSync(path.join(f.defaultImagesDirectory, 'large.png'), bytes);
    }]
  ];
  for (const [name, alter] of cases) await t.test(name, t => {
    const f = isolatedInitial(t); alter(f); assert.throws(() => f.start());
    assert.equal(f.store.data.site, undefined); assert.deepEqual(fs.readdirSync(path.join(f.store.dataDir, 'site-images')), []);
  });
});

test('failed initial metadata commit leaves no published references and can resume without changing source bytes', t => {
  const f = isolatedInitial(t), originalTransaction = f.store.transaction.bind(f.store);
  f.store.transaction = () => { throw new Error('test: initial database write failed'); };
  assert.throws(() => f.start(), /initial database write failed/); assert.equal(f.store.data.site, undefined);
  assert.equal(JSON.parse(fs.readFileSync(f.store.filename, 'utf8')).site, undefined);
  assert.deepEqual(fs.readdirSync(path.join(f.store.dataDir, 'site-images')), [PORTRAIT_ID + '.jpg']);
  f.store.transaction = originalTransaction; const site = f.start();
  assert.equal(site.publicContent().content.about.text, BIOGRAPHY); assert.equal(site.publicContent().images.length, 1);
  assert.equal(site.quota().usedBytes, portrait().length); assert.deepEqual(fs.readFileSync(site.imageFile(PORTRAIT_ID).filename), portrait());
});
