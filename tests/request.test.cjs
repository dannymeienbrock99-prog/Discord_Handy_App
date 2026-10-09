'use strict';

// Request integration tests use an in-memory native bridge and a controlled
// clock. No network, Discord account or real webhook is involved.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp, validateWebhook } = require('../web/core.js');

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const START = Date.parse('2026-10-09T06:00:00Z');
const WEBHOOK = 'https://discord.com/api/webhooks/123456789012345678/' + 'A'.repeat(48);
const ROUTE_A = 'a'.repeat(64);
const ROUTE_B = 'b'.repeat(64);
const CHANNEL_ID = '323456789012345678';
const GUILD_ID = '423456789012345678';
const ANSWERS = ['Bin dabei', 'Komme später', 'Kann heute nicht'];

function poll(counts, extras = {}) {
  const result = {
    question: { text: 'Moderation für den Stream' },
    answers: ANSWERS.map((text, index) => ({ answer_id: index + 1, poll_media: { text } })),
    expiry: new Date(START + DAY).toISOString(),
    ...extras,
  };
  if (counts) result.results = { is_finalized: false, answer_counts: counts.map((count, index) => ({ id: index + 1, count })) };
  return result;
}

async function fixture(options = {}) {
  const clock = { value: options.now ?? START };
  const backing = { value: options.state ? JSON.stringify(options.state) : '' };
  const connection = { configured: true, ref: ROUTE_A, mask: '••5678' };
  const control = {
    failSave: false, sends: [], responses: [], polls: [], pollResponses: [],
    checks: [], checkResponses: [], opens: [], exports: [], saves: [],
  };
  const bridge = {
    native: true,
    loadState() { return backing.value; },
    saveState(json) {
      if (control.failSave) throw new Error('Simulated storage error');
      JSON.parse(json);
      backing.value = json;
      control.saves.push(json);
    },
    getConnection() { return { ...connection }; },
    storeWebhook(url) {
      assert.equal(url, validateWebhook(WEBHOOK));
      Object.assign(connection, { ref: ROUTE_B, mask: '••9876' });
      return { ...connection };
    },
    async send(ref, payload) {
      control.sends.push({ ref, payload: structuredClone(payload), at: clock.value });
      const next = control.responses.length ? control.responses.shift() : {
        ok: true,
        messageId: (223456789012345678n + BigInt(control.sends.length)).toString(),
        channelId: CHANNEL_ID,
        ...(payload.poll ? { poll: poll() } : {}),
      };
      if (next instanceof Error) throw next;
      return typeof next === 'function' ? next(ref, payload) : next;
    },
    async readPoll(ref, messageId) {
      control.polls.push({ ref, messageId });
      const next = control.pollResponses.length ? control.pollResponses.shift() : { ok: true, channelId: CHANNEL_ID, poll: poll([0, 0, 0]) };
      if (next instanceof Error) throw next;
      return typeof next === 'function' ? next(ref, messageId) : next;
    },
    async check(ref) {
      control.checks.push(ref);
      const next = control.checkResponses.length ? control.checkResponses.shift() : { ok: true, name: 'Test-Webhook', channelId: CHANNEL_ID, guildId: GUILD_ID };
      if (next instanceof Error) throw next;
      return next;
    },
    async openDiscord(ids) { control.opens.push(structuredClone(ids)); return { ok: true }; },
    async exportFile(filename, mime, content) { control.exports.push({ filename, mime, content }); return { ok: true }; },
    async clipboard() { return WEBHOOK; },
  };
  const f = { clock, backing, connection, control, bridge };
  f.restart = async () => {
    if (f.app) f.app.dispose();
    f.app = createApp({ bridge, now: () => clock.value, autoSync: false, ticker: false });
    await f.app.init();
    return f.app;
  };
  f.advance = duration => { clock.value += duration; };
  await f.restart();
  assert.equal(f.app.getSnapshot().ready, true);
  if (!options.state) await f.app.saveSettings({ name: 'Alice', team: 'Stream-Team', discordId: '523456789012345678' });
  return f;
}

const snapshot = f => f.app.getSnapshot();
const requestInput = (extra = {}) => ({ title: 'Moderation für den Stream', startsAt: null, note: 'Bitte kurz abstimmen.', durationHours: 24, ...extra });
const requests = f => snapshot(f).events.filter(event => event.type === 'request').toReversed();

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('request preview is pure and creating a request does not stamp or change an active paused service', async () => {
  const f = await fixture();
  const savedBeforePreview = f.backing.value;
  const preview = await f.app.previewRequest(requestInput());
  assert.ok(preview.poll);
  assert.deepEqual(preview.poll.answers.map(answer => answer.poll_media.text), ANSWERS);
  assert.deepEqual(preview.allowed_mentions, { parse: [] });
  assert.equal(f.backing.value, savedBeforePreview);
  assert.equal(f.control.sends.length, 0);
  assert.equal(f.control.checks.length, 0);
  assert.equal(f.control.polls.length, 0);

  await f.app.start();
  f.advance(20 * MINUTE);
  await f.app.pause();
  f.advance(5 * MINUTE);
  const activeBefore = snapshot(f).activeSession;
  await f.app.createRequest(requestInput());
  assert.deepEqual(snapshot(f).activeSession, activeBefore);
  assert.equal(snapshot(f).sessions.length, 1);
  assert.equal(snapshot(f).totals.sessionCount, 1);
  assert.equal(snapshot(f).requests.length, 1);
  assert.equal(requests(f)[0].sessionId, null);
  assert.equal(snapshot(f).activeSession.activeMs, 20 * MINUTE);
  assert.equal(snapshot(f).activeSession.pauseMs, 5 * MINUTE);
  assert.equal(f.control.sends.length, 0);
});

test('a genuine version-1 timeclock-only state loads and survives a request plus restart without changing old records', async () => {
  const profile = { name: 'Legacy Moderator', discordId: '', team: 'Moderation', accent: 'gold', theme: 'dark' };
  const session = {
    id: 'legacy-session', profile: { ...profile }, routeId: ROUTE_A,
    startedAt: START - 20 * MINUTE, endedAt: null, status: 'paused',
    pauses: [{ startedAt: START - 5 * MINUTE, endedAt: null }], note: '', endNote: '',
  };
  const event = (id, type, at, activeMs) => ({
    id, sessionId: session.id, type, at, note: '', routeId: ROUTE_A,
    metrics: { activeMs, pauseMs: 0, totalMs: activeMs },
    status: 'pending', attempts: 0, nextAttemptAt: 0, error: '',
  });
  const legacy = {
    version: 1, profile, sessions: [session],
    events: [event('legacy-start', 'start', session.startedAt, 0), event('legacy-pause', 'pause', START - 5 * MINUTE, 15 * MINUTE)],
    activeId: session.id, blockedRoutes: {}, cooldownUntil: 0, clockAnchor: { wallMs: session.startedAt }, connectionMeta: {},
  };
  const f = await fixture({ state: legacy });
  assert.equal(snapshot(f).requests.length, 0);
  assert.equal(snapshot(f).activeSession.activeMs, 15 * MINUTE);
  assert.equal(snapshot(f).activeSession.pauseMs, 5 * MINUTE);
  await f.app.createRequest(requestInput());
  const id = requests(f)[0].id;
  await f.restart();
  assert.equal(snapshot(f).ready, true);
  assert.equal(snapshot(f).requests.length, 1);
  assert.equal(requests(f)[0].id, id);
  const persisted = JSON.parse(f.backing.value);
  assert.deepEqual(persisted.sessions, legacy.sessions);
  assert.deepEqual(persisted.events.slice(0, 2), legacy.events);
  assert.equal(snapshot(f).activeSession.id, 'legacy-session');
  assert.equal(f.control.sends.length, 0);
});

test('requests enforce poll input boundaries and maximum valid text remains mention-safe', async () => {
  const f = await fixture();
  for (const invalid of [
    { title: '' }, { title: 'x'.repeat(121) }, { note: 'x'.repeat(281) },
    { durationHours: 0 }, { durationHours: 169 }, { durationHours: 1.5 },
    { startsAt: START }, { startsAt: START - 1 }, { startsAt: START + 31 * DAY + 1 },
  ]) await assert.rejects(async () => f.app.createRequest(requestInput(invalid)));
  assert.equal(requests(f).length, 0);
  const input = requestInput({ title: '@everyone ' + 'x'.repeat(110), note: '@here ' + '`'.repeat(274), durationHours: 168, startsAt: START + 31 * DAY });
  await f.app.createRequest(input);
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 1);
  const payload = f.control.sends[0].payload;
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  assert.equal(payload.poll.duration, 168);
  assert.deepEqual(payload.poll.answers.map(answer => answer.poll_media.text), ANSWERS);
  assert.ok(payload.poll.question.text.length <= 300);
  assert.ok(JSON.stringify(payload).includes('@everyone'));
});

test('identical concurrent requests are deduplicated for 60 seconds without duplicating the durable event', async () => {
  const f = await fixture();
  const input = requestInput();
  const results = await Promise.allSettled([f.app.createRequest(input), f.app.createRequest(input)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.equal(requests(f).length, 1);
  f.advance(MINUTE - 1);
  await f.restart();
  await assert.rejects(f.app.createRequest(input));
  assert.equal(requests(f).length, 1);
  f.advance(1);
  await f.app.createRequest(input);
  assert.equal(requests(f).length, 2);
  assert.notEqual(requests(f)[0].id, requests(f)[1].id);
});

test('requests and stamps share one single-flight FIFO with stable payloads', async () => {
  const f = await fixture();
  await f.app.createRequest(requestInput());
  await f.app.start();
  const started = deferred();
  const release = deferred();
  f.control.responses.push(() => { started.resolve(); return release.promise; });
  const firstFlush = f.app.flushQueue();
  await started.promise;
  const secondFlush = f.app.flushQueue();
  assert.equal(f.control.sends.length, 1);
  assert.ok(f.control.sends[0].payload.poll);
  release.resolve({ ok: true, messageId: '223456789012345678', channelId: CHANNEL_ID, poll: poll() });
  await Promise.all([firstFlush, secondFlush]);
  assert.equal(f.control.sends.length, 2);
  assert.equal(f.control.sends[1].payload.embeds[0].title, 'Dienst gestartet');
  assert.equal(snapshot(f).delivery.sent, 2);

  const id = requests(f)[0].id;
  const stampStarted = deferred();
  const stampRelease = deferred();
  await f.app.pause();
  f.control.responses.push(() => { stampStarted.resolve(); return stampRelease.promise; });
  const stampFlush = f.app.flushQueue();
  await stampStarted.promise;
  await assert.rejects(f.app.refreshRequest(id), /warten/);
  await assert.rejects(f.app.checkConnection(), /warten/);
  assert.equal(f.control.polls.length, 0);
  assert.equal(f.control.checks.length, 0);
  stampRelease.resolve({ ok: true, messageId: '223456789012345680', channelId: CHANNEL_ID });
  await stampFlush;

  const readStarted = deferred();
  const readRelease = deferred();
  f.control.pollResponses.push(() => { readStarted.resolve(); return readRelease.promise; });
  const reading = f.app.refreshRequest(id);
  await readStarted.promise;
  await f.app.resume();
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 3);
  readRelease.resolve({ ok: true, channelId: CHANNEL_ID, poll: poll([1, 0, 0]) });
  await reading;
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 4);
  assert.equal(f.control.sends[3].payload.embeds[0].title, 'Dienst fortgesetzt');
});

test('a rate-limited request keeps a later stamp waiting until the exact retry deadline', async () => {
  const f = await fixture();
  await f.app.createRequest(requestInput());
  await f.app.start();
  f.control.responses.push({ ok: false, kind: 'rate_limited', retryAfterMs: 1750 });
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 1);
  await assert.rejects(f.app.checkConnection(), /Sendepause/);
  assert.equal(f.control.checks.length, 0);
  f.advance(1749);
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 1);
  f.advance(1);
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 3);
  assert.deepEqual(f.control.sends[0].payload, f.control.sends[1].payload);
  assert.ok(!f.control.sends[2].payload.poll);
  assert.equal(snapshot(f).delivery.sent, 2);
});

test('a request that expires before delivery is skipped and releases a later stamp, including after restart', async () => {
  for (const startsAt of [START + MINUTE, null]) {
    const f = await fixture();
    await f.app.createRequest(requestInput({ startsAt }));
    await f.app.start();
    f.advance(startsAt ? MINUTE : HOUR);
    await f.restart();
    await f.app.flushQueue();
    assert.equal(requests(f)[0].status, 'skipped');
    assert.equal(requests(f)[0].expired, true);
    assert.equal(f.control.sends.length, 1);
    assert.equal(f.control.sends[0].payload.embeds[0].title, 'Dienst gestartet');
    assert.equal(snapshot(f).delivery.sent, 1);
    assert.equal(snapshot(f).activeSession.status, 'active');
  }
});

test('an uncertain poll keeps its place after restart and is resent only through explicit retry', async () => {
  const f = await fixture();
  await f.app.createRequest(requestInput());
  await f.app.start();
  f.control.responses.push(new Error('Timeout after poll transmission'));
  await f.app.flushQueue();
  const event = requests(f)[0];
  assert.equal(event.status, 'uncertain');
  assert.equal(f.control.sends.length, 1);
  await f.restart();
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 1);
  await f.app.retryEvent(event.id);
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 3);
  assert.deepEqual(f.control.sends[0].payload, f.control.sends[1].payload);
  assert.equal(snapshot(f).delivery.sent, 2);
});

test('request identity and route are immutable; opening an older request resolves metadata using its original route', async () => {
  const f = await fixture();
  await f.app.createRequest(requestInput());
  const first = requests(f)[0];
  assert.equal(first.request.streamer, 'Alice');
  assert.equal(first.request.team, 'Stream-Team');
  await f.app.saveSettings({ name: 'Bob', team: 'Zweites Team', webhook: WEBHOOK });
  await f.app.createRequest(requestInput({ title: 'Zweiter Stream' }));
  const threadId = '623456789012345678';
  f.control.responses.push({ ok: true, messageId: '223456789012345679', channelId: threadId, poll: poll() });
  await f.app.flushQueue();
  assert.deepEqual(f.control.sends.map(send => send.ref), [ROUTE_A, ROUTE_B]);
  assert.deepEqual(requests(f)[0].request, first.request);
  assert.equal(requests(f)[1].request.streamer, 'Bob');
  await f.app.openRequest(first.id);
  assert.deepEqual(f.control.checks, [ROUTE_A]);
  assert.deepEqual(f.control.opens, [{ guildId: GUILD_ID, channelId: threadId, messageId: '223456789012345679' }]);
  for (const value of Object.values(f.control.opens[0])) assert.match(value, /^\d{17,20}$/);

  await f.app.exportData('json');
  const exported = JSON.parse(f.control.exports[0].content);
  assert.equal(exported.events.filter(event => event.type === 'request').length, 2);
  for (const content of [f.backing.value, f.control.exports[0].content]) {
    assert.equal(content.includes(WEBHOOK), false);
    assert.equal(content.includes('A'.repeat(48)), false);
    assert.equal(content.includes('"webhook"'), false);
  }
});

test('pending requests and malformed Discord IDs never reach the native external-link opener', async () => {
  const f = await fixture();
  await f.app.createRequest(requestInput());
  const id = requests(f)[0].id;
  await assert.rejects(f.app.openRequest(id));
  assert.equal(f.control.opens.length, 0);
  f.control.responses.push({ ok: true, messageId: 'invalid-message-id', channelId: CHANNEL_ID, poll: poll() });
  await f.app.flushQueue();
  await assert.rejects(f.app.openRequest(id));
  assert.equal(f.control.opens.length, 0);
});

test('poll counts are matched by answer ID and missing results preserve previous counts as explicitly stale', async () => {
  const f = await fixture();
  await f.app.createRequest(requestInput());
  await f.app.flushQueue();
  const id = requests(f)[0].id;
  assert.equal(Boolean(snapshot(f).requests[0].pollSummary?.known), false);
  const counted = poll();
  counted.results = { is_finalized: false, answer_counts: [{ id: 3, count: 2 }, { id: 1, count: 5 }, { id: 2, count: 1 }] };
  f.control.pollResponses.push({ ok: true, channelId: CHANNEL_ID, poll: counted });
  await f.app.refreshRequest(id);
  const known = snapshot(f).requests[0].pollSummary;
  assert.equal(known.known, true);
  assert.equal(Boolean(known.stale), false);
  assert.deepEqual(known.answers.map(answer => answer.count), [5, 1, 2]);
  assert.deepEqual(known.answers.map(answer => answer.text), ANSWERS);
  assert.equal(known.isFinalized, false);
  assert.equal(known.expiresAt, START + DAY);
  assert.deepEqual(f.control.polls, [{ ref: ROUTE_A, messageId: '223456789012345679' }]);

  f.advance(MINUTE);
  f.control.pollResponses.push({ ok: true, channelId: CHANNEL_ID, poll: poll() });
  await f.app.refreshRequest(id);
  const stale = snapshot(f).requests[0].pollSummary;
  assert.equal(stale.known, true);
  assert.equal(stale.stale, true);
  assert.deepEqual(stale.answers.map(answer => answer.count), [5, 1, 2]);
  await f.restart();
  assert.equal(snapshot(f).requests[0].pollSummary.stale, true);
  assert.deepEqual(snapshot(f).requests[0].pollSummary.answers.map(answer => answer.count), [5, 1, 2]);
});

test('an uncounted poll stays unknown and a subsequent finalized poll exposes only answer totals', async () => {
  const f = await fixture();
  await f.app.createRequest(requestInput());
  await f.app.flushQueue();
  const id = requests(f)[0].id;
  f.control.pollResponses.push({ ok: true, channelId: CHANNEL_ID, poll: poll() });
  await f.app.refreshRequest(id);
  const unknown = snapshot(f).requests[0].pollSummary;
  assert.equal(unknown.known, false);
  assert.deepEqual(unknown.answers.map(answer => answer.count), [null, null, null]);

  const finalized = poll([3, 2, 0]);
  finalized.results.is_finalized = true;
  f.control.pollResponses.push({ ok: true, channelId: CHANNEL_ID, poll: finalized });
  await f.app.refreshRequest(id);
  const final = snapshot(f).requests[0].pollSummary;
  assert.equal(final.known, true);
  assert.equal(Boolean(final.stale), false);
  assert.equal(final.isFinalized, true);
  assert.deepEqual(final.answers.map(answer => answer.count), [3, 2, 0]);
  assert.ok(final.answers.every(answer => !Object.hasOwn(answer, 'voters')));
  assert.equal(f.control.opens.length, 0);
});

test('a failed request save creates no phantom poll, durable event or network operation', async () => {
  const f = await fixture();
  const before = f.backing.value;
  f.control.failSave = true;
  await assert.rejects(f.app.createRequest(requestInput()), /Speichern/);
  assert.equal(f.backing.value, before);
  assert.equal(requests(f).length, 0);
  assert.equal(snapshot(f).requests.length, 0);
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 0);
  assert.equal(f.control.checks.length, 0);
  assert.equal(f.control.polls.length, 0);
});
