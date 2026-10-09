'use strict';
// Local UI checks with mocked API/native responses. No live Discord account or posting.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(require.resolve('playwright', { paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES] }));
const root = path.resolve(__dirname, '..');
const output = path.join(__dirname, 'screenshots');
const AT = Date.parse('2026-10-09T17:00:00Z');
const USER = '123456789012345678', GUILD = '223456789012345678', CHANNEL = '323456789012345678', ROLE = '423456789012345678';
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.jpeg': 'image/jpeg' };
const tests = [], errors = [];
const access = status => ({ status, isOwner: false, canUseApp: status === 'approved', version: 1, requestedAt: AT, updatedAt: AT, reviewedAt: ['approved', 'rejected', 'revoked'].includes(status) ? AT : null, reason: '' });
const portalSession = status => ({ ok: true, configured: true, authenticated: !!status, user: status ? { id: USER, username: 'testkonto', displayName: 'Testkonto' } : null, access: status ? access(status) : null, csrfToken: status ? 'test-csrf-token-for-local-ui' : null, expiresAt: AT + 3600000, download: { available: status === 'approved', version: '2.1.0', url: '/portal/download', filename: 'Modstempel-2.1.0.apk' } });
async function run() {
  await fs.mkdir(output, { recursive: true });
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let file;
      if (url.pathname === '/' || url.pathname === '/portal') file = path.join(root, 'server/public/index.html');
      else if (url.pathname.startsWith('/portal/assets/')) file = path.join(root, 'server/public', url.pathname.slice('/portal/assets/'.length));
      else if (url.pathname.startsWith('/app/')) file = path.join(root, 'web', url.pathname.slice('/app/'.length) || 'index.html');
      else { res.writeHead(404); res.end('Not found'); return; }
      if (!file.startsWith(root + path.sep) || url.pathname.includes('..')) throw new Error('Invalid path');
      const data = await fs.readFile(file); res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
    } catch (_) { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.MODSTEMPEL_CHROMIUM || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--disable-gpu'] });
    const context = await browser.newContext({ viewport: { width: 1536, height: 1024 }, locale: 'de-DE' });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    let session = portalSession(null), requests = [], broken = false;
    await page.route('**/portal/api/**', async route => {
      const request = route.request(), url = new URL(request.url());
      requests.push({ path: url.pathname, method: request.method(), headers: request.headers(), body: request.postDataJSON() });
      if (broken) { await route.abort(); return; }
      if (url.pathname.endsWith('/register')) {
        assert.equal(request.method(), 'POST'); assert.equal(request.headers()['x-csrf-token'], session.csrfToken);
        session.access = access('pending'); session.download.available = false;
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, access: session.access }) });
      } else if (url.pathname.endsWith('/logout')) {
        assert.equal(request.headers()['x-csrf-token'], session.csrfToken); session = portalSession(null);
        await route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
      } else await route.fulfill({ contentType: 'application/json', body: JSON.stringify(session) });
    });
    await page.goto(origin + '/portal');
    await page.waitForFunction(() => document.getElementById('login-link').getAttribute('aria-disabled') === 'false');
    assert.equal(await page.locator('#download-section').isVisible(), false);
    assert.equal(await page.locator('#login-link').getAttribute('href'), '/portal/login');
    await page.screenshot({ path: path.join(output, 'portal-desktop.png') }); tests.push('desktop welcome and no unauthenticated download');
    await page.locator('#privacy-open').click(); assert.equal(await page.locator('#privacy-dialog').isVisible(), true); await page.keyboard.press('Escape');
    assert.equal(await page.locator('#privacy-dialog').isVisible(), false); tests.push('privacy dialog and keyboard close');
    session = portalSession('unregistered'); await page.reload(); await page.locator('#registration-view').waitFor({ state: 'visible' });
    await page.locator('#registration-note').fill('Lokaler Test mit <script> und @everyone'); await page.locator('#register-button').click();
    await page.locator('#status-title').filter({ hasText: 'Deine Anfrage wird geprüft' }).waitFor();
    assert.equal(await page.locator('#download-section').isVisible(), false);
    assert.equal(requests.filter(r => r.path.endsWith('/register')).length, 1); tests.push('explicit registration with note and CSRF, followed by pending');
    await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(output, 'portal-pending-mobile.png'), fullPage: true });
    for (const state of ['rejected', 'revoked']) {
      session = portalSession(state); session.access.reason = 'Testhinweis <script>window.bad = true</script>';
      await page.locator('#refresh-button').click(); await page.waitForFunction(expected => document.getElementById('access-label').textContent === expected, state === 'rejected' ? 'Abgelehnt' : 'Gesperrt');
      assert.equal(await page.locator('#download-section').isVisible(), false); assert.equal(await page.evaluate(() => window.bad), undefined);
    }
    tests.push('rejection/revocation hides download and renders owner note safely as text');
    session = portalSession('approved'); await page.locator('#refresh-button').click(); await page.locator('#download-section').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#download-link').getAttribute('href'), '/portal/download');
    assert.equal(await page.locator('#server-address').inputValue(), origin);
    await page.screenshot({ path: path.join(output, 'portal-approved-mobile.png'), fullPage: true }); tests.push('approved download and exact current server address');
    broken = true; await page.locator('#refresh-button').click(); await page.locator('#portal-error').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#download-section').isVisible(), false); tests.push('failed fresh check removes stale download');
    broken = false; await page.locator('#retry-button').click(); await page.locator('#download-section').waitFor({ state: 'visible' });
    for (const width of [320, 390, 720, 1024, 1536]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'portal overflow at ' + width);
    }
    tests.push('portal no horizontal overflow at 320/390/720/1024/1536');
    await page.locator('#status-view .logout-button').click(); await page.locator('#welcome-view').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#download-section').isVisible(), false); tests.push('real logout call returns portal to logged-out state');
    await context.close();

    const appContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'de-DE' });
    await appContext.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await appContext.addInitScript(({ AT, USER, GUILD, CHANNEL, ROLE }) => {
      let raw = '';
      window.qaState = { status: 'pending', calls: [] };
      window.NativeBridge = {
        loadState: () => raw,
        saveState: value => { raw = value; return JSON.stringify({ ok: true }); },
        clock: () => JSON.stringify({ wallMs: AT }),
        call: (id, action, json) => {
          window.qaState.calls.push(action);
          const user = { id: USER, username: 'testkonto', displayName: 'Testkonto' };
          const status = window.qaState.status;
          const access = { status, isOwner: false, canUseApp: status === 'approved', version: 1, requestedAt: AT, updatedAt: AT, reviewedAt: status === 'approved' ? AT : null, reason: '' };
          const reply = action === 'backend_status' ? { ok: true, configured: true, origin: 'https://modstempel.example', serverReady: true, authenticated: true, user, access, accessCheckedAt: AT }
            : action === 'guilds' ? { ok: true, guilds: [{ id: GUILD, name: 'Testserver', botReady: true }] }
            : action === 'guild_setup' ? { ok: true, guild: { id: GUILD, name: 'Testserver' }, canConfigure: true, canCreateEvents: true, botReady: true, moderatorRoleId: ROLE, roles: [{ id: ROLE, name: 'Moderation' }], channels: [{ id: CHANNEL, name: 'moderation', type: 0, capabilities: { modstempel: true, general: true, stream: true, poll: true, big_match: true } }] }
            : action === 'auth_logout' ? { ok: true }
            : action === 'operation_send' ? { ok: true, operation: { ...JSON.parse(json).operation, status: 'sent', messageId: '523456789012345678', channelId: CHANNEL } }
            : { ok: true };
          setTimeout(() => window.__modstempelNativeResolve(id, JSON.stringify(reply)), 0);
        }
      };
    }, { AT, USER, GUILD, CHANNEL, ROLE });
    const appPage = await appContext.newPage(); appPage.on('pageerror', error => errors.push(error.message));
    await appPage.goto(origin + '/app/'); await appPage.locator('#access-panel').waitFor({ state: 'visible' });
    assert.equal(await appPage.locator('#start-duty').isDisabled(), true);
    assert.equal(await appPage.evaluate(() => window.qaState.calls.includes('guilds')), false);
    await appPage.screenshot({ path: path.join(output, 'android-pending.png') }); tests.push('pending Android denies guild fetch and new duty');
    await appPage.locator('#open-access-portal').click();
    assert.equal(await appPage.evaluate(() => window.qaState.calls.includes('open_portal')), true);
    await appPage.locator('#nav-history').click(); assert.equal(await appPage.locator('#export-json').isDisabled(), false); await appPage.locator('#export-json').click();
    assert.equal(await appPage.evaluate(() => window.qaState.calls.includes('export')), true); tests.push('pending Android portal action and local JSON export');
    await appPage.locator('#nav-clock').click(); await appPage.evaluate(() => { window.qaState.status = 'approved'; });
    await appPage.locator('#refresh-access').click(); await appPage.waitForFunction(() => window.Modstempel.getSnapshot().guilds.length === 1);
    await appPage.locator('#open-settings').click(); await appPage.locator('#guild-select').selectOption(GUILD); await appPage.locator('#channel-select').selectOption(CHANNEL);
    await appPage.locator('#nav-clock').click(); assert.equal(await appPage.locator('#start-duty').isDisabled(), false);
    await appPage.locator('#toast').waitFor({ state: 'hidden', timeout: 6000 });
    await appPage.screenshot({ path: path.join(output, 'android-approved.png') }); tests.push('approved Android selects actual mock guild/channel and enables duty');
    await appPage.locator('#start-duty').click(); await appPage.locator('#active-actions').waitFor({ state: 'visible' });
    await appPage.evaluate(async () => { window.qaState.status = 'revoked'; await window.Modstempel.refreshAccess(); });
    assert.equal(await appPage.locator('#pause-duty').isDisabled(), false); assert.equal(await appPage.locator('#finish-duty').isDisabled(), false);
    await appPage.locator('#pause-duty').click(); await appPage.waitForFunction(() => window.Modstempel.getSnapshot().activeSession.status === 'paused');
    tests.push('revoked active duty stays locally pausable and finishable');
    for (const width of [320, 390, 560]) {
      await appPage.setViewportSize({ width, height: 900 });
      for (const view of ['clock', 'posts', 'events', 'history']) {
        await appPage.locator('#nav-' + view).click();
        assert.equal(await appPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'app overflow ' + view + ' at ' + width);
      }
      await appPage.locator('#open-settings').click();
      assert.equal(await appPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'app settings overflow at ' + width);
    }
    tests.push('all five Android views without overflow at 320/390/560');
    assert.deepEqual(errors, []);
    await appContext.close();
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
  const result = { ok: true, tests, errors, method: 'Local Playwright Chromium; mocked portal API and native bridge, no live Discord or public deployment.', fallbackReason: 'No Browser/IAB connection is available to this local development container.' };
  await fs.writeFile(path.join(__dirname, 'ui-access.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}
run().catch(error => { console.error(error); process.exitCode = 1; });
