'use strict';
// Real local HTTP backend and browser; only Discord identity is the existing mock fixture.
// Every published example below exists solely inside a disposable QA database.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { once } = require('node:events');
const { pathToFileURL } = require('node:url');
const { chromium } = require(require.resolve('playwright', { paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES] }));
const root = path.resolve(__dirname, '..'), output = path.join(__dirname, 'site-screens');
const tests = [], errors = [], externalRequests = [], unexpectedDiscordCalls = [], cleanup = [];
const safeExample = id => ({ id, name: 'Beispielprojekt im lokalen Layouttest', description: '', imageId: null, imageAlt: '', url: null, buttonLabel: '' });
async function run() {
  const { makeFixture, IDS } = await import(pathToFileURL(path.join(root, 'server/test/fixtures.mjs')));
  const { createHttpServer } = await import(pathToFileURL(path.join(root, 'server/src/http.mjs')));
  const fixture = makeFixture({ after: callback => cleanup.push(callback) }, { ownerId: IDS.outsider, emptySite: true });
  fixture.state.oauthUser = { id: IDS.outsider, username: 'qa-betreiber', global_name: 'Lokaler QA-Betreiber' };
  const owner = await fixture.login();
  // Only the setup login above uses the synthetic identity fixture. Website
  // operations must never reach Discord, including seemingly harmless GETs.
  for (const method of ['request', 'tokenExchange']) fixture.service.discord[method] = async () => {
    unexpectedDiscordCalls.push(method); throw new Error('Unexpected Discord call during website integration');
  };
  const server = createHttpServer(fixture.service, { rateLimits: false });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const request = async (route, method, body) => {
    const response = await fetch(origin + route, { method: method || 'GET', headers: { Authorization: 'Bearer ' + owner.claim.sessionToken, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.equal(response.status, 200, method + ' ' + route);
    return response.json();
  };
  let browser;
  try {
    await fs.mkdir(output, { recursive: true });
    browser = await chromium.launch({ headless: true, executablePath: process.env.MODSTEMPEL_CHROMIUM || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--disable-gpu'] });
    const context = await browser.newContext({ viewport: { width: 1536, height: 1024 }, locale: 'de-DE' });
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      externalRequests.push(route.request().url()); return route.abort();
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/'); await page.waitForLoadState('networkidle');
    assert.equal(await page.title(), 'Crazy_Batto Discord App');
    assert.equal(await page.locator('#hero-title').innerText(), 'Crazy_Batto\nDiscord App');
    for (const id of ['ueber-mich', 'mein-setup', 'meine-apps', 'registration-end', 'social-links']) assert.equal(await page.locator('#' + id).isVisible(), false, id + ' must stay absent in default');
    assert.equal(await page.locator('.section-nav').isVisible(), false);
    assert.equal(await page.locator('#site-notice').isVisible(), false);
    assert.equal(await page.locator('.hero-art img').evaluate(img => img.complete && img.naturalWidth === 1122), true);
    const seed = await request('/site/api/content'); assert.deepEqual(seed.content.apps, []); assert.deepEqual(seed.content.setup.components, []); assert.equal(seed.content.about.text, '');
    await page.screenshot({ path: path.join(output, 'website-default-desktop.png') });
    await fs.writeFile(path.join(output, 'website-default-copy.txt'), (await page.locator('body').innerText()) + '\n');
    tests.push('real public HTTP page: empty personal fields stay hidden, original dragon and exact renamed app');
    const defaultCopy = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
    assert.equal(defaultCopy, 'Zum Inhalt Crazy_Batto Zur Registrierung Crazy_Batto Discord App Mit Discord registrieren. Nach meiner Freigabe kannst du die Android-App herunterladen. Zugang anfragen Schon registriert? Status ansehen Crazy_Batto Zur Registrierung');
    tests.push('default visible-copy lock has no invented biography, setup, projects or placeholders');
    await page.locator('.hero-cta').click(); await page.waitForURL(origin + '/portal');
    await page.waitForFunction(() => document.getElementById('login-link').getAttribute('aria-disabled') === 'false');
    assert.equal(await page.locator('#login-link').getAttribute('href'), '/portal/login');
    assert.match(await page.locator('#welcome-title').innerText(), /Crazy_Batto\nDiscord App/);
    assert.equal(await page.locator('#download-section').isVisible(), false);
    await page.locator('.portal-header .brand').click(); await page.waitForURL(origin + '/');
    tests.push('public registration links open actual protected portal and portal brand returns to website');
    for (const width of [320, 390, 620, 860, 1024, 1536]) {
      await page.setViewportSize({ width, height: width < 620 ? 844 : 1024 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'default overflow ' + width);
      assert.equal(await page.locator('.hero-cta').isVisible(), true);
      if (width === 390) await page.screenshot({ path: path.join(output, 'website-default-mobile.png'), fullPage: true });
    }
    tests.push('default site responsive at 320/390/620/860/1024/1536');

    const bytes = await fs.readFile(path.join(root, 'server/public/site/brand-dragon.jpeg'));
    let admin = await request('/v2/admin/site');
    const uploaded = await request('/v2/admin/site/images', 'POST', { filename: 'Nur-lokaler-QA-Upload.jpeg', mimeType: 'image/jpeg', dataBase64: bytes.toString('base64') });
    const imageId = uploaded.image.id, publicImage = '/site/media/' + imageId;
    const uploadedPng = await request('/v2/admin/site/images', 'POST', { filename: 'Nur-lokaler-QA-Upload.png', mimeType: 'image/png', dataBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAE0lEQVR4nGP8z8DAwMDAxIBMAQAUQAEF3SN5DgAAAABJRU5ErkJggg==' });
    const uploadedWebp = await request('/v2/admin/site/images', 'POST', { filename: 'Nur-lokaler-QA-Upload.webp', mimeType: 'image/webp', dataBase64: 'UklGRhwAAABXRUJQVlA4TA8AAAAvAYAAAAcQ/Y/+ByKi/wEA' });
    const allUploads = [{ image: uploaded.image, bytes, width: 1122, height: 1402 },
      { image: uploadedPng.image, bytes: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAE0lEQVR4nGP8z8DAwMDAxIBMAQAUQAEF3SN5DgAAAABJRU5ErkJggg==', 'base64'), width: 2, height: 3 },
      { image: uploadedWebp.image, bytes: Buffer.from('UklGRhwAAABXRUJQVlA4TA8AAAAvAYAAAAcQ/Y/+ByKi/wEA', 'base64'), width: 2, height: 3 }];
    for (const upload of allUploads) assert.equal((await fetch(origin + '/site/media/' + upload.image.id)).status, 404);
    const imageOnly = structuredClone(seed.content);
    imageOnly.about.imageId = uploadedPng.image.id;
    imageOnly.setup.images = [{ imageId, alt: '', caption: '' }, { imageId: uploadedWebp.image.id, alt: '', caption: '' }];
    admin = await request('/v2/admin/site', 'POST', { expectedVersion: admin.version, content: imageOnly });
    for (const upload of allUploads) assert.equal((await fetch(origin + '/site/media/' + upload.image.id)).status, 404);
    await page.reload(); await page.waitForLoadState('networkidle');
    for (const id of ['ueber-mich', 'mein-setup', 'meine-apps']) assert.equal(await page.locator('#' + id).isVisible(), false);
    tests.push('PNG/JPEG/WebP owner uploads and image-only saved draft remain private in actual browser/public routes');
    admin = await request('/v2/admin/site/publish', 'POST', { expectedVersion: admin.version });
    await page.reload(); await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('#ueber-mich').isVisible(), true); assert.equal(await page.locator('#mein-setup').isVisible(), true);
    for (const id of ['hero-text', 'about-text', 'setup-text', 'meine-apps', 'setup-components']) assert.equal(await page.locator('#' + id).isVisible(), false);
    for (const upload of allUploads) {
      const url = '/site/media/' + upload.image.id, response = await fetch(origin + url);
      assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), upload.image.mimeType);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), upload.bytes);
      const img = page.locator('img[src="' + url + '"]'); await img.scrollIntoViewIfNeeded();
      assert.deepEqual(await img.evaluate(async img => { await img.decode(); return { width: img.naturalWidth, height: img.naturalHeight }; }), { width: upload.width, height: upload.height });
    }
    tests.push('image-only publication renders all three exact upload formats with decoded natural dimensions and no invented text');
    const content = structuredClone(seed.content);
    content.about.text = 'Lokaler Layouttest: Dieser Text prüft die spätere Vorstellung.\nEr wird nicht als persönlicher Inhalt ausgeliefert.';
    content.about.imageId = imageId; content.about.imageAlt = 'Drachenmotiv – lokaler Upload-Test';
    content.setup.text = 'Die Technik hinter meinen Streams und Projekten.';
    content.setup.components = [
      { label: 'Prozessor', value: 'AMD Ryzen 7 9800X3D' }, { label: 'Grafikkarte', value: 'ASUS ROG Astral RTX 5080 · 16 GB' },
      { label: 'Mainboard', value: 'ASUS ROG Crosshair X870E Glacial' }, { label: 'Arbeitsspeicher', value: '32 GB Corsair DDR5-6000 CL30' },
      { label: 'Gehäuse', value: 'Lian Li O11 Dynamic · White' }, { label: 'Netzteil', value: 'ROG Strix 1200 W Platinum' },
      { label: 'Hauptmonitor', value: 'LG 49GR85DC-B · 49 Zoll' }, { label: 'Mikrofon', value: 'ASUS ROG Carnyx' }
    ];
    content.apps = [{ id: 'discord-app', name: 'Crazy_Batto Discord App', description: 'Lokale Layoutvorschau: Modstempel, Stream-Abfragen, Beiträge, Umfragen und Events.', imageId: 'discord-app', imageAlt: 'Echte Appansicht mit lokalem Testkonto', url: '/portal', buttonLabel: 'Zugang anfragen' }, { ...safeExample('zweites-projekt'), description: 'Hier prüft ein QA-Text die Darstellung einer eigenen Beschreibung ohne Bild.', url: 'https://example.test/projekt', buttonLabel: 'Projekt ansehen' }];
    content.socialLinks = [{ label: 'Lokaler Linktest', url: 'https://example.test/profil' }];
    admin = await request('/v2/admin/site', 'POST', { expectedVersion: admin.version, content });
    assert.equal((await request('/site/api/content')).content.about.text, '');
    await page.reload(); await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('#about-text').isVisible(), false); assert.equal(await page.locator('#meine-apps').isVisible(), false);
    tests.push('later draft text and project additions do not replace the published image-only view');
    admin = await request('/v2/admin/site/publish', 'POST', { expectedVersion: admin.version });
    assert.equal((await fetch(origin + publicImage)).status, 200);
    await page.reload(); await page.waitForLoadState('networkidle');
    for (const id of ['ueber-mich', 'mein-setup', 'meine-apps', 'registration-end', 'social-links']) assert.equal(await page.locator('#' + id).isVisible(), true);
    assert.equal(await page.locator('#setup-components > div').count(), 8);
    assert.equal(await page.locator('#about-text').textContent(), content.about.text);
    assert.equal(await page.locator('#setup-text').textContent(), content.setup.text);
    assert.deepEqual(await page.locator('#setup-components dt').allTextContents(), content.setup.components.map(row => row.label));
    assert.deepEqual(await page.locator('#setup-components dd').allTextContents(), content.setup.components.map(row => row.value));
    await page.locator('#about-media img').scrollIntoViewIfNeeded(); await page.waitForFunction(() => document.querySelector('#about-media img').naturalWidth === 1122);
    const published = await request('/site/api/content'); assert.equal(published.images.some(img => 'filename' in img), false);
    assert.equal(await page.locator('#app-list .app-row').count(), 2);
    assert.equal(await page.locator('#app-list .app-row').first().locator('a').getAttribute('href'), '/portal');
    assert.equal(await page.locator('#app-list .app-row').nth(1).locator('a').getAttribute('href'), 'https://example.test/projekt');
    assert.equal(await page.locator('#app-list .app-row').nth(1).locator('a').getAttribute('rel'), 'noopener noreferrer');
    assert.equal(await page.locator('#social-links a').getAttribute('href'), 'https://example.test/profil');
    const screenshot = page.locator('#app-list img'); await screenshot.scrollIntoViewIfNeeded();
    assert.equal(await screenshot.evaluate(async img => { await img.decode(); return img.naturalWidth > 0 && img.naturalHeight > 0; }), true);
    tests.push('publish exposes referenced exact upload, real app screenshot, components and valid project/social links');
    await page.locator('#about-media .image-open').click(); assert.equal(await page.locator('#image-dialog').isVisible(), true);
    assert.equal(await page.locator('#large-image').getAttribute('src'), publicImage);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#image-dialog').isVisible(), false);
    assert.equal(await page.locator('body').evaluate(body => body.classList.contains('dialog-open')), false);
    tests.push('uploaded image enlargement and keyboard-close work without external asset URLs');
    await page.setViewportSize({ width: 1536, height: 1024 });
    await page.locator('#mein-setup').scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollTo(0, document.getElementById('mein-setup').offsetTop - 20));
    await page.screenshot({ path: path.join(output, 'website-setup-layout-test.png') });
    await page.locator('#meine-apps').scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollTo(0, document.getElementById('meine-apps').offsetTop - 20));
    await page.screenshot({ path: path.join(output, 'website-apps-layout-test.png') });
    for (const width of [320, 390, 720, 1024, 1536]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'filled overflow ' + width);
    }
    tests.push('filled personal/setup/projects layouts fit 320/390/720/1024/1536 without horizontal overflow');
    const withGallery = structuredClone(content); withGallery.setup.images = [{ imageId, alt: 'Galerietest mit Drachenmotiv', caption: 'Echter Upload im lokalen Test' }];
    admin = await request('/v2/admin/site', 'POST', { expectedVersion: admin.version, content: withGallery });
    admin = await request('/v2/admin/site/publish', 'POST', { expectedVersion: admin.version });
    await page.reload(); await page.locator('#setup-gallery .image-open').waitFor({ state: 'visible' });
    await page.locator('#setup-gallery .image-open').click(); assert.equal(await page.locator('#image-caption').innerText(), 'Echter Upload im lokalen Test');
    await page.locator('#close-image').click(); assert.equal(await page.locator('#image-dialog').isVisible(), false);
    tests.push('setup gallery uses uploaded bytes, caption and working large view');
    admin = await request('/v2/admin/site', 'POST', { expectedVersion: admin.version, content: seed.content });
    assert.equal((await fetch(origin + publicImage)).status, 200);
    admin = await request('/v2/admin/site/publish', 'POST', { expectedVersion: admin.version });
    for (const upload of allUploads) assert.equal((await fetch(origin + '/site/media/' + upload.image.id)).status, 404);
    await page.reload(); await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('#ueber-mich').isVisible(), false); assert.equal(await page.locator('#mein-setup').isVisible(), false);
    assert.equal(await page.locator('#meine-apps').isVisible(), false); assert.equal(await page.locator('.section-nav').isVisible(), false);
    tests.push('removing published content hides every empty section and immediately closes public uploaded-image URL');

    const hostile = structuredClone(seed.content);
    hostile.about = { title: 'T'.repeat(100), text: '<img src=x onerror="window.injected=true">\n<script>window.injected=true</script>', imageId: 'brand-dragon', imageAlt: 'Untrusted URL test' };
    hostile.setup = { title: 'S'.repeat(100), text: '', components: [{ label: 'L'.repeat(80), value: 'W'.repeat(300) }], images: [] };
    hostile.apps = [{ ...safeExample('unsafe-link'), name: 'N'.repeat(100), url: 'javascript:window.injected=true' }, { ...safeExample('unsafe-auth'), url: 'https://user:password@example.test' }];
    hostile.socialLinks = [{ label: 'Unsafe', url: 'data:text/html,x' }];
    await page.route('**/site/api/content', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, content: hostile, images: [{ id: 'brand-dragon', url: 'https://example.test/tracker.jpeg', mimeType: 'image/jpeg', width: 1122, height: 1402 }] }) }));
    await page.reload(); await page.waitForLoadState('networkidle');
    assert.equal(await page.evaluate(() => window.injected), undefined); assert.equal(await page.locator('#about-text img').count(), 0);
    assert.equal(await page.locator('#about-media').isVisible(), false); assert.equal(await page.locator('#app-list a').count(), 0); assert.equal(await page.locator('#social-links').isVisible(), false);
    await page.setViewportSize({ width: 320, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    tests.push('text rendering rejects HTML, arbitrary image URLs and unsafe links; maximum long fields still fit at 320px');
    await page.unroute('**/site/api/content');
    await page.route('**/site/api/content', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false}' }));
    await page.reload(); await page.locator('#site-notice').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.hero-cta').getAttribute('href'), '/portal');
    await page.unroute('**/site/api/content'); await page.locator('#retry-content').click(); await page.locator('#site-notice').waitFor({ state: 'hidden' });
    tests.push('failed content fetch keeps registration usable and actual retry recovers without demo fallback');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
    tests.push('reduced-motion preference disables smooth scrolling');
    assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []); assert.deepEqual(unexpectedDiscordCalls, []); assert.equal(fixture.state.posts.length, 0);
    tests.push('zero browser errors, external asset requests or any Discord calls throughout website integration');
    await context.close();
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    for (const callback of cleanup.reverse()) await callback();
  }
  const result = { ok: true, tests, errors, externalRequests, unexpectedDiscordCalls, method: 'Real local HTTP Service, Store, Site API, PNG/JPEG/WebP uploads/publication and rendered website; existing mock Discord identity fixture only for initial owner setup, then every Discord call throws. No live account, deployment or outbound message.', fallbackReason: 'Browser/IAB has no connection to this local development container, so local Playwright Chromium is used.' };
  await fs.writeFile(path.join(__dirname, 'site-browser.json'), JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result, null, 2));
}
run().catch(error => { console.error(error); process.exitCode = 1; });
