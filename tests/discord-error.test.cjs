'use strict';

// Regression for a rejected image request. This reuses the controlled-clock,
// durable backing string and fake-native send contract from image-request.test.
// Only the native result is simulated; all queue, restart and export behavior
// runs through the real Core. No Discord endpoint or external file is opened.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp, validateWebhook } = require('../web/core.js');

const START = Date.parse('2026-10-09T14:20:00+02:00');
const DEADLINE = Date.parse('2026-10-09T14:25:00+02:00');
const WEBHOOK = 'https://discord.com/api/webhooks/123456789012345678/' + 'A'.repeat(48);
const ROUTE_A = 'a'.repeat(64);
const ROUTE_B = 'b'.repeat(64);
const IMAGE = Object.freeze({ ref: '1'.repeat(64) + '.png', name: 'Modstempel-Bild.png', mime: 'image/png', size: 2048, width: 1200, height: 675 });
const ERROR_END = 'attachments.0.id [BASE_TYPE_REQUIRED]: This field is required.';
const ERROR_PREFIX = 'HTTP 400 · Discord 50035: Die hochgeladene Abfrage wurde abgelehnt. ';
const ERROR_DETAIL = 'Der Bildanhang wurde nicht übernommen; die unveränderte Abfrage bleibt auf dem Gerät. ';
// Put the actionable field path at the end of a realistic long native message
// so a silent truncation of errors in the Core or export becomes visible.
const LONG_ERROR = ERROR_PREFIX + ERROR_DETAIL.repeat(9).slice(0, 810 - ERROR_PREFIX.length - ERROR_END.length) + ERROR_END;
const REJECTION = Object.freeze({ ok: false, kind: 'permanent', status: 400, message: LONG_ERROR });

const snapshot = f => f.app.getSnapshot();
const request = f => snapshot(f).requests[0];

async function fixture() {
  const clock = { value: START };
  const backing = { value: '' };
  const connection = { configured: true, ref: ROUTE_A, mask: '••5678' };
  const control = { sends: [], responses: [REJECTION], exports: [] };
  const bridge = {
    native: true,
    loadState() { return backing.value; },
    saveState(json) { JSON.parse(json); backing.value = json; },
    getConnection() { return { ...connection }; },
    storeWebhook(url) {
      assert.equal(url, validateWebhook(WEBHOOK));
      Object.assign(connection, { ref: ROUTE_B });
      return { ...connection };
    },
    async send(ref, payload, imageRef) {
      control.sends.push({ ref, payload: structuredClone(payload), imageRef, at: clock.value });
      return control.responses.length ? control.responses.shift() : {
        ok: true, messageId: (223456789012345678n + BigInt(control.sends.length)).toString(), channelId: '323456789012345678',
      };
    },
    async exportFile(filename, mime, content) { control.exports.push({ filename, mime, content }); return { ok: true }; },
  };
  const f = { clock, backing, connection, control, bridge };
  f.restart = async () => {
    if (f.app) f.app.dispose();
    f.app = createApp({ bridge, now: () => clock.value, autoSync: false, ticker: false });
    await f.app.init();
    assert.equal(snapshot(f).ready, true);
  };
  await f.restart();
  await f.app.saveSettings({ name: 'Alice', team: 'Stream-Team' });
  await f.app.createRequest({ title: 'Test', startsAt: DEADLINE, note: '', durationHours: 24, image: IMAGE });
  await f.app.flushQueue();
  assert.equal(request(f).status, 'failed');
  assert.equal(f.control.sends.length, 1);
  return f;
}

test('HTTP 400 image errors retain the complete diagnostic path through restart and JSON export without automatic retry', async () => {
  assert.equal(LONG_ERROR.length, 810);
  const f = await fixture();
  const id = request(f).id;
  assert.equal(request(f).error, LONG_ERROR);
  assert.equal(snapshot(f).delivery.lastError, LONG_ERROR);
  assert.equal(snapshot(f).delivery.failed, 1);
  assert.equal(snapshot(f).delivery.pending, 0);
  assert.equal(snapshot(f).delivery.nextRetryAt, 0);
  assert.ok(request(f).error.endsWith(ERROR_END));
  assert.deepEqual(JSON.parse(f.backing.value).events[0].request.image, IMAGE);
  assert.equal(JSON.parse(f.backing.value).events[0].error, LONG_ERROR);

  f.clock.value = Date.parse('2026-10-09T14:22:00+02:00');
  await f.app.flushQueue();
  await f.restart();
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 1);
  assert.equal(request(f).id, id);
  assert.equal(request(f).attempts, 1);
  assert.equal(request(f).status, 'failed');
  assert.equal(request(f).error, LONG_ERROR);
  await f.app.exportData('json');
  const exported = JSON.parse(f.control.exports[0].content);
  assert.equal(exported.events.length, 1);
  assert.equal(exported.events[0].error, LONG_ERROR);
  assert.ok(exported.events[0].error.endsWith(ERROR_END));
  assert.deepEqual(exported.events[0].request.image, IMAGE);
  assert.equal(exported.sessions.length, 0);
  assert.equal(snapshot(f).activeSession, null);
  assert.equal(f.control.exports[0].content.includes(WEBHOOK), false);
});

test('an explicit retry before the deadline uses the original image, profile and webhook route without starting a duty', async () => {
  const f = await fixture();
  const original = request(f);
  const firstSend = structuredClone(f.control.sends[0]);
  await f.app.saveSettings({ name: 'Bob', team: 'Zweites Team', webhook: WEBHOOK });
  assert.equal(snapshot(f).connection.ref, ROUTE_B);
  f.clock.value = Date.parse('2026-10-09T14:23:00+02:00');
  await f.restart();
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 1);
  await f.app.retryEvent(original.id);
  assert.equal(request(f).status, 'pending');
  assert.equal(f.control.sends.length, 1);
  await f.app.flushQueue();

  assert.equal(f.control.sends.length, 3);
  assert.equal(f.control.sends[1].ref, ROUTE_A);
  assert.equal(f.control.sends[1].imageRef, IMAGE.ref);
  assert.deepEqual(f.control.sends[1].payload, firstSend.payload);
  assert.equal(f.control.sends[2].ref, ROUTE_A);
  assert.equal(f.control.sends[2].imageRef, undefined);
  assert.ok(f.control.sends[2].payload.poll);
  assert.equal(f.control.sends[2].payload.attachments, undefined);
  assert.equal(f.control.sends[2].payload.embeds, undefined);
  assert.deepEqual(request(f).request, original.request);
  assert.equal(request(f).id, original.id);
  assert.equal(request(f).status, 'sent');
  assert.equal(request(f).attempts, 3);
  assert.equal(snapshot(f).requests.length, 1);
  assert.equal(snapshot(f).events.length, 1);
  assert.equal(snapshot(f).sessions.length, 0);
  assert.equal(snapshot(f).activeSession, null);
});

test('a failed or just-requeued image request cannot bypass the exact 14:25 delivery deadline', async () => {
  const failed = await fixture();
  const id = request(failed).id;
  failed.clock.value = DEADLINE;
  await failed.restart();
  const before = failed.backing.value;
  await assert.rejects(failed.app.retryEvent(id), /abgelaufen/);
  await failed.app.flushQueue();
  assert.equal(failed.backing.value, before);
  assert.equal(failed.control.sends.length, 1);
  assert.equal(request(failed).status, 'failed');
  assert.equal(request(failed).error, LONG_ERROR);
  assert.deepEqual(request(failed).request.image, IMAGE);

  // A tap immediately before the deadline must not authorize a later upload.
  const raced = await fixture();
  raced.clock.value = DEADLINE - 1;
  await raced.app.retryEvent(request(raced).id);
  assert.equal(request(raced).status, 'pending');
  raced.clock.value = DEADLINE;
  await raced.app.flushQueue();
  assert.equal(raced.control.sends.length, 1);
  assert.equal(request(raced).status, 'skipped');
  assert.equal(request(raced).expired, true);
  assert.deepEqual(request(raced).request.image, IMAGE);
  assert.equal(snapshot(raced).sessions.length, 0);
  assert.equal(snapshot(raced).activeSession, null);
});
