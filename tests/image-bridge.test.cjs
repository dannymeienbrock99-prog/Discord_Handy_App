'use strict';

// Run the actual WebView bridge in an isolated JS context. Calls and timers are
// captured in memory; these tests do not invoke Android or any remote service.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../web/bridge.js'), 'utf8');
const IMAGE_REF = '1'.repeat(64) + '.png';
const OPERATION = { id: 'operation_1234567890', type: 'post', actorId: '123456789012345678', guildId: '234567890123456789', channelId: '345678901234567890', category: 'general', createdAt: 1800000000000, data: { title: 'Test', text: 'Grüße' } };

function fixture() {
  const calls = [];
  const timers = [];
  const window = {
    NativeBridge: {
      loadState() { return ''; },
      call(id, action, body) { calls.push({ id, action, body: JSON.parse(body) }); },
    },
  };
  vm.runInNewContext(source, {
    window,
    setTimeout(fn, delay) { const timer = { fn, delay, cleared: false }; timers.push(timer); return timer; },
    clearTimeout(timer) { if (timer) timer.cleared = true; },
  }, { filename: 'bridge.js' });
  return {
    bridge: window.ModstempelBridge, calls, timers,
    resolve(call, result) { window.__modstempelNativeResolve(call.id, JSON.stringify(result)); },
  };
}

test('the v2 bridge passes a domain operation and image reference to the fixed native action', async () => {
  const f = fixture();
  const operation = { ...OPERATION, image: { ref: IMAGE_REF, name: 'Modstempel-Bild.png', mime: 'image/png', size: 24, width: 1, height: 1 } };
  const sending = f.bridge.operationSend(operation, IMAGE_REF);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].action, 'operation_send');
  assert.deepEqual(f.calls[0].body, { operation, imageRef: IMAGE_REF });
  assert.equal(f.timers[0].delay, 215_000);
  assert.equal(Object.hasOwn(f.calls[0].body.operation, 'imageRef'), false);
  f.resolve(f.calls[0], { ok: true, operation: { id: operation.id, status: 'sent' } });
  assert.equal((await sending).ok, true);
  assert.equal(f.timers[0].cleared, true);

  const plain = { ...OPERATION, id: 'operation_2345678901' };
  const stamping = f.bridge.operationSend(plain);
  assert.deepEqual(f.calls[1].body, { operation: plain });
  assert.equal(Object.hasOwn(f.calls[1].body, 'imageRef'), false);
  assert.equal(f.timers[1].delay, 50_000);
  f.resolve(f.calls[1], { ok: true, operation: { id: plain.id, status: 'sent' } });
  assert.equal((await stamping).ok, true);
});

test('the Android image picker has no JS deadline and preserves cancelled or failed outcomes', async () => {
  const f = fixture();
  let settled = false;
  const selecting = f.bridge.pickImage().then(result => { settled = true; return result; });
  assert.deepEqual(f.calls[0].body, {});
  assert.equal(f.calls[0].action, 'pick_image');
  assert.equal(f.timers.length, 0);
  await Promise.resolve();
  assert.equal(settled, false);
  f.resolve(f.calls[0], { ok: false, kind: 'cancelled' });
  assert.equal((await selecting).kind, 'cancelled');
  assert.equal(f.timers.length, 0);

  const failed = f.bridge.pickImage();
  f.resolve(f.calls[1], { ok: false, kind: 'validation', message: 'Das Bild ist zu groß.' });
  const result = await failed;
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'validation');
  assert.equal(result.message, 'Das Bild ist zu groß.');
  assert.equal(f.timers.length, 0);
});

test('discard addresses the native image store by reference and callback IDs remain isolated', async () => {
  const f = fixture();
  const selecting = f.bridge.pickImage();
  const removing = f.bridge.discardImage(IMAGE_REF);
  assert.equal(f.calls[1].action, 'remove_image');
  assert.deepEqual(f.calls[1].body, { ref: IMAGE_REF });
  assert.notEqual(f.calls[0].id, f.calls[1].id);
  f.resolve(f.calls[1], { ok: true, removed: false, retained: true });
  const removed = await removing;
  assert.equal(removed.retained, true);
  f.resolve(f.calls[0], { ok: false, kind: 'cancelled' });
  assert.equal((await selecting).kind, 'cancelled');
});

test('an image send that loses its confirmation becomes uncertain without a hidden resend', async () => {
  const f = fixture();
  const sending = f.bridge.operationSend(OPERATION, IMAGE_REF);
  assert.equal(f.timers.length, 1);
  assert.equal(f.timers[0].delay, 215_000);
  f.timers[0].fn();
  const result = await sending;
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'uncertain');
  assert.equal(f.calls.length, 1);
  f.resolve(f.calls[0], { ok: true, operation: { id: OPERATION.id, status: 'sent' } });
  await Promise.resolve();
  assert.equal(result.kind, 'uncertain');
  assert.equal(f.calls.length, 1);
});

test('all legacy webhook methods are explicitly disabled without reaching NativeBridge', async () => {
  const f = fixture();
  for (const method of ['send', 'check', 'readPoll']) {
    const result = await f.bridge[method]('legacy-ref', {});
    assert.equal(result.ok, false);
    assert.equal(result.kind, 'permanent');
    assert.match(result.message, /deaktiviert/);
  }
  assert.throws(() => f.bridge.storeWebhook('https://example.invalid'), /deaktiviert/);
  assert.equal(f.bridge.getConnection().configured, false);
  assert.equal(f.bridge.getConnection().legacyDisabled, true);
  assert.equal(f.calls.length, 0);
  assert.equal(f.timers.length, 0);
});

test('v2 methods map to declared actions and the exact non-secret body', async () => {
  const f = fixture();
  const cases = [
    ['backendStatus', [], 'backend_status', {}],
    ['configureBackend', ['https://backend.example.invalid'], 'configure_backend', { url: 'https://backend.example.invalid' }],
    ['authBegin', [], 'auth_begin', {}], ['authPoll', [], 'auth_poll', {}],
    ['authCancel', [], 'auth_cancel', {}], ['authLogout', [], 'auth_logout', {}],
    ['guilds', [], 'guilds', {}],
    ['guildSetup', [OPERATION.guildId], 'guild_setup', { guildId: OPERATION.guildId }],
    ['moderatorRole', [OPERATION.guildId, OPERATION.actorId], 'moderator_role', { guildId: OPERATION.guildId, roleId: OPERATION.actorId }],
    ['botInstall', [OPERATION.guildId], 'bot_install', { guildId: OPERATION.guildId }],
    ['scheduledEvents', [OPERATION.guildId], 'scheduled_events', { guildId: OPERATION.guildId }],
    ['operationStatus', [OPERATION.id], 'operation_status', { operationId: OPERATION.id }],
    ['operationRetry', [OPERATION.id, true], 'operation_retry', { operationId: OPERATION.id, acknowledgeUncertain: true }],
    ['pollResults', [OPERATION.id], 'poll_results', { operationId: OPERATION.id }],
    ['openDiscord', [{ guildId: OPERATION.guildId, eventId: OPERATION.actorId }], 'open_discord', { guildId: OPERATION.guildId, eventId: OPERATION.actorId }],
  ];
  for (const [method, args, action, body] of cases) {
    const request = f.bridge[method](...args);
    const call = f.calls.at(-1);
    assert.equal(call.action, action);
    assert.deepEqual(call.body, body);
    assert.equal(f.timers.at(-1).delay, 50_000);
    f.resolve(call, { ok: true });
    assert.equal((await request).ok, true);
  }
});

test('retry timeout is uncertain and does not generate another operation or acknowledge it implicitly', async () => {
  const f = fixture();
  const retry = f.bridge.operationRetry(OPERATION.id);
  assert.deepEqual(f.calls[0].body, { operationId: OPERATION.id, acknowledgeUncertain: false });
  f.timers[0].fn();
  assert.equal((await retry).kind, 'uncertain');
  assert.equal(f.calls.length, 1);
  const status = f.bridge.operationStatus(OPERATION.id);
  f.timers[1].fn();
  assert.equal((await status).kind, 'network');
});
