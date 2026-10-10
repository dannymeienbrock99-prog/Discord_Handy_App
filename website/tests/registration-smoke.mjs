import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const sourceRoot = new URL('../quellcode/', import.meta.url);
const html = readFileSync(new URL('registration.html', sourceRoot), 'utf8');
const script = readFileSync(new URL('registration.js', sourceRoot), 'utf8');
const dataKey = name => name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
class Node {
  constructor(tag, attrs = {}) {
    this.tagName = tag.toUpperCase(); this.attrs = { ...attrs }; this.id = attrs.id;
    this.dataset = Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith('data-')).map(([k, v]) => [dataKey(k), v]));
    this.hidden = 'hidden' in attrs; this.disabled = 'disabled' in attrs;
    this.value = ''; this.textContent = ''; this.handlers = {};
  }
  getAttribute(name) { return this.attrs[name] ?? null; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  removeAttribute(name) { delete this.attrs[name]; }
  addEventListener(name, action) { (this.handlers[name] ||= []).push(action); }
  async emit(name, props = {}) {
    const event = { prevented: false, preventDefault() { this.prevented = true; }, ...props };
    for (const action of this.handlers[name] || []) await action(event);
    return event;
  }
  focus() { this.focused = true; }
  select() { this.selected = true; }
}
function fixture(mode = 'offline', initial = null, protocol = 'https:', hasMain = true) {
  const nodes = Array.from(html.matchAll(/<([A-Za-z][\w-]*)\b([^>]*?)>/g)).map(([, tag, tail]) => {
    const attrs = Object.fromEntries(Array.from(tail.matchAll(/([^\s=]+)(?:="([^"]*)")?/g)).map(([, name, value]) => [name, value ?? '']));
    return new Node(tag, attrs);
  });
  const root = new Node('div', { id: 'cb-website', 'data-portal-mode': mode });
  nodes.push(root);
  const get = id => nodes.find(n => n.id === id && (hasMain || id !== 'portal-main')) || null;
  const select = selector => nodes.filter(node => selector.startsWith('.') ? (node.attrs.class || '').split(/\s+/).includes(selector.slice(1)) : selector.startsWith('[') && selector.endsWith(']') ? selector.slice(1, -1) in node.attrs : false);
  nodes.forEach(n => { n.querySelectorAll = select; });
  const documentHandlers = {}, windowHandlers = {};
  const document = { hidden: false, getElementById: get, addEventListener(name, action) { (documentHandlers[name] ||= []).push(action); } };
  const window = { addEventListener(name, action) { (windowHandlers[name] ||= []).push(action); } };
  const calls = [], queue = initial ? [{ body: initial }] : [], timers = new Map();
  let timerId = 0;
  const context = { document, window, location: { protocol, origin: 'https://crazy-batto.example' }, navigator: {}, AbortController,
    setTimeout(action, delay) { const id = ++timerId; timers.set(id, { action, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    async fetch(path, options) {
      calls.push({ path, options });
      const next = queue.shift();
      assert.ok(next, 'Unexpected fetch: ' + path);
      if (next.error) throw next.error;
      return { ok: (next.status || 200) < 400, status: next.status || 200, async json() { return next.body; } };
    }
  };
  vm.runInNewContext(script, context, { filename: 'registration.js' });
  return { get, select, calls, queue, timers, documentHandlers, windowHandlers };
}
async function settle() { for (let i = 0; i < 16; i++) await Promise.resolve(); }
const publicSession = { ok: true, configured: true, authenticated: false, user: null, access: null, download: { available: false } };
const user = { id: '123456789012345678', username: 'example', displayName: 'Beispiel' };
const sessionFor = (status, canUseApp = false, available = false) => ({ ok: true, configured: true, authenticated: true, user,
  csrfToken: 'fixture-csrf', access: { status, canUseApp, requestedAt: 1791600000000, reviewedAt: null, reason: '' },
  download: { available, version: '2.2.0', url: 'https://untrusted.invalid/arbitrary.apk' } });

let groups = 0;
for (const [mode, protocol] of [['offline', 'https:'], ['', 'https:'], ['live', 'file:']]) {
  const f = fixture(mode, null, protocol);
  await settle();
  assert.equal(f.calls.length, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.get('portal-preview-controls').hidden, false);
  assert.equal(f.get('login-link').getAttribute('href'), null);
  for (const choice of f.select('[data-portal-preview]')) {
    await choice.emit('click');
    const state = choice.dataset.portalPreview;
    assert.equal(choice.getAttribute('aria-pressed'), 'true');
    assert.equal(f.get('welcome-view').hidden, state !== 'welcome');
    assert.equal(f.get('registration-view').hidden, state !== 'unregistered');
    assert.equal(f.get('offline-download-preview').hidden, state !== 'approved');
    assert.equal(f.get('download-section').hidden, true);
    assert.equal(f.get('download-link').getAttribute('href'), null);
    assert.equal(f.get('register-button').disabled, true);
  }
  assert.equal((await f.get('registration-form').emit('submit')).prevented, true);
  assert.equal(f.calls.length, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(Object.keys(f.documentHandlers).length, 0);
  groups++;
}
{
  const f = fixture('live', null, 'https:', false);
  await settle(); assert.equal(f.calls.length, 0); groups++;
}
{
  const f = fixture('live', publicSession);
  assert.equal(f.get('login-link').getAttribute('href'), null, 'Login stays unset while first check is in flight');
  await settle();
  assert.equal(f.calls[0].path, '/portal/api/session');
  assert.equal(f.get('portal-preview-controls').hidden, true);
  assert.equal(f.get('login-link').getAttribute('href'), '/portal/login');
  assert.equal(f.get('download-link').getAttribute('href'), null);
  groups++;
}
{
  const f = fixture('live', { ...publicSession, configured: false });
  await settle();
  assert.equal(f.get('login-link').getAttribute('href'), null);
  assert.equal(f.get('portal-error').hidden, false);
  groups++;
}
{
  const f = fixture('live', { ...sessionFor('unregistered'), configured: false });
  await settle();
  assert.equal(f.get('register-button').disabled, true);
  await f.get('registration-form').emit('submit');
  assert.equal(f.calls.length, 1);
  groups++;
}
{
  const f = fixture('live', sessionFor('unregistered'));
  await settle();
  assert.equal(f.get('registration-view').hidden, false);
  assert.equal(f.get('register-button').disabled, false);
  f.get('registration-note').value = '  Mein Stream-Team  ';
  f.queue.push({ body: { ok: true, access: sessionFor('pending').access } });
  await f.get('registration-form').emit('submit');
  const call = f.calls[1];
  assert.equal(call.path, '/portal/api/register');
  assert.equal(call.options.method, 'POST');
  assert.equal(call.options.credentials, 'same-origin');
  assert.equal(call.options.cache, 'no-store');
  assert.equal(call.options.headers['X-CSRF-Token'], 'fixture-csrf');
  assert.deepEqual(JSON.parse(call.options.body), { note: 'Mein Stream-Team' });
  assert.equal(f.get('status-view').hidden, false);
  assert.match(f.get('status-title').textContent, /geprüft/);
  assert.equal(f.get('download-link').getAttribute('href'), null);
  assert.equal(f.get('registration-note').value, '');
  groups++;
}
{
  const f = fixture('live', sessionFor('unregistered'));
  await settle(); f.get('registration-note').value = 'X'.repeat(501);
  await f.get('registration-form').emit('submit');
  assert.equal(f.calls.length, 1);
  assert.match(f.get('portal-error').textContent, /500/);
  groups++;
}
for (const state of ['pending', 'rejected', 'revoked']) {
  const f = fixture('live', sessionFor(state, true, true));
  await settle();
  assert.equal(f.get('status-view').dataset.accessState, state);
  assert.equal(f.get('download-link').getAttribute('href'), null);
  assert.equal(f.get('download-section').hidden, true);
  groups++;
}
for (const [canUse, available] of [[false, true], [true, false]]) {
  const f = fixture('live', sessionFor('approved', canUse, available));
  await settle();
  assert.equal(f.get('download-link').getAttribute('href'), null);
  assert.equal(f.get('download-section').hidden, true);
  assert.equal(f.get('download-unavailable').hidden, !canUse);
  groups++;
}
{
  const f = fixture('live', sessionFor('approved', true, true));
  await settle();
  assert.equal(f.get('download-link').getAttribute('href'), '/portal/download');
  assert.equal(f.get('server-address').value, 'https://crazy-batto.example');
  assert.equal(f.get('download-section').hidden, false);
  f.queue.push({ error: new Error('Fixture server failure') });
  const running = f.get('refresh-button').emit('click');
  assert.equal(f.get('download-link').getAttribute('href'), null, 'Download is cleared before asynchronous recheck');
  await running;
  assert.equal(f.get('download-link').getAttribute('href'), null);
  assert.equal(f.get('download-section').hidden, true);
  assert.equal(f.get('status-view').dataset.accessState, 'unknown');
  assert.equal(f.get('portal-error').hidden, false);
  assert.equal((await f.get('download-link').emit('click')).prevented, true);
  groups++;
}
{
  const f = fixture('live', { ...sessionFor('approved', true, true), user: { id: 'invalid' } });
  await settle();
  assert.equal(f.get('download-link').getAttribute('href'), null);
  assert.equal(f.get('portal-error').hidden, false);
  groups++;
}
{
  const f = fixture('live', sessionFor('approved', true, true));
  await settle();
  f.queue.push({ status: 401, body: { ok: false, message: 'Session expired' } });
  await f.select('.logout-button')[0].emit('click');
  assert.equal(f.get('download-link').getAttribute('href'), null);
  assert.equal(f.get('login-link').getAttribute('href'), null);
  assert.equal(f.get('welcome-view').hidden, false);
  assert.equal(f.calls[1].path, '/portal/api/logout');
  assert.equal(f.calls[1].options.headers['X-CSRF-Token'], 'fixture-csrf');
  groups++;
}
console.log(JSON.stringify({ ok: true, groups, offlineViews: 18, type: 'Node VM with explicit DOM stubs; not a browser test', checks: ['No offline network/timers/storage path', 'Explicit live mode plus HTTP(S)', 'No login before configured session', 'CSRF and same-origin POST', '500-character input limit', 'Status/approval/download availability gate', 'No stale approved download on failed live refresh', '401 and invalid identity fail closed'] }, null, 2));
