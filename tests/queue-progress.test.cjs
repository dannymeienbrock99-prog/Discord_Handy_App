'use strict';

// Scheduler regressions use the real Core with autoSync enabled and real Node
// timers. Only native storage and delivery are faked; no HTTP request is made.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp, validateWebhook } = require('../web/core.js');

const SEED_TIME = Date.parse('2026-10-09T14:20:00+02:00');
const OLD_START = Date.parse('2026-10-09T14:25:00+02:00');
const REOPEN_TIME = Date.parse('2026-10-09T14:30:00+02:00');
const NEW_START = Date.parse('2026-10-09T14:40:00+02:00');
const ROUTE_A = 'a'.repeat(64);
const ROUTE_B = 'b'.repeat(64);
const WEBHOOK = 'https://discord.com/api/webhooks/123456789012345678/' + 'A'.repeat(48);
const IMAGE = Object.freeze({ ref: '1'.repeat(64) + '.png', name: 'Modstempel-Bild.png', mime: 'image/png', size: 2048, width: 1200, height: 675 });
const REJECTION = Object.freeze({ ok: false, kind: 'permanent', status: 400, message: 'HTTP 400 · Discord 50035 · attachments.0.id [BASE_TYPE_REQUIRED]' });
const UNCERTAIN = Object.freeze({ ok: false, kind: 'uncertain', message: 'Bestätigung fehlt. Die Zustellung ist unklar.' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const snapshot = f => f.app.getSnapshot();
const event = (f, id) => snapshot(f).events.find(item => item.id === id);
const storedEvent = (f, id) => JSON.parse(f.backing.value).events.find(item => item.id === id);

async function until(check, label) {
  const deadline = Date.now() + 2000;
  while (!check()) {
    if (Date.now() >= deadline) assert.fail('autoSync did not complete: ' + label);
    await sleep(5);
  }
}

async function fixture(t, autoSync = true) {
  const clock = { value: SEED_TIME };
  const backing = { value: '' };
  const connection = { configured: true, ref: ROUTE_A, mask: '••5678' };
  const control = { responses: [], sends: [], exports: [] };
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
  f.restart = async (enabled = true) => {
    if (f.app) f.app.dispose();
    f.app = createApp({ bridge, now: () => clock.value, autoSync: enabled, ticker: false });
    await f.app.init();
    assert.equal(snapshot(f).ready, true);
  };
  t.after(() => f.app.dispose());
  await f.restart(autoSync);
  await f.app.saveSettings({ name: 'Alice', team: 'Stream-Team' });
  return f;
}

async function addRequest(f, title, startsAt = NEW_START) {
  await f.app.createRequest({ title, startsAt, note: '', durationHours: 24, image: IMAGE });
  return snapshot(f).requests[0].id;
}

test('autoSync sends a new image request past a saved expired rejection while retaining the failed history', async t => {
  const f = await fixture(t, false);
  f.control.responses.push(REJECTION);
  const oldId = await addRequest(f, 'Alte Abfrage', OLD_START);
  await f.app.flushQueue(); // Seed a real durable rejection, before restarting.
  const original = storedEvent(f, oldId);
  assert.equal(original.status, 'failed');
  f.clock.value = REOPEN_TIME;
  await f.restart();
  assert.equal(event(f, oldId).retryExpired, true);
  const freshId = await addRequest(f, 'Neue Abfrage');

  await until(() => event(f, freshId).status === 'sent', 'new request behind expired failed request');
  assert.equal(f.control.sends.length, 3);
  assert.equal(f.control.sends[1].imageRef, IMAGE.ref);
  assert.equal(f.control.sends[1].ref, ROUTE_A);
  assert.ok(f.control.sends[2].payload.poll);
  assert.equal(f.control.sends[2].imageRef, undefined);
  assert.deepEqual(storedEvent(f, oldId), original);
  assert.equal(event(f, oldId).attempts, 1);
  assert.equal(event(f, freshId).waitingFor, undefined);
  assert.equal(event(f, freshId).retryExpired, false);
  assert.equal(snapshot(f).sessions.length, 0);
  await f.app.exportData('json');
  assert.deepEqual(JSON.parse(f.control.exports[0].content).events.find(item => item.id === oldId), original);
  await f.restart();
  await sleep(90);
  assert.equal(f.control.sends.length, 3);
  assert.deepEqual(storedEvent(f, oldId), original);
});

test('autoSync sends a new request behind a failed timestamp without retrying or changing the duty record', async t => {
  const f = await fixture(t, false);
  f.control.responses.push(REJECTION);
  await f.app.start();
  const oldId = snapshot(f).events[0].id;
  await f.app.flushQueue();
  const originalEvent = storedEvent(f, oldId);
  const originalSession = JSON.parse(f.backing.value).sessions[0];
  f.clock.value = REOPEN_TIME;
  await f.restart();
  const requestId = await addRequest(f, 'Nach dem Stempelfehler');

  await until(() => event(f, requestId).status === 'sent', 'request behind failed stamp');
  assert.equal(f.control.sends.length, 3);
  assert.equal(f.control.sends[1].payload.poll, undefined);
  assert.equal(f.control.sends[1].imageRef, IMAGE.ref);
  assert.ok(f.control.sends[2].payload.poll);
  assert.equal(f.control.sends[2].imageRef, undefined);
  assert.deepEqual(storedEvent(f, oldId), originalEvent);
  assert.deepEqual(JSON.parse(f.backing.value).sessions[0], originalSession);
  assert.equal(snapshot(f).sessions.length, 1);
  assert.equal(snapshot(f).activeSession.id, originalSession.id);
});

test('a definite HTTP 400 during the automatic queue run releases the following request without resending the rejection', async t => {
  const f = await fixture(t);
  f.control.responses.push(REJECTION);
  const rejectedId = await addRequest(f, 'Abgelehnte Abfrage');
  const nextId = await addRequest(f, 'Nächste Abfrage');
  await until(() => event(f, nextId).status === 'sent', 'following request after an in-flight HTTP 400');

  assert.equal(f.control.sends.length, 3);
  assert.equal(event(f, rejectedId).status, 'failed');
  assert.equal(event(f, rejectedId).error, REJECTION.message);
  assert.equal(event(f, rejectedId).attempts, 1);
  assert.equal(event(f, rejectedId).retryExpired, false);
  assert.equal(event(f, nextId).waitingFor, undefined);
  assert.equal(snapshot(f).delivery.failed, 1);
  assert.equal(snapshot(f).delivery.sent, 1);
  await sleep(90);
  assert.equal(f.control.sends.length, 3);
});

test('an expired uncertain request blocks visibly across restart until it is explicitly handled', async t => {
  const f = await fixture(t);
  f.control.responses.push(UNCERTAIN);
  const oldId = await addRequest(f, 'Unbestätigte Abfrage', OLD_START);
  const newId = await addRequest(f, 'Wartende Abfrage');
  await until(() => event(f, oldId).status === 'uncertain' && !snapshot(f).networkBusy, 'uncertain delivery');
  f.clock.value = REOPEN_TIME;
  await f.restart();
  await sleep(90);
  const waiting = event(f, newId);
  assert.equal(waiting.status, 'pending');
  assert.equal(waiting.attempts, 0);
  assert.equal(waiting.waitingFor.eventId, oldId);
  assert.equal(waiting.waitingFor.status, 'uncertain');
  assert.equal(waiting.waitingFor.type, 'request');
  assert.match(waiting.waitingFor.message, /unklar|bestätig/i);
  assert.equal(Object.hasOwn(storedEvent(f, newId), 'waitingFor'), false);
  assert.equal(Object.hasOwn(storedEvent(f, oldId), 'retryExpired'), false);
  assert.equal(event(f, oldId).retryExpired, true);
  assert.equal(waiting.retryExpired, false);
  assert.equal(f.control.sends.length, 1);
  await assert.rejects(f.app.retryEvent(oldId), /abgelaufen/);

  await f.app.markEventHandled(oldId);
  await until(() => event(f, newId).status === 'sent', 'explicit handling releases pending request');
  assert.equal(event(f, oldId).status, 'skipped');
  assert.equal(event(f, oldId).attempts, 1);
  assert.equal(event(f, newId).waitingFor, undefined);
  assert.equal(f.control.sends.length, 3);
  assert.equal(f.control.sends[1].imageRef, IMAGE.ref);
  assert.ok(f.control.sends[2].payload.poll);
});

test('an explicit retry of an uncertain request resumes automatic FIFO with its original image and route', async t => {
  const f = await fixture(t);
  f.control.responses.push(UNCERTAIN);
  const oldId = await addRequest(f, 'Noch rechtzeitig', OLD_START);
  const newId = await addRequest(f, 'Danach');
  await until(() => event(f, oldId).status === 'uncertain' && !snapshot(f).networkBusy, 'uncertain head before retry');
  const originalPayload = structuredClone(f.control.sends[0].payload);
  assert.equal(event(f, newId).waitingFor.eventId, oldId);
  await f.app.saveSettings({ name: 'Bob', team: 'Zweites Team', webhook: WEBHOOK });
  await f.restart();
  await sleep(90);
  assert.equal(f.control.sends.length, 1);
  assert.equal(event(f, oldId).retryExpired, false);
  await f.app.retryEvent(oldId);
  await until(() => event(f, newId).status === 'sent', 'explicit retry completes before following request');

  assert.equal(f.control.sends.length, 5);
  assert.deepEqual(f.control.sends.map(send => send.ref), [ROUTE_A, ROUTE_A, ROUTE_A, ROUTE_A, ROUTE_A]);
  assert.deepEqual(f.control.sends[1].payload, originalPayload);
  assert.equal(f.control.sends[1].imageRef, IMAGE.ref);
  assert.equal(event(f, oldId).status, 'sent');
  assert.equal(event(f, oldId).attempts, 3);
  assert.equal(event(f, newId).attempts, 2);
  assert.equal(snapshot(f).sessions.length, 0);
  assert.equal(snapshot(f).activeSession, null);
});

test('a durable HTTP 403 route block still stops that webhook while a newly configured route can auto-send', async t => {
  const f = await fixture(t);
  f.control.responses.push({ ok: false, kind: 'permanent', status: 403, blockRoute: true, message: 'Discord erlaubt diese Verbindung nicht.' });
  const firstId = await addRequest(f, 'Gesperrte Verbindung');
  const secondId = await addRequest(f, 'Ebenfalls gesperrt');
  await until(() => event(f, firstId).status === 'failed' && !snapshot(f).networkBusy, '403 blocks route');
  assert.equal(event(f, secondId).status, 'failed');
  assert.equal(event(f, secondId).attempts, 0);
  assert.ok(JSON.parse(f.backing.value).blockedRoutes[ROUTE_A]);
  await f.restart();
  await sleep(90);
  await assert.rejects(addRequest(f, 'Darf nicht durchrutschen'), /gesperrt/);
  await assert.rejects(f.app.retryEvent(firstId), /abgelehnt/);
  assert.equal(f.control.sends.length, 1);

  await f.app.saveSettings({ webhook: WEBHOOK });
  const independentId = await addRequest(f, 'Neue Verbindung');
  await until(() => event(f, independentId).status === 'sent', 'new route remains independent');
  assert.equal(f.control.sends.length, 3);
  assert.equal(f.control.sends[1].ref, ROUTE_B);
  assert.equal(f.control.sends[2].ref, ROUTE_B);
  assert.equal(event(f, firstId).status, 'failed');
  assert.equal(event(f, secondId).status, 'failed');
  assert.ok(JSON.parse(f.backing.value).blockedRoutes[ROUTE_A]);
});

test('automatic FIFO keeps a later stamp behind HTTP 429 until the exact retry deadline', async t => {
  const f = await fixture(t);
  f.control.responses.push({ ok: false, kind: 'rate_limited', retryAfterMs: 200 });
  const firstId = await addRequest(f, 'Mit Sendepause');
  await f.app.start();
  const stampId = snapshot(f).events.find(item => item.type === 'start').id;
  await until(() => f.control.sends.length === 1 && event(f, firstId).nextAttemptAt > SEED_TIME, 'rate-limited automatic first send');
  const deadline = SEED_TIME + 200;
  assert.equal(event(f, firstId).nextAttemptAt, deadline);
  assert.equal(event(f, stampId).waitingFor.eventId, firstId);
  assert.equal(event(f, stampId).waitingFor.status, 'pending');
  assert.equal(event(f, stampId).waitingFor.type, 'request');
  assert.match(event(f, stampId).waitingFor.message, /Sendepause/);

  f.clock.value = deadline - 1;
  await sleep(260); // The real scheduler wakes, but the controlled deadline is not due.
  assert.equal(f.control.sends.length, 1);
  assert.equal(event(f, stampId).attempts, 0);
  f.clock.value = deadline;
  await until(() => event(f, stampId).status === 'sent', 'FIFO resumes at exact retry deadline');
  assert.equal(f.control.sends.length, 4);
  assert.equal(f.control.sends[1].at, deadline);
  assert.equal(f.control.sends[2].at, deadline);
  assert.equal(f.control.sends[3].at, deadline);
  assert.deepEqual(f.control.sends[0].payload, f.control.sends[1].payload);
  assert.equal(f.control.sends[1].imageRef, IMAGE.ref);
  assert.equal(f.control.sends[2].imageRef, undefined);
  assert.ok(f.control.sends[2].payload.poll);
  assert.equal(f.control.sends[3].imageRef, undefined);
  assert.equal(f.control.sends[3].payload.embeds[0].title, 'Dienst gestartet');
  assert.equal(snapshot(f).delivery.sent, 2);
});
