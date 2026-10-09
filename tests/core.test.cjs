'use strict';

// Offline integration tests for Modstempel. Every native boundary is an in-memory
// fake; this test suite never opens a socket or contacts Discord.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createApp,
  validateWebhook,
  sessionTotals,
  rangeTotals,
  buildPayload,
  formatDuration,
} = require('../web/core.js');

const MINUTE = 60_000;
const START = Date.parse('2026-10-09T06:00:00Z');
const SAFE_WEBHOOK = 'https://discord.com/api/webhooks/123456789012345678/' + 'A'.repeat(48);

function fakeNative(options = {}) {
  const clock = options.clock || { value: START };
  const backing = options.backing || { value: '' };
  const connection = options.connection || { configured: true, ref: 'route-a', mask: '••1234' };
  const control = { failSave: false, nextRef: 'route-b', responses: [], saves: [], sends: [], exports: [], checks: [] };
  const bridge = {
    native: true,
    loadState() {
      if (options.loadError) throw options.loadError;
      return backing.value;
    },
    saveState(json) {
      if (control.failSave) throw new Error('Simulated full device storage');
      assert.equal(typeof json, 'string');
      JSON.parse(json);
      backing.value = json;
      control.saves.push(json);
    },
    getConnection() { return { ...connection }; },
    storeWebhook(url) {
      assert.equal(url, validateWebhook(SAFE_WEBHOOK));
      Object.assign(connection, { configured: true, ref: control.nextRef, mask: '••5678' });
      return { ...connection };
    },
    async send(ref, payload) {
      control.sends.push({ ref, payload: structuredClone(payload), at: clock.value });
      const result = control.responses.length ? control.responses.shift() : { ok: true, messageId: String(100_000 + control.sends.length) };
      if (result instanceof Error) throw result;
      return result;
    },
    async check(ref) { control.checks.push(ref); return { ok: true, status: 200 }; },
    async exportFile(filename, mime, content) {
      control.exports.push({ filename, mime, content });
      return { ok: true };
    },
    async clipboard() { return SAFE_WEBHOOK; },
  };
  return { bridge, clock, backing, connection, control };
}

async function fixture(options = {}) {
  const f = fakeNative(options);
  f.app = createApp({ bridge: f.bridge, now: () => f.clock.value, autoSync: false, ticker: false });
  await f.app.init();
  f.advance = (duration) => { f.clock.value += duration; };
  f.restart = async () => {
    f.app.dispose();
    f.app = createApp({ bridge: f.bridge, now: () => f.clock.value, autoSync: false, ticker: false });
    await f.app.init();
    return f.app;
  };
  return f;
}

function assertEmbedLimits(payload) {
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  assert.ok(Array.isArray(payload.embeds));
  assert.ok(payload.embeds.length >= 1 && payload.embeds.length <= 10);
  let total = 0;
  for (const embed of payload.embeds) {
    for (const [value, max] of [[embed.title, 256], [embed.description, 4096], [embed.footer?.text, 2048], [embed.author?.name, 256]]) {
      if (value !== undefined) {
        assert.equal(typeof value, 'string');
        assert.ok(value.length <= max, `Embed text exceeded ${max} characters`);
        total += value.length;
      }
    }
    assert.ok((embed.fields || []).length <= 25);
    for (const field of embed.fields || []) {
      assert.equal(typeof field.name, 'string');
      assert.equal(typeof field.value, 'string');
      assert.ok(field.name.length <= 256);
      assert.ok(field.value.length <= 1024);
      total += field.name.length + field.value.length;
    }
  }
  assert.ok(total <= 6000, `Combined embed length ${total} exceeded 6000`);
}

const snapshot = f => f.app.getSnapshot();
const chronologicalEvents = f => snapshot(f).events.toReversed();

async function namedFixture(name = 'Test Moderator') {
  const f = await fixture();
  assert.equal(snapshot(f).ready, true);
  await f.app.saveSettings({ name, team: 'Mod-Team', discordId: '1234567890123456789' });
  return f;
}

test('a one-hour service records 50 minutes of work, 10 minutes of pause and immutable event totals', async () => {
  const f = await namedFixture();
  await f.app.start('Beginn');
  f.advance(20 * MINUTE);
  await f.app.pause();
  f.advance(10 * MINUTE);
  await f.app.resume();
  f.advance(30 * MINUTE);
  await f.app.finish('Erledigt');

  const s = snapshot(f).sessions[0];
  assert.equal(s.status, 'finished');
  assert.equal(snapshot(f).activeSession, null);
  assert.deepEqual(sessionTotals(s, f.clock.value), {
    activeMs: 50 * MINUTE, pauseMs: 10 * MINUTE, totalMs: 60 * MINUTE,
  });
  const events = chronologicalEvents(f);
  assert.deepEqual(events.map(e => e.type), ['start', 'pause', 'resume', 'finish']);
  assert.deepEqual(events.map(e => e.metrics.activeMs), [0, 20, 20, 50].map(n => n * MINUTE));
  assert.deepEqual(events.map(e => e.metrics.pauseMs), [0, 0, 10, 10].map(n => n * MINUTE));
  assert.equal(formatDuration(50 * MINUTE), '00:50:00');
  assert.equal(formatDuration(25 * 60 * MINUTE + 1000), '25:00:01');
  assert.equal(formatDuration(-1000), '00:00:00');
  assert.equal(f.control.sends.length, 0);

  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 4);
  assert.equal(snapshot(f).delivery.sent, 4);
  assert.deepEqual(f.control.sends.map(x => x.payload.embeds[0].title), [
    'Dienst gestartet', 'Pause begonnen', 'Dienst fortgesetzt', 'Dienst beendet',
  ]);
  const endFields = f.control.sends[3].payload.embeds[0].fields;
  assert.equal(endFields.find(x => x.name === 'Netto-Dienstzeit').value, '00:50:00');
  assert.equal(endFields.find(x => x.name === 'Pausenzeit').value, '00:10:00');
});

test('finishing during a pause closes the pause and stops both clocks', async () => {
  const f = await namedFixture();
  await f.app.start();
  f.advance(20 * MINUTE);
  await f.app.pause();
  f.advance(10 * MINUTE);
  await f.app.finish();
  const s = snapshot(f).sessions[0];
  assert.equal(s.pauses[0].endedAt, f.clock.value);
  assert.equal(s.endedAt, f.clock.value);
  assert.equal(s.activeMs, 20 * MINUTE);
  assert.equal(s.pauseMs, 10 * MINUTE);
  f.advance(60 * MINUTE);
  assert.equal(snapshot(f).sessions[0].activeMs, 20 * MINUTE);
  assert.equal(snapshot(f).sessions[0].pauseMs, 10 * MINUTE);
  await assert.rejects(f.app.resume());
  await assert.rejects(f.app.finish());
  assert.equal(snapshot(f).events.length, 3);
});

test('concurrent duplicate taps create exactly one transition and unique session/event IDs', async () => {
  const f = await namedFixture();
  for (const method of ['start', 'pause', 'resume', 'finish']) {
    const outcomes = await Promise.allSettled([f.app[method](), f.app[method]()]);
    assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1, method);
    assert.equal(outcomes.filter(x => x.status === 'rejected').length, 1, method);
    f.advance(MINUTE);
  }
  const s = snapshot(f);
  assert.equal(s.sessions.length, 1);
  assert.equal(s.events.length, 4);
  assert.equal(s.sessions[0].pauses.length, 1);
  assert.equal(new Set(s.events.map(e => e.id)).size, 4);
  assert.ok(s.events.every(e => e.id && e.sessionId === s.sessions[0].id));
  const firstId = s.sessions[0].id;
  await f.app.start();
  assert.notEqual(snapshot(f).activeSession.id, firstId);
});

test('restart restores an open pause and its pending events, while corrupt storage stays untouched', async () => {
  const f = await namedFixture();
  await f.app.start();
  f.advance(15 * MINUTE);
  await f.app.pause();
  const before = snapshot(f);
  const saved = f.backing.value;
  f.advance(5 * MINUTE);
  await f.restart();
  assert.equal(snapshot(f).activeSession.id, before.activeSession.id);
  assert.equal(snapshot(f).activeSession.status, 'paused');
  assert.equal(snapshot(f).activeSession.activeMs, 15 * MINUTE);
  assert.equal(snapshot(f).activeSession.pauseMs, 5 * MINUTE);
  assert.deepEqual(snapshot(f).events.map(e => e.id), before.events.map(e => e.id));
  assert.equal(snapshot(f).delivery.pending, 2);
  assert.equal(f.control.sends.length, 0);
  assert.deepEqual(JSON.parse(f.backing.value).sessions, JSON.parse(saved).sessions);
  await f.app.resume();
  f.advance(5 * MINUTE);
  await f.app.finish();
  assert.equal(snapshot(f).sessions[0].activeMs, 20 * MINUTE);

  const broken = ' \r\n{"version":1,"name":"Müller 🕒","sessions":';
  const bad = await fixture({ backing: { value: broken } });
  assert.equal(snapshot(bad).ready, false);
  assert.equal(snapshot(bad).jsonExportAvailable, true);
  assert.ok(snapshot(bad).storageError);
  assert.equal(bad.backing.value, broken);
  assert.equal(bad.control.saves.length, 0);
  await assert.rejects(bad.app.start());
  await bad.app.exportData('json');
  assert.equal(bad.control.exports[0].content, broken);
  assert.deepEqual(Buffer.from(bad.control.exports[0].content, 'utf8'), Buffer.from(broken, 'utf8'));
});

test('a native storage read failure disables recovery export without exporting a placeholder or modifying storage', async () => {
  const marker = '{"nativeStorageError":true}';
  for (const options of [
    { backing: { value: marker } },
    { backing: { value: '{"preserved":"original file"}' }, loadError: new Error('Simulated native I/O failure') },
  ]) {
    const original = options.backing.value;
    const f = await fixture(options);
    assert.equal(snapshot(f).ready, false);
    assert.equal(snapshot(f).jsonExportAvailable, false);
    assert.match(snapshot(f).storageError, /Export ist gerade nicht möglich/);
    await assert.rejects(f.app.exportData('json'), /Export ist gerade nicht möglich/);
    await assert.rejects(f.app.exportData('csv'), /Export ist gerade nicht möglich/);
    await assert.rejects(f.app.start());
    await f.app.flushQueue();
    assert.equal(f.control.exports.length, 0);
    assert.equal(f.control.saves.length, 0);
    assert.equal(f.control.sends.length, 0);
    assert.equal(f.backing.value, original);
  }
});

test('storage failure rolls back a stamp and prevents any send before its sending state is durable', async () => {
  const f = await namedFixture();
  const saved = f.backing.value;
  f.control.failSave = true;
  await assert.rejects(f.app.start(), /Speichern/);
  assert.equal(f.backing.value, saved);
  assert.equal(snapshot(f).sessions.length, 0);
  assert.equal(snapshot(f).events.length, 0);
  assert.ok(snapshot(f).storageError);
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 0);

  const queued = await namedFixture();
  await queued.app.start();
  const queuedSaved = queued.backing.value;
  queued.control.failSave = true;
  await assert.rejects(queued.app.flushQueue(), /Speichern/);
  assert.equal(queued.control.sends.length, 0);
  assert.equal(queued.backing.value, queuedSaved);
  assert.equal(snapshot(queued).events[0].status, 'pending');
  assert.equal(snapshot(queued).events[0].attempts, 0);
});

test('429 honors the exact 1750 ms retry deadline across restart and preserves message ordering', async () => {
  const f = await namedFixture();
  await f.app.start();
  f.advance(MINUTE);
  await f.app.pause();
  const before = f.clock.value;
  f.control.responses.push({ ok: false, kind: 'rate_limited', retryAfterMs: 1750 });
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 1);
  assert.equal(snapshot(f).delivery.nextRetryAt, before + 1750);
  assert.equal(snapshot(f).delivery.pending, 2);
  f.advance(1749);
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 1);
  await f.restart();
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 1);
  f.advance(1);
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 3);
  assert.equal(f.control.sends[1].at, before + 1750);
  assert.deepEqual(f.control.sends[0].payload, f.control.sends[1].payload);
  assert.equal(f.control.sends[2].payload.embeds[0].title, 'Pause begonnen');
  assert.equal(snapshot(f).delivery.sent, 2);
});

test('a confirmed pre-send network failure waits for backoff and retries the same durable event', async () => {
  const f = await namedFixture();
  await f.app.start();
  await f.app.pause();
  f.control.responses.push({ ok: false, kind: 'network', message: 'No connection' });
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 1);
  assert.equal(snapshot(f).delivery.sent, 0);
  assert.equal(snapshot(f).delivery.uncertain, 0);
  assert.equal(snapshot(f).delivery.nextRetryAt, START + 2000);
  f.advance(1999);
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 1);
  f.advance(1);
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 3);
  assert.deepEqual(f.control.sends[0].payload, f.control.sends[1].payload);
  assert.equal(snapshot(f).delivery.sent, 2);
});

test('uncertain delivery blocks later events until explicit retry or manual resolution, also after a crash', async () => {
  const f = await namedFixture();
  await f.app.start();
  await f.app.pause();
  f.control.responses.push(new Error('Timeout after request transmission'));
  await f.app.flushQueue();
  let events = chronologicalEvents(f);
  assert.equal(events[0].status, 'uncertain');
  assert.equal(events[1].status, 'pending');
  assert.equal(f.control.sends.length, 1);
  f.advance(10 * MINUTE);
  await f.restart();
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 1);
  await f.app.retryEvent(events[0].id);
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 3);
  assert.deepEqual(f.control.sends[0].payload, f.control.sends[1].payload);
  assert.equal(snapshot(f).delivery.sent, 2);

  const interrupted = await namedFixture();
  await interrupted.app.start();
  await interrupted.app.pause();
  const persisted = JSON.parse(interrupted.backing.value);
  persisted.events[0].status = 'sending';
  persisted.events[0].attempts = 1;
  interrupted.backing.value = JSON.stringify(persisted);
  await interrupted.restart();
  events = chronologicalEvents(interrupted);
  assert.equal(events[0].status, 'uncertain');
  await interrupted.app.flushQueue();
  assert.equal(interrupted.control.sends.length, 0);
  await interrupted.app.markEventHandled(events[0].id);
  await interrupted.app.flushQueue();
  assert.equal(interrupted.control.sends.length, 1);
  assert.equal(interrupted.control.sends[0].payload.embeds[0].title, 'Pause begonnen');
  assert.equal(chronologicalEvents(interrupted)[0].status, 'skipped');

  const unconfirmed = await namedFixture();
  await unconfirmed.app.start();
  unconfirmed.control.responses.push({ ok: true, status: 204 });
  await unconfirmed.app.flushQueue();
  assert.equal(snapshot(unconfirmed).delivery.sent, 0);
  assert.equal(snapshot(unconfirmed).delivery.uncertain, 1);
});

test('a deleted webhook blocks its route durably while a separately configured route can send', async () => {
  const f = await namedFixture();
  await f.app.start();
  await f.app.pause();
  await f.app.finish();
  f.control.responses.push({ ok: false, kind: 'permanent', status: 404, blockRoute: true, message: 'Webhook gelöscht' });
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 1);
  assert.equal(snapshot(f).delivery.failed, 3);
  const oldEvent = chronologicalEvents(f)[0];
  await f.restart();
  await assert.rejects(f.app.start(), /gesperrt/);
  await assert.rejects(f.app.retryEvent(oldEvent.id), /abgelehnt/);
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 1);
  await f.app.saveSettings({ webhook: SAFE_WEBHOOK });
  await f.app.start();
  await f.app.flushQueue();
  assert.equal(f.control.sends.length, 2);
  assert.equal(f.control.sends[1].ref, 'route-b');
  assert.equal(snapshot(f).delivery.failed, 3);
  assert.equal(snapshot(f).delivery.sent, 1);
});

test('profile and webhook changes are blocked during service; past sessions keep their profile and destination', async () => {
  const f = await namedFixture('Alice');
  await f.app.start();
  const original = snapshot(f).activeSession;
  for (const update of [{ name: 'Bob' }, { team: 'Anderes Team' }, { discordId: '9876543210987654321' }, { webhook: SAFE_WEBHOOK }]) {
    await assert.rejects(f.app.saveSettings(update), /laufenden Dienst/);
  }
  assert.equal(snapshot(f).connection.ref, 'route-a');
  assert.equal(snapshot(f).profile.name, 'Alice');
  await f.app.saveSettings({ accent: '#123abc', theme: 'light' });
  assert.equal(snapshot(f).profile.theme, 'light');
  assert.deepEqual(snapshot(f).activeSession.profile, original.profile);
  await f.app.finish();
  await f.app.saveSettings({ name: 'Bob', team: 'Zweites Team', webhook: SAFE_WEBHOOK });
  await f.app.start();
  await f.app.finish();
  const sessions = snapshot(f).sessions;
  assert.equal(sessions[1].profile.name, 'Alice');
  assert.equal(sessions[1].routeId, 'route-a');
  assert.equal(sessions[0].profile.name, 'Bob');
  assert.equal(sessions[0].routeId, 'route-b');
  await f.app.flushQueue();
  assert.deepEqual(f.control.sends.map(x => x.ref), ['route-a', 'route-a', 'route-b', 'route-b']);
  assert.deepEqual(f.control.sends.map(x => x.payload.embeds[0].fields.find(y => y.name === 'Moderator').value), ['Alice', 'Alice', 'Bob', 'Bob']);
});

test('webhook validation canonicalizes Discord URLs and rejects unsafe hosts, credentials and malformed IDs', () => {
  const canonical = 'https://discord.com/api/v10/webhooks/123456789012345678/' + 'A'.repeat(48);
  assert.equal(validateWebhook(SAFE_WEBHOOK), canonical);
  assert.equal(validateWebhook(SAFE_WEBHOOK.replace('discord.com', 'discordapp.com') + '?wait=true'), canonical);
  const thread = '1234567890123456789';
  assert.equal(validateWebhook(SAFE_WEBHOOK + '?thread_id=' + thread), canonical + '?thread_id=' + thread);
  assert.equal(validateWebhook(SAFE_WEBHOOK.replace('discord.com', 'canary.discord.com')), canonical);
  for (const url of [
    SAFE_WEBHOOK.replace('https:', 'http:'),
    SAFE_WEBHOOK.replace('discord.com', 'discord.com.example.invalid'),
    SAFE_WEBHOOK.replace('discord.com', 'example.invalid'),
    SAFE_WEBHOOK.replace('discord.com', 'discord.com:8443'),
    SAFE_WEBHOOK.replace('https://', 'https://user:password@'),
    SAFE_WEBHOOK.replace('123456789012345678', '1234'),
    SAFE_WEBHOOK.replace('A'.repeat(48), 'short'),
    SAFE_WEBHOOK + '#fragment',
    SAFE_WEBHOOK + '?redirect=https://example.invalid',
    SAFE_WEBHOOK + '?thread_id=not-a-number',
    'not a URL',
  ]) assert.throws(() => validateWebhook(url), undefined, url);
});

test('input boundaries reject invalid names, IDs and notes, and maximum valid text fits Discord embed limits', async () => {
  const f = await fixture();
  await assert.rejects(f.app.start(), /Name/);
  for (const profile of [
    { name: 'x'.repeat(61) },
    { name: 'Test', team: 'x'.repeat(81) },
    { name: 'Test\nOther' },
    { name: 'Test\u0001' },
    { name: 'Test', discordId: '1234567890123456' },
    { name: 'Test', discordId: '123456789012345678901' },
    { name: 'Test', discordId: '12345678901234567a' },
  ]) await assert.rejects(f.app.saveSettings(profile));
  assert.equal(snapshot(f).profile.name, '');
  await f.app.saveSettings({
    name: '@everyone' + '*'.repeat(51),
    team: '@here' + '_'.repeat(75),
    discordId: '12345678901234567890',
  });
  await assert.rejects(f.app.start('x'.repeat(281)), /280/);
  assert.equal(snapshot(f).sessions.length, 0);
  await f.app.start('`'.repeat(280));
  await assert.rejects(f.app.finish('x'.repeat(281)), /280/);
  assert.ok(snapshot(f).activeSession);
  await f.app.finish('<'.repeat(280));
  const s = snapshot(f).sessions[0];
  for (const event of snapshot(f).events) {
    const payload = buildPayload(event, s);
    assertEmbedLimits(payload);
    assert.equal(payload.username, 'Modstempel');
    assert.ok(payload.embeds[0].footer.text.includes(event.id));
    assert.ok(payload.embeds[0].footer.text.includes(s.id));
    assert.ok(JSON.stringify(payload).includes('@everyone'));
  }
});

test('day-range totals split a service and a pause correctly across local midnight', () => {
  const at = value => Date.parse(value + '+02:00');
  const midnight = at('2026-10-09T00:00:00');
  const end = at('2026-10-09T01:00:00');
  const s = {
    startedAt: at('2026-10-08T23:30:00'),
    endedAt: end,
    pauses: [{ startedAt: at('2026-10-08T23:50:00'), endedAt: at('2026-10-09T00:20:00') }],
  };
  assert.deepEqual(rangeTotals([s], midnight - 60 * MINUTE, midnight, end), { activeMs: 20 * MINUTE, pauseMs: 10 * MINUTE });
  assert.deepEqual(rangeTotals([s], midnight, end, end), { activeMs: 40 * MINUTE, pauseMs: 20 * MINUTE });
  assert.deepEqual(sessionTotals(s, end), { activeMs: 60 * MINUTE, pauseMs: 30 * MINUTE, totalMs: 90 * MINUTE });
  assert.deepEqual(rangeTotals([s], end, end + MINUTE, end), { activeMs: 0, pauseMs: 0 });
  const open = { ...s, endedAt: null, pauses: [{ ...s.pauses[0], endedAt: null }] };
  assert.deepEqual(rangeTotals([open], midnight, end, midnight + 10 * MINUTE), { activeMs: 0, pauseMs: 10 * MINUTE });
});

test('CSV neutralizes formula prefixes and JSON export contains history but no webhook URL or token', async () => {
  const f = await namedFixture('=2+3');
  await f.app.saveSettings({ team: '+SUM(1,1)', webhook: SAFE_WEBHOOK });
  await f.app.start('@everyone');
  f.advance(MINUTE);
  await f.app.finish('-1+2');
  await f.app.exportData('csv');
  await f.app.exportData('json');
  assert.equal(f.control.exports.length, 2);
  const [csv, json] = f.control.exports;
  assert.equal(csv.mime, 'text/csv');
  assert.match(csv.filename, /^Modstempel-\d{4}-\d{2}-\d{2}\.csv$/);
  assert.ok(csv.content.startsWith('\uFEFF'));
  assert.ok(csv.content.includes('"\'=2+3"'));
  assert.ok(csv.content.includes('"\'+SUM(1,1)"'));
  assert.ok(csv.content.includes('"\'@everyone"'));
  assert.ok(csv.content.includes('"\'-1+2"'));
  assert.equal(json.mime, 'application/json');
  const exported = JSON.parse(json.content);
  assert.equal(exported.app, 'Modstempel');
  assert.equal(exported.sessions.length, 1);
  assert.equal(exported.events.length, 2);
  assert.equal(exported.sessions[0].profile.name, '=2+3');
  for (const content of [csv.content, json.content, f.backing.value]) {
    assert.equal(content.includes(SAFE_WEBHOOK), false);
    assert.equal(content.includes('A'.repeat(48)), false);
    assert.equal(content.includes('"webhook"'), false);
  }
  assert.equal(f.control.sends.length, 0);
});
