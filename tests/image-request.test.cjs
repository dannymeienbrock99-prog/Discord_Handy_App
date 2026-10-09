'use strict';

// Offline integration checks for durable request images. The native boundary
// uses fake references only; no file picker, image download or Discord request
// is opened by these tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp, buildRequestPayload, normalizeRequestImage, validateWebhook } = require('../web/core.js');

const START = Date.parse('2026-10-09T10:00:00Z');
const MINUTE = 60_000;
const WEBHOOK = 'https://discord.com/api/webhooks/123456789012345678/' + 'A'.repeat(48);
const ROUTE_A = 'a'.repeat(64);
const ROUTE_B = 'b'.repeat(64);
const CHANNEL_ID = '323456789012345678';
const IMAGE_A = Object.freeze({ ref: '1'.repeat(64) + '.png', name: 'Modstempel-Bild.png', mime: 'image/png', size: 2048, width: 1200, height: 675 });
const IMAGE_B = Object.freeze({ ref: '2'.repeat(64) + '.jpg', name: 'Modstempel-Bild.jpg', mime: 'image/jpeg', size: 3072, width: 1600, height: 900 });
const IMAGE_C = Object.freeze({ ref: '3'.repeat(64) + '.webp', name: 'Modstempel-Bild.webp', mime: 'image/webp', size: 4096, width: 800, height: 800 });
const PRIVATE_BYTES = 'data:image/png;base64,THIS_IS_A_FAKE_PRIVATE_IMAGE_BODY';

const input = extra => ({ title: 'Gemeinsamer Stream', startsAt: null, note: 'Bitte kurz abstimmen.', durationHours: 24, ...extra });
const snapshot = f => f.app.getSnapshot();
const requests = f => snapshot(f).requests.toReversed();

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function fixture(options = {}) {
  const clock = { value: START };
  const backing = { value: options.state ? JSON.stringify(options.state) : '' };
  const connection = { configured: true, ref: ROUTE_A, mask: '••5678' };
  const control = { failSave: false, sends: [], responses: [], saves: [], picks: 0, pickResponses: [], discards: [], exports: [] };
  const bridge = {
    native: options.native !== false,
    loadState() { return backing.value; },
    saveState(json) {
      if (control.failSave) throw new Error('Simulated device storage failure');
      JSON.parse(json);
      backing.value = json;
      control.saves.push(json);
    },
    getConnection() { return { ...connection }; },
    storeWebhook(url) {
      assert.equal(url, validateWebhook(WEBHOOK));
      Object.assign(connection, { configured: true, ref: ROUTE_B });
      return { ...connection };
    },
    async pickImage() {
      control.picks++;
      const next = control.pickResponses.length ? control.pickResponses.shift() : { ok: true, image: IMAGE_A };
      if (next instanceof Error) throw next;
      return typeof next === 'function' ? next() : next;
    },
    async discardImage(ref) {
      control.discards.push(ref);
      return { ok: true, removed: true };
    },
    async send(ref, payload, imageRef) {
      control.sends.push({ ref, payload: structuredClone(payload), imageRef, at: clock.value });
      const next = control.responses.length ? control.responses.shift() : {
        ok: true, messageId: (223456789012345678n + BigInt(control.sends.length)).toString(), channelId: CHANNEL_ID,
      };
      if (next instanceof Error) throw next;
      return typeof next === 'function' ? next(ref, payload, imageRef) : next;
    },
    async exportFile(filename, mime, content) { control.exports.push({ filename, mime, content }); return { ok: true }; },
  };
  const f = { clock, backing, connection, control, bridge };
  f.advance = ms => { clock.value += ms; };
  f.restart = async () => {
    if (f.app) f.app.dispose();
    f.app = createApp({ bridge, now: () => clock.value, autoSync: false, ticker: false });
    await f.app.init();
    return f.app;
  };
  await f.restart();
  if (!options.state) await f.app.saveSettings({ name: 'Alice', team: 'Stream-Team' });
  return f;
}

test('request images accept the three native formats, enforce file limits and whitelist metadata', () => {
  assert.equal(normalizeRequestImage(null), null);
  assert.equal(normalizeRequestImage(undefined), null);
  for (const image of [IMAGE_A, IMAGE_B, IMAGE_C]) {
    const extra = { ...image, base64: PRIVATE_BYTES, localPath: '/private/fake-user-image', webhook: WEBHOOK, surprise: { bytes: PRIVATE_BYTES } };
    const normalized = normalizeRequestImage(extra);
    assert.deepEqual(normalized, image);
    assert.notEqual(normalized, image);
    assert.equal(extra.base64, PRIVATE_BYTES);
  }
  assert.deepEqual(normalizeRequestImage({ ...IMAGE_A, size: 8 * 1024 * 1024, width: 8000, height: 4000 }), { ...IMAGE_A, size: 8 * 1024 * 1024, width: 8000, height: 4000 });
  assert.deepEqual(normalizeRequestImage({ ...IMAGE_A, width: 8192, height: 1 }), { ...IMAGE_A, width: 8192, height: 1 });
  for (const invalid of [
    '', false, [], {},
    { ...IMAGE_A, ref: '../image.png' },
    { ...IMAGE_A, ref: 'F'.repeat(64) + '.png' },
    { ...IMAGE_A, ref: '1'.repeat(63) + '.png' },
    { ...IMAGE_A, ref: IMAGE_A.ref + '?file=other' },
    { ...IMAGE_A, ref: '1'.repeat(64) + '.gif' },
    { ...IMAGE_A, name: 'My Photo.png' },
    { ...IMAGE_A, name: 'Modstempel-Bild.jpg' },
    { ...IMAGE_A, mime: 'image/jpeg' },
    { ...IMAGE_A, size: 0 },
    { ...IMAGE_A, size: 8 * 1024 * 1024 + 1 },
    { ...IMAGE_A, size: 1.5 },
    { ...IMAGE_A, size: '2048' },
    { ...IMAGE_A, width: 0 },
    { ...IMAGE_A, height: -1 },
    { ...IMAGE_A, width: 8193 },
    { ...IMAGE_A, height: 8193 },
    { ...IMAGE_A, width: 8000, height: 4001 },
    { ...IMAGE_A, width: 100.5 },
    { ...IMAGE_A, height: NaN },
  ]) assert.throws(() => normalizeRequestImage(invalid));
});

test('image and poll previews stay separate, preserve their contents and do not persist or send', async () => {
  const f = await fixture();
  const before = f.backing.value;
  const plain = f.app.previewRequest(input());
  const withImage = f.app.previewRequest(input({ image: { ...IMAGE_A, bytes: PRIVATE_BYTES, webhook: WEBHOOK } }));
  assert.equal(Object.hasOwn(withImage, 'poll'), false);
  assert.deepEqual(withImage.allowed_mentions, { parse: [] });
  assert.deepEqual(withImage.attachments, [{ id: 0, filename: IMAGE_A.name, description: 'Bild zur Stream-Anfrage' }]);
  assert.deepEqual(withImage.embeds[0].image, { url: 'attachment://' + IMAGE_A.name });
  assert.equal(withImage.embeds[0].title, plain.embeds[0].title);
  assert.equal(withImage.embeds[0].description, plain.embeds[0].description);
  const pollOnly = buildRequestPayload({ id: 'vorschau', type: 'request', at: START, requestStage: 'poll', imageMessageId: '223456789012345678', imageChannelId: CHANNEL_ID, request: { ...input({ image: IMAGE_A }), streamer: 'Alice', team: 'Stream-Team' } });
  assert.deepEqual(pollOnly.poll, plain.poll);
  assert.equal(Object.hasOwn(pollOnly, 'embeds'), false);
  assert.equal(Object.hasOwn(pollOnly, 'attachments'), false);
  assert.equal(typeof pollOnly.content, 'string');
  assert.equal(f.backing.value, before);
  assert.equal(f.control.sends.length, 0);
  assert.equal(f.control.picks, 0);
  for (const payload of [withImage, pollOnly]) for (const privateValue of [PRIVATE_BYTES, WEBHOOK, IMAGE_A.ref, '/private/']) assert.equal(JSON.stringify(payload).includes(privateValue), false);
});

test('old request states without images load and send with their original message format', async () => {
  const legacy = await fixture();
  await legacy.app.createRequest(input());
  const state = JSON.parse(legacy.backing.value);
  delete state.events[0].request.image;
  const f = await fixture({ state });
  assert.equal(snapshot(f).ready, true);
  assert.equal(Object.hasOwn(requests(f)[0].request, 'image'), false);
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 1);
  assert.equal(f.control.sends[0].imageRef, undefined);
  assert.equal(Object.hasOwn(f.control.sends[0].payload, 'attachments'), false);
  assert.equal(Object.hasOwn(f.control.sends[0].payload.embeds[0], 'image'), false);
  assert.deepEqual(f.control.sends[0].payload.poll.answers.map(a => a.poll_media.text), ['Bin dabei', 'Komme später', 'Kann heute nicht']);
});

test('picker cancellation and failures leave the durable state untouched and release imageBusy', async () => {
  const f = await fixture();
  const before = f.backing.value;
  f.control.pickResponses.push({ ok: false, kind: 'cancelled' });
  assert.equal(await f.app.pickRequestImage(), null);
  assert.equal(snapshot(f).imageBusy, false);
  f.control.pickResponses.push({ ok: false, kind: 'validation', message: 'Dieses Bild ist zu groß.' });
  await assert.rejects(f.app.pickRequestImage(), /groß/);
  assert.equal(snapshot(f).imageBusy, false);
  f.control.pickResponses.push(new Error('Picker unavailable'));
  await assert.rejects(f.app.pickRequestImage());
  assert.equal(snapshot(f).imageBusy, false);
  f.control.pickResponses.push({ ok: true, image: { ...IMAGE_A, ref: '../bad.png' } });
  await assert.rejects(f.app.pickRequestImage());
  assert.equal(snapshot(f).imageBusy, false);
  f.control.pickResponses.push({ ok: true });
  await assert.rejects(f.app.pickRequestImage());
  assert.equal(snapshot(f).imageBusy, false);
  assert.equal(f.backing.value, before);
  assert.equal(f.control.sends.length, 0);
  assert.equal(f.control.discards.length, 0);
});

test('an open picker is single-flight locally while already queued timestamp delivery can continue', async () => {
  const f = await fixture();
  await f.app.start();
  const started = deferred();
  const release = deferred();
  f.control.pickResponses.push(() => { started.resolve(); return release.promise; });
  const selecting = f.app.pickRequestImage();
  await started.promise;
  assert.equal(snapshot(f).imageBusy, true);
  assert.equal(snapshot(f).networkBusy, false);
  await assert.rejects(f.app.pickRequestImage());
  assert.equal(f.control.picks, 1);
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 1);
  assert.equal(f.control.sends[0].payload.embeds[0].title, 'Dienst gestartet');
  release.resolve({ ok: true, image: { ...IMAGE_A, privateBytes: PRIVATE_BYTES } });
  assert.deepEqual(await selecting, IMAGE_A);
  assert.equal(snapshot(f).imageBusy, false);
  assert.equal(requests(f).length, 0);
});

test('image URLs are confined to app storage and the non-native browser cannot open the Android picker', async () => {
  const f = await fixture();
  assert.equal(f.app.requestImageUrl(null), '');
  assert.equal(f.app.requestImageUrl(undefined), '');
  for (const image of [IMAGE_A, IMAGE_B, IMAGE_C]) assert.equal(f.app.requestImageUrl(image), 'https://appassets.androidplatform.net/images/' + image.ref);
  assert.throws(() => f.app.requestImageUrl({ ...IMAGE_A, ref: 'https://example.invalid/photo.png' }));
  const browser = await fixture({ native: false });
  await assert.rejects(browser.app.pickRequestImage());
  await assert.rejects(browser.app.createRequest(input({ image: IMAGE_A })));
  assert.equal(browser.control.picks, 0);
  assert.equal(snapshot(browser).imageBusy, false);
  assert.equal(requests(browser).length, 0);
  await browser.app.createRequest(input());
  assert.equal(requests(browser)[0].status, 'skipped');
  assert.equal(browser.control.sends.length, 0);
});

test('a selected image is copied into the durable request and survives restart without changing duty time', async () => {
  const f = await fixture();
  await f.app.start();
  f.advance(10 * MINUTE);
  await f.app.pause();
  const active = snapshot(f).activeSession;
  const picked = await f.app.pickRequestImage();
  await f.app.createRequest(input({ image: picked }));
  const id = requests(f)[0].id;
  picked.ref = IMAGE_B.ref;
  picked.name = IMAGE_B.name;
  assert.deepEqual(requests(f)[0].request.image, IMAGE_A);
  assert.deepEqual(snapshot(f).activeSession, active);
  assert.deepEqual(JSON.parse(f.backing.value).events.find(e => e.id === id).request.image, IMAGE_A);
  await f.restart();
  assert.equal(snapshot(f).ready, true);
  assert.deepEqual(requests(f)[0].request.image, IMAGE_A);
  assert.equal(requests(f)[0].id, id);
  assert.deepEqual(snapshot(f).activeSession, active);
  const view = requests(f)[0];
  view.request.image.ref = IMAGE_C.ref;
  assert.deepEqual(requests(f)[0].request.image, IMAGE_A);
});

test('requests keep their original image and route across rate limits, profile edits and restart', async () => {
  const f = await fixture();
  await f.app.createRequest(input({ image: IMAGE_A }));
  f.control.responses.push({ ok: false, kind: 'rate_limited', retryAfterMs: 1750 });
  await f.app.flushQueue();
  await f.app.saveSettings({ name: 'Bob', team: 'Zweites Team', webhook: WEBHOOK });
  await f.app.createRequest(input({ image: IMAGE_B }));
  f.advance(1749);
  await f.restart();
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 1);
  f.advance(1);
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 5);
  assert.deepEqual(f.control.sends.map(s => s.ref), [ROUTE_A, ROUTE_A, ROUTE_A, ROUTE_B, ROUTE_B]);
  assert.deepEqual(f.control.sends.map(s => s.imageRef), [IMAGE_A.ref, IMAGE_A.ref, undefined, IMAGE_B.ref, undefined]);
  assert.deepEqual(f.control.sends[0].payload, f.control.sends[1].payload);
  assert.ok(f.control.sends[2].payload.poll);
  assert.ok(f.control.sends[4].payload.poll);
  assert.equal(f.control.sends[2].payload.attachments, undefined);
  assert.equal(f.control.sends[4].payload.attachments, undefined);
  assert.deepEqual(requests(f)[0].request.image, IMAGE_A);
  assert.equal(requests(f)[0].request.streamer, 'Alice');
  assert.equal(requests(f)[1].request.streamer, 'Bob');
  assert.equal(snapshot(f).delivery.sent, 2);
});

test('an uncertain image upload never silently resends and explicit retry uses the same attachment', async () => {
  const f = await fixture();
  await f.app.createRequest(input({ image: IMAGE_A }));
  await f.app.start();
  f.control.responses.push(new Error('Confirmation was lost after upload'));
  await f.app.flushQueue();
  const id = requests(f)[0].id;
  assert.equal(requests(f)[0].status, 'uncertain');
  await f.restart();
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 1);
  await f.app.retryEvent(id);
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 4);
  assert.deepEqual(f.control.sends[0].payload, f.control.sends[1].payload);
  assert.equal(f.control.sends[1].imageRef, IMAGE_A.ref);
  assert.equal(f.control.sends[2].imageRef, undefined);
  assert.ok(f.control.sends[2].payload.poll);
  assert.equal(f.control.sends[3].imageRef, undefined);
  assert.equal(f.control.sends[3].payload.embeds[0].title, 'Dienst gestartet');
});

test('an image upload shares the existing single-flight queue with later stamps', async () => {
  const f = await fixture();
  await f.app.createRequest(input({ image: IMAGE_A }));
  await f.app.start();
  const started = deferred();
  const release = deferred();
  f.control.responses.push(() => { started.resolve(); return release.promise; });
  const sending = f.app.flushQueue();
  await started.promise;
  const overlapping = f.app.flushQueue();
  assert.equal(snapshot(f).networkBusy, true);
  assert.equal(f.control.sends.length, 1);
  assert.equal(f.control.sends[0].imageRef, IMAGE_A.ref);
  release.resolve({ ok: true, messageId: '223456789012345678', channelId: CHANNEL_ID });
  await Promise.all([sending, overlapping]);
  assert.equal(f.control.sends.length, 3);
  assert.equal(f.control.sends[1].imageRef, undefined);
  assert.ok(f.control.sends[1].payload.poll);
  assert.equal(f.control.sends[2].payload.embeds[0].title, 'Dienst gestartet');
  assert.equal(snapshot(f).networkBusy, false);
});

test('discard retains images referenced by pending or sent requests and removes only unused selections', async () => {
  const f = await fixture();
  await f.app.createRequest(input({ image: IMAGE_A }));
  for (const afterSend of [false, true]) {
    if (afterSend) await f.app.flushQueue();
    const result = await f.app.discardRequestImage(IMAGE_A.ref);
    assert.equal(result.ok, true);
    assert.equal(result.removed, false);
    assert.equal(result.retained, true);
    assert.equal(f.control.discards.length, 0);
  }
  await f.restart();
  const retained = await f.app.discardRequestImage(IMAGE_A.ref);
  assert.equal(retained.retained, true);
  const unused = await f.app.discardRequestImage(IMAGE_B.ref);
  assert.equal(unused.ok, true);
  assert.equal(unused.removed, true);
  assert.deepEqual(f.control.discards, [IMAGE_B.ref]);
  await assert.rejects(f.app.discardRequestImage('../not-a-picture.png'));
  assert.deepEqual(f.control.discards, [IMAGE_B.ref]);
});

test('save failures preserve the selected image and prevent both a phantom event and a premature upload', async () => {
  const f = await fixture();
  const selected = await f.app.pickRequestImage();
  const before = f.backing.value;
  f.control.failSave = true;
  await assert.rejects(f.app.createRequest(input({ image: selected })), /Speichern/);
  assert.equal(f.backing.value, before);
  assert.equal(requests(f).length, 0);
  assert.deepEqual(selected, IMAGE_A);
  assert.equal(f.control.discards.length, 0);
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 0);

  const queued = await fixture();
  await queued.app.createRequest(input({ image: IMAGE_B }));
  const durable = queued.backing.value;
  queued.control.failSave = true;
  await assert.rejects(queued.app.flushQueue(), /Speichern/);
  assert.equal(queued.control.sends.length, 0);
  assert.equal(queued.backing.value, durable);
  assert.equal(requests(queued)[0].status, 'pending');
  assert.equal(requests(queued)[0].attempts, 0);
  assert.deepEqual(requests(queued)[0].request.image, IMAGE_B);
  assert.equal(queued.control.discards.length, 0);
});

test('loaded image metadata is sanitized and exports contain neither image bytes nor webhook credentials', async () => {
  const original = await fixture();
  await original.app.createRequest(input({ image: IMAGE_A }));
  const state = JSON.parse(original.backing.value);
  Object.assign(state.events[0].request.image, { data: PRIVATE_BYTES, localPath: '/private/fake-image', webhook: WEBHOOK });
  const f = await fixture({ state });
  assert.equal(snapshot(f).ready, true);
  assert.deepEqual(requests(f)[0].request.image, IMAGE_A);
  await f.app.exportData('json');
  await f.app.flushQueue();
  for (const content of [f.control.exports[0].content, f.backing.value, JSON.stringify(f.control.sends[0].payload)]) {
    for (const privateValue of [PRIVATE_BYTES, WEBHOOK, 'A'.repeat(48), '/private/fake-image']) assert.equal(content.includes(privateValue), false);
  }
  assert.deepEqual(JSON.parse(f.control.exports[0].content).events[0].request.image, IMAGE_A);
  assert.equal(JSON.stringify(f.control.sends[0].payload).includes(IMAGE_A.ref), false);
});

test('invalid persisted image metadata preserves the original state for recovery and never reaches send', async () => {
  const original = await fixture();
  await original.app.createRequest(input({ image: IMAGE_A }));
  const state = JSON.parse(original.backing.value);
  state.events[0].request.image.ref = '../broken.png';
  const raw = JSON.stringify(state);
  const f = await fixture({ state });
  assert.equal(snapshot(f).ready, false);
  assert.ok(snapshot(f).storageError);
  assert.equal(f.backing.value, raw);
  assert.equal(f.control.saves.length, 0);
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 0);
  await f.app.exportData('json');
  assert.equal(f.control.exports[0].content, raw);
});

test('a missing native image fails the event without sending a text-only replacement or deleting its reference', async () => {
  const f = await fixture();
  await f.app.createRequest(input({ image: IMAGE_A }));
  f.control.responses.push({ ok: false, kind: 'permanent', message: 'Das gespeicherte Bild fehlt.' });
  await f.app.flushQueue();
  assert.equal(requests(f)[0].status, 'failed');
  assert.match(requests(f)[0].error, /Bild fehlt/);
  assert.deepEqual(requests(f)[0].request.image, IMAGE_A);
  await f.restart();
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 1);
  assert.equal(f.control.sends[0].imageRef, IMAGE_A.ref);
  assert.equal(f.control.discards.length, 0);
});
