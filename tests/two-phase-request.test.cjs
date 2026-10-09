'use strict';

// Regression for Discord's INVALID_POLL_ATTACHMENTS rejection. The real Core
// must send and durably confirm image and poll separately. Native responses are
// in-memory fakes; autoSync and Node timers run normally, with no live network.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp, validateWebhook } = require('../web/core.js');

const START = Date.parse('2026-10-09T14:20:00+02:00');
const MINUTE = 60_000;
const ROUTE_A = 'a'.repeat(64);
const ROUTE_B = 'b'.repeat(64);
const WEBHOOK = 'https://discord.com/api/webhooks/123456789012345678/' + 'A'.repeat(48);
const IMAGE = Object.freeze({ ref: '1'.repeat(64) + '.png', name: 'Modstempel-Bild.png', mime: 'image/png', size: 2048, width: 1200, height: 675 });
const IMAGE_ID = '223456789012345678';
const POLL_ID = '223456789012345679';
const PARENT_CHANNEL = '323456789012345678';
const THREAD_CHANNEL = '623456789012345678';
const GUILD_ID = '423456789012345678';
const ANSWERS = ['Bin dabei', 'Komme später', 'Kann heute nicht'];
const ACK_IMAGE = Object.freeze({ ok: true, messageId: IMAGE_ID, channelId: THREAD_CHANNEL });
const input = extra => ({ title: 'Moderation für den Stream', startsAt: START + 30 * MINUTE, note: 'Bitte kurz abstimmen.', durationHours: 24, image: IMAGE, ...extra });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const snapshot = f => f.app.getSnapshot();
const request = f => snapshot(f).requests[0];
const persisted = f => JSON.parse(f.backing.value).events.find(event => event.type === 'request');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function until(check, label) {
  const deadline = Date.now() + 2500;
  while (!check()) {
    if (Date.now() >= deadline) assert.fail('autoSync did not complete: ' + label);
    await sleep(5);
  }
}

function pollResult(counts = [0, 0, 0]) {
  return {
    question: { text: 'Wer ist dabei? – Moderation für den Stream' },
    answers: ANSWERS.map((text, index) => ({ answer_id: index + 1, poll_media: { text } })),
    expiry: new Date(START + 24 * 60 * MINUTE).toISOString(),
    results: { is_finalized: false, answer_counts: counts.map((count, index) => ({ id: index + 1, count })) },
  };
}

function assertSeparatedSends(sends) {
  for (const send of sends) {
    assert.deepEqual(send.payload.allowed_mentions, { parse: [] });
    assert.equal(send.payload.username, 'Modstempel');
    if (send.imageRef) {
      assert.equal(send.imageRef, IMAGE.ref);
      assert.equal(Object.hasOwn(send.payload, 'poll'), false);
      assert.deepEqual(send.payload.embeds[0].image, { url: 'attachment://' + IMAGE.name });
      assert.deepEqual(send.payload.attachments, [{ id: 0, filename: IMAGE.name, description: 'Bild zur Stream-Anfrage' }]);
    } else if (send.payload.poll && send.before.request.image) {
      assert.equal(Object.hasOwn(send.payload, 'embeds'), false);
      assert.equal(Object.hasOwn(send.payload, 'attachments'), false);
      assert.equal(typeof send.payload.content, 'string');
      assert.deepEqual(send.payload.poll.answers.map(answer => answer.poll_media.text), ANSWERS);
      assert.equal(send.payload.poll.duration, 24);
      assert.equal(send.payload.poll.allow_multiselect, false);
    }
    assert.equal(JSON.stringify(send.payload).includes(WEBHOOK), false);
    assert.equal(JSON.stringify(send.payload).includes(IMAGE.ref), false);
  }
}

async function fixture(t, options = {}) {
  const clock = { value: START };
  const backing = { value: '' };
  const connection = { configured: true, ref: ROUTE_A, mask: '••5678' };
  const control = { sends: [], responses: [], saves: [], failSaveWhen: null, failedSaves: [], checks: [], opens: [], exports: [] };
  const bridge = {
    native: true,
    loadState() { return backing.value; },
    saveState(json) {
      const next = JSON.parse(json);
      if (control.failSaveWhen && control.failSaveWhen(next)) {
        control.failedSaves.push(next);
        throw new Error('Simulated failure saving image acknowledgment');
      }
      backing.value = json;
      control.saves.push(next);
    },
    getConnection() { return { ...connection }; },
    storeWebhook(url) {
      assert.equal(url, validateWebhook(WEBHOOK));
      Object.assign(connection, { ref: ROUTE_B });
      return { ...connection };
    },
    async send(ref, payload, imageRef) {
      const call = { ref, payload: structuredClone(payload), imageRef, at: clock.value, before: structuredClone(persisted(f)) };
      control.sends.push(call);
      const next = control.responses.length ? control.responses.shift() : {
        ok: true, messageId: (223456789012345678n + BigInt(control.sends.length)).toString(), channelId: THREAD_CHANNEL,
        ...(payload.poll ? { poll: pollResult() } : {}),
      };
      if (next instanceof Error) throw next;
      return typeof next === 'function' ? next(call) : next;
    },
    async check(ref) {
      control.checks.push(ref);
      return { ok: true, name: 'Test-Webhook', guildId: GUILD_ID, channelId: PARENT_CHANNEL };
    },
    async openDiscord(ids) { control.opens.push(structuredClone(ids)); return { ok: true }; },
    async exportFile(filename, mime, content) { control.exports.push({ filename, mime, content }); return { ok: true }; },
  };
  const f = { clock, backing, connection, control, bridge };
  f.restart = async (autoSync = true) => {
    if (f.app) f.app.dispose();
    f.app = createApp({ bridge, now: () => clock.value, autoSync, ticker: false });
    await f.app.init();
  };
  t.after(() => f.app.dispose());
  await f.restart(options.autoSync !== false);
  assert.equal(snapshot(f).ready, true);
  await f.app.saveSettings({ name: 'Alice', team: 'Stream-Team' });
  return f;
}

test('autoSync durably confirms the image before sending a separate poll and only then marks the request sent', async t => {
  const f = await fixture(t);
  const imageRelease = deferred();
  const pollRelease = deferred();
  f.control.responses.push(() => imageRelease.promise, () => pollRelease.promise);
  await f.app.createRequest(input());
  assert.equal(request(f).requestStage, 'image');
  await until(() => f.control.sends.length === 1, 'image stage started');
  assert.equal(request(f).status, 'sending');
  assert.equal(request(f).messageId, undefined);
  assert.equal(request(f).imageMessageId, undefined);
  assert.equal(persisted(f).requestStage, 'image');
  imageRelease.resolve(ACK_IMAGE);

  await until(() => f.control.sends.length === 2, 'poll stage started after checkpoint');
  const beforePoll = f.control.sends[1].before;
  assert.equal(beforePoll.imageMessageId, IMAGE_ID);
  assert.equal(beforePoll.imageChannelId, THREAD_CHANNEL);
  assert.equal(beforePoll.imageSentAt, START);
  assert.equal(beforePoll.requestStage, 'poll');
  assert.equal(beforePoll.messageId, undefined);
  assert.equal(request(f).status, 'sending');
  assert.equal(snapshot(f).delivery.sent, 0);
  assert.ok(f.control.saves.some(state => state.events.some(event => event.imageMessageId === IMAGE_ID && event.requestStage === 'poll' && event.status === 'pending')));
  pollRelease.resolve({ ok: true, messageId: POLL_ID, channelId: THREAD_CHANNEL, poll: pollResult([3, 1, 2]) });
  await until(() => request(f).status === 'sent', 'poll acknowledgment');
  assert.equal(request(f).messageId, POLL_ID);
  assert.equal(request(f).imageMessageId, IMAGE_ID);
  assert.equal(request(f).channelId, THREAD_CHANNEL);
  assert.equal(request(f).attempts, 2);
  assert.deepEqual(request(f).pollSummary.answers.map(answer => answer.count), [3, 1, 2]);
  assert.equal(snapshot(f).events.length, 1);
  assert.equal(snapshot(f).sessions.length, 0);
  assertSeparatedSends(f.control.sends);
});

test('a request without an image retains its existing embed and poll in one automatic POST', async t => {
  const f = await fixture(t);
  await f.app.createRequest(input({ image: null }));
  await until(() => request(f).status === 'sent', 'plain request');
  assert.equal(f.control.sends.length, 1);
  assert.equal(f.control.sends[0].imageRef, undefined);
  assert.ok(f.control.sends[0].payload.poll);
  assert.equal(f.control.sends[0].payload.embeds[0].title, 'Moderation für den Stream');
  assert.equal(f.control.sends[0].payload.attachments, undefined);
  assert.equal(request(f).imageMessageId, undefined);
  assert.equal(request(f).attempts, 1);
  assertSeparatedSends(f.control.sends);
});

test('restart after an image checkpoint and after a poll HTTP 429 resumes only the poll on its original route', async t => {
  const f = await fixture(t);
  f.control.responses.push({ ...ACK_IMAGE, cooldownMs: 100 }, { ok: false, kind: 'rate_limited', retryAfterMs: 175 });
  await f.app.createRequest(input());
  await until(() => request(f).requestStage === 'poll' && request(f).status === 'pending' && !snapshot(f).networkBusy, 'durable image checkpoint');
  assert.equal(f.control.sends.length, 1);
  assert.equal(request(f).imageMessageId, IMAGE_ID);
  assert.equal(request(f).messageId, undefined);
  await f.app.saveSettings({ name: 'Bob', team: 'Zweites Team', webhook: WEBHOOK });
  await f.restart();
  await sleep(60);
  assert.equal(f.control.sends.length, 1);
  f.clock.value = START + 100;
  await until(() => f.control.sends.length === 2 && request(f).nextAttemptAt === START + 275, 'first poll rate limited');
  const firstPoll = structuredClone(f.control.sends[1].payload);
  assert.equal(persisted(f).requestStage, 'poll');
  assert.equal(persisted(f).imageMessageId, IMAGE_ID);
  assert.deepEqual(persisted(f).request.image, IMAGE);
  await f.restart();
  f.clock.value = START + 274;
  await sleep(200);
  assert.equal(f.control.sends.length, 2);
  f.clock.value = START + 275;
  await until(() => request(f).status === 'sent', 'retry poll only at rate-limit deadline');
  assert.equal(f.control.sends.length, 3);
  assert.deepEqual(f.control.sends.map(send => send.imageRef), [IMAGE.ref, undefined, undefined]);
  assert.deepEqual(f.control.sends.map(send => send.ref), [ROUTE_A, ROUTE_A, ROUTE_A]);
  assert.deepEqual(f.control.sends[2].payload, firstPoll);
  assert.equal(f.control.sends[2].at, START + 275);
  assert.equal(request(f).imageMessageId, IMAGE_ID);
  assert.equal(request(f).request.streamer, 'Alice');
  assertSeparatedSends(f.control.sends);
});

test('an unknown or malformed image acknowledgment never starts a poll or automatically repeats the upload', async t => {
  for (const response of [new Error('Image acknowledgment lost'), { ok: true, messageId: 'invalid-image-id', channelId: THREAD_CHANNEL }]) {
    const f = await fixture(t);
    f.control.responses.push(response);
    await f.app.createRequest(input());
    await until(() => request(f).status === 'uncertain' && !snapshot(f).networkBusy, 'uncertain image stage');
    assert.equal(request(f).requestStage, 'image');
    assert.equal(request(f).imageMessageId, undefined);
    assert.equal(request(f).messageId, undefined);
    assert.equal(f.control.sends.length, 1);
    await f.restart();
    await sleep(90);
    assert.equal(f.control.sends.length, 1);
    assert.equal(request(f).status, 'uncertain');
    assert.equal(request(f).requestStage, 'image');
    assertSeparatedSends(f.control.sends);
    f.app.dispose();
  }
});

test('an uncertain poll remains distinct from its confirmed image across restart and an explicit retry sends only the poll', async t => {
  const f = await fixture(t);
  f.control.responses.push(ACK_IMAGE, new Error('Poll acknowledgment lost'));
  await f.app.createRequest(input());
  await until(() => request(f).status === 'uncertain' && !snapshot(f).networkBusy, 'uncertain poll stage');
  const id = request(f).id;
  assert.equal(request(f).requestStage, 'poll');
  assert.equal(request(f).imageMessageId, IMAGE_ID);
  assert.equal(request(f).messageId, undefined);
  assert.equal(f.control.sends.length, 2);
  await f.restart();
  await sleep(90);
  assert.equal(f.control.sends.length, 2);
  assert.equal(request(f).status, 'uncertain');
  await f.app.retryEvent(id);
  await until(() => request(f).status === 'sent', 'explicit poll retry');
  assert.equal(f.control.sends.length, 3);
  assert.equal(f.control.sends[2].imageRef, undefined);
  assert.deepEqual(f.control.sends[2].payload, f.control.sends[1].payload);
  assert.equal(request(f).imageMessageId, IMAGE_ID);
  assert.notEqual(request(f).messageId, IMAGE_ID);
  assert.equal(request(f).attempts, 3);
  assertSeparatedSends(f.control.sends);
});

test('a save failure at the image checkpoint prevents the poll and restart preserves the uncertain upload', async t => {
  const f = await fixture(t);
  f.control.responses.push(ACK_IMAGE);
  f.control.failSaveWhen = state => state.events.some(event => event.imageMessageId === IMAGE_ID);
  await f.app.createRequest(input());
  await until(() => snapshot(f).storageError && !snapshot(f).networkBusy, 'image checkpoint save failure');
  assert.equal(f.control.sends.length, 1);
  assert.equal(f.control.failedSaves.length, 1);
  assert.equal(f.control.failedSaves[0].events[0].requestStage, 'poll');
  assert.equal(persisted(f).requestStage, 'image');
  assert.equal(persisted(f).status, 'sending');
  assert.equal(persisted(f).imageMessageId, undefined);
  assert.deepEqual(persisted(f).request.image, IMAGE);
  f.control.failSaveWhen = null;
  await f.restart();
  await sleep(90);
  assert.equal(snapshot(f).ready, true);
  assert.equal(request(f).requestStage, 'image');
  assert.equal(request(f).status, 'uncertain');
  assert.equal(f.control.sends.length, 1);
  assertSeparatedSends(f.control.sends);
});

test('a confirmed image remains openable on its original route when the poll is rejected or expires before sending', async t => {
  for (const outcome of ['failed', 'skipped']) {
    const f = await fixture(t);
    const deadline = START + MINUTE;
    if (outcome === 'skipped') f.control.responses.push(() => { f.clock.value = deadline; return ACK_IMAGE; });
    else f.control.responses.push(ACK_IMAGE, { ok: false, kind: 'permanent', status: 400, message: 'Discord hat die Umfrage abgelehnt.' });
    await f.app.createRequest(input({ startsAt: deadline }));
    await until(() => request(f).status === outcome && !snapshot(f).networkBusy, 'poll outcome ' + outcome);
    const id = request(f).id;
    assert.equal(request(f).requestStage, 'poll');
    assert.equal(request(f).imageMessageId, IMAGE_ID);
    assert.equal(request(f).messageId, undefined);
    assert.equal(f.control.sends.length, outcome === 'skipped' ? 1 : 2);
    if (outcome === 'skipped') {
      assert.equal(request(f).expired, true);
      assert.match(request(f).error, /Bild/);
      await assert.rejects(f.app.retryEvent(id), /abgelaufen|erneut gesendet/);
    }
    await f.app.saveSettings({ webhook: WEBHOOK });
    await f.restart();
    await f.app.openRequestImage(id);
    assert.deepEqual(f.control.checks, [ROUTE_A]);
    assert.deepEqual(f.control.opens, [{ guildId: GUILD_ID, channelId: THREAD_CHANNEL, messageId: IMAGE_ID }]);
    await assert.rejects(f.app.openRequest(id));
    await f.app.exportData('json');
    assert.equal(JSON.parse(f.control.exports[0].content).events[0].imageMessageId, IMAGE_ID);
    assertSeparatedSends(f.control.sends);
    f.app.dispose();
  }
});

test('a saved failed 1.2.2 request without stage remains unsent until explicit retry migrates it into separate image and poll sends', async t => {
  const f = await fixture(t, { autoSync: false });
  await f.app.createRequest(input());
  const legacy = JSON.parse(f.backing.value);
  const old = legacy.events[0];
  delete old.requestStage;
  old.status = 'failed';
  old.attempts = 1;
  old.error = 'HTTP 400 · Discord 50035 · poll [INVALID_POLL_ATTACHMENTS]';
  const originalRequest = structuredClone(old.request);
  f.backing.value = JSON.stringify(legacy);
  await f.restart();
  await sleep(90);
  assert.equal(snapshot(f).ready, true);
  assert.equal(request(f).status, 'failed');
  assert.equal(request(f).requestStage, undefined);
  assert.equal(request(f).error, old.error);
  assert.equal(f.control.sends.length, 0);
  await f.app.retryEvent(old.id);
  await until(() => request(f).status === 'sent', 'explicit retry of legacy rejected combined request');
  assert.equal(f.control.sends.length, 2);
  assert.equal(f.control.sends[0].before.requestStage, 'image');
  assert.equal(f.control.sends[1].before.requestStage, 'poll');
  assert.equal(request(f).attempts, 3);
  assert.deepEqual(request(f).request, originalRequest);
  assert.equal(request(f).id, old.id);
  assert.equal(snapshot(f).events.length, 1);
  assertSeparatedSends(f.control.sends);
});

test('invalid persisted stage checkpoints are preserved for recovery and never cause an unconfirmed poll send', async t => {
  const f = await fixture(t, { autoSync: false });
  await f.app.createRequest(input());
  const base = JSON.parse(f.backing.value);
  for (const change of [
    { requestStage: 'poll' },
    { requestStage: 'invalid' },
    { requestStage: 'image', imageMessageId: IMAGE_ID, imageSentAt: START },
    { requestStage: 'poll', imageMessageId: 'invalid-image-id', imageSentAt: START },
    { requestStage: 'poll', imageMessageId: IMAGE_ID },
  ]) {
    const broken = structuredClone(base);
    Object.assign(broken.events[0], change);
    const raw = JSON.stringify(broken);
    f.backing.value = raw;
    await f.restart();
    assert.equal(snapshot(f).ready, false);
    assert.ok(snapshot(f).storageError);
    assert.equal(f.backing.value, raw);
    assert.equal(f.control.sends.length, 0);
    await f.app.exportData('json');
    assert.equal(f.control.exports.at(-1).content, raw);
  }
});
