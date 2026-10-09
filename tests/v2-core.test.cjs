'use strict';

// V2 application contract checks. All native and Discord boundaries are fake;
// no socket, browser, real account, or real notification is used by this suite.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp, parseState } = require('../web/core-v2.js');

const AT = Date.parse('2026-10-09T12:00:00Z'), MINUTE = 60000, HOUR = 60 * MINUTE;
const USER = '123456789012345678', OTHER_USER = '123456789012345679';
const GUILD = '223456789012345678', OTHER_GUILD = '223456789012345679';
const CHANNEL = '323456789012345678', OTHER_CHANNEL = '323456789012345679';
const ROLE = '423456789012345678', MESSAGE = '523456789012345678';
const ORIGIN = 'https://modstempel.example', OTHER_ORIGIN = 'https://second.example';
const IMAGE = { ref: 'a'.repeat(64) + '.png', name: 'Modstempel-Bild.png', mime: 'image/png', size: 4096, width: 1254, height: 1254 };
const copy = value => JSON.parse(JSON.stringify(value));
const approvedAccess = () => ({ status: 'approved', isOwner: false, canUseApp: true, version: 2, requestedAt: AT, updatedAt: AT, reviewedAt: AT, reason: '' });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function setup(id = GUILD, extra = {}) {
  return { ok: true, guild: { id, name: id === GUILD ? 'Erster Server' : 'Zweiter Server' }, botReady: true, canConfigure: true, canCreateEvents: true, moderatorRoleId: ROLE,
    roles: [{ id: ROLE, name: 'Moderator', mentionable: true }],
    channels: [CHANNEL, OTHER_CHANNEL].map((channelId, i) => ({ id: channelId, name: i ? 'events' : 'moderation', type: 0, capabilities: { modstempel: true, stream: true, big_match: true, general: true, poll: true } })), ...extra };
}

async function fixture(t, options = {}) {
  const control = { now: AT, raw: options.raw || (options.state ? JSON.stringify(options.state) : ''), sends: [], reads: [], retries: [], exports: [], discards: [], calls: [], failSave: false,
    replies: { send: [], status: [], retry: [] }, auth: { ok: true, configured: true, origin: ORIGIN, serverReady: true, authenticated: true, access: approvedAccess(), accessCheckedAt: AT, user: { id: USER, username: 'mod', displayName: 'Moderator Test' }, ...(options.auth || {}) } };
  async function respond(kind, fallback, args) {
    const result = control.replies[kind].length ? control.replies[kind].shift() : fallback;
    if (result instanceof Error) throw result;
    return typeof result === 'function' ? result(...args) : copy(result);
  }
  const bridge = {
    native: options.native !== false,
    loadState: () => control.raw,
    saveState: raw => { if (control.failSave) throw new Error('Device full'); control.raw = raw; },
    backendStatus: async () => copy(control.auth),
    configureBackend: async origin => { control.auth = { ok: true, configured: true, origin, serverReady: true, authenticated: false }; return copy(control.auth); },
    authBegin: async () => { control.auth.pendingLogin = { expiresAt: Date.now() + 600000, intervalMs: 3000, displayCode: 'ABCD-EFGH' }; return { ok: true }; },
    authPoll: async () => { control.auth.authenticated = true; control.auth.user = { id: USER, username: 'mod', displayName: 'Moderator Test' }; control.auth.access = approvedAccess(); control.auth.accessCheckedAt = control.now; delete control.auth.pendingLogin; return { ok: true, status: 'authorized' }; },
    authCancel: async () => { delete control.auth.pendingLogin; return { ok: true }; },
    authLogout: async () => { control.auth.authenticated = false; delete control.auth.user; return { ok: true }; },
    guilds: async () => ({ ok: true, guilds: [setup().guild, setup(OTHER_GUILD).guild] }),
    guildSetup: async id => options.setup ? options.setup(id) : setup(id),
    moderatorRole: async (guildId, roleId) => { control.calls.push(['role', guildId, roleId]); return { ok: true }; },
    botInstall: async guildId => { control.calls.push(['install', guildId]); return { ok: true }; },
    operationSend: async (operation, imageRef) => {
      control.sends.push({ operation: copy(operation), imageRef, origin: control.auth.origin });
      return respond('send', { ok: true, operation: { id: operation.id, type: operation.type, status: 'sent', stage: 'message', messageId: MESSAGE, channelId: operation.channelId } }, [operation, imageRef]);
    },
    operationStatus: async id => { control.reads.push(id); return respond('status', { ok: true, operation: { id, type: 'post', status: 'sent', stage: 'message', messageId: MESSAGE, channelId: CHANNEL } }, [id]); },
    operationRetry: async (id, acknowledgeUncertain) => { control.retries.push({ id, acknowledgeUncertain }); return respond('retry', { ok: true, operation: { id, type: 'post', status: 'sent', stage: 'poll', messageId: MESSAGE, channelId: CHANNEL } }, [id]); },
    scheduledEvents: async guildId => ({ ok: true, events: [{ id: MESSAGE, guildId, name: 'Echtes Event', startsAt: AT + HOUR }] }),
    openDiscord: async target => { control.calls.push(['open', copy(target)]); return { ok: true }; },
    pollResults: async id => ({ ok: true, poll: { question: { text: 'Wer kommt?' }, answers: [{ answer_id: 1, poll_media: { text: 'Ja' } }], results: { is_finalized: false, answer_counts: [{ id: 1, count: 3 }] } } }),
    pickImage: async () => ({ ok: true, image: IMAGE }),
    discardImage: async ref => { control.discards.push(ref); return { ok: true, removed: true }; },
    exportFile: async (filename, mime, content) => { control.exports.push({ filename, mime, content }); return { ok: true }; },
    send: async () => { throw new Error('Legacy webhook must never be used'); },
  };
  let app;
  async function boot() {
    if (app) app.dispose();
    app = createApp({ bridge, now: () => control.now, ticker: false, autoAuth: false, autoSync: false });
    await app.init(); return app;
  }
  await boot();
  t.after(() => app.dispose());
  return { control, bridge, get app() { return app; }, snapshot: () => app.getSnapshot(), advance: ms => { control.now += ms; }, restart: boot,
    async select() { await app.selectGuild(GUILD); await app.selectChannel(CHANNEL); },
    async post(extra = {}) { const p = app.preparePost({ category: 'general', title: 'Test', text: 'Nachricht', ...extra }); await app.submit(p); return p.operation.id; }
  };
}

test('v1 migration archives old jobs, preserves time and keeps an active legacy duty local', async t => {
  const old = { version: 1, profile: { name: 'Alter Mod', team: 'Altes Team', accent: 'gold', theme: 'dark' }, activeId: 'old-session',
    sessions: [{ id: 'old-session', profile: { name: 'Alter Mod', team: 'Altes Team' }, status: 'active', startedAt: AT - HOUR, endedAt: null, pauses: [] }],
    events: [{ id: 'old-job', type: 'request', status: 'pending', request: { title: 'Archiv', image: IMAGE }, connectionRef: 'legacy-reference' }] };
  const f = await fixture(t, { state: old });
  assert.deepEqual(JSON.parse(f.control.raw).legacyArchive, old);
  assert.equal(f.snapshot().legacyEvents.length, 1);
  assert.equal(f.snapshot().events.length, 0);
  assert.equal(f.snapshot().activeSession.activeMs, HOUR);
  await f.app.pause(); f.advance(10 * MINUTE); await f.app.resume(); f.advance(20 * MINUTE); await f.app.finish('Lokal beendet');
  assert.equal(f.snapshot().sessions[0].activeMs, 80 * MINUTE);
  assert.equal(f.snapshot().sessions[0].pauseMs, 10 * MINUTE);
  assert.equal(f.snapshot().events.every(e => e.legacyLocal && e.status === 'skipped'), true);
  await f.app.sync(); assert.equal(f.control.sends.length, 0);
  await f.app.discardRequestImage(IMAGE.ref); assert.equal(f.control.discards.length, 0);
  await assert.rejects(f.app.retry('old-job'), /kein neuer Discord-Auftrag/);
});

test('damaged state is kept byte-for-byte for export and is never overwritten', async t => {
  const raw = '{invalid-but-preserved';
  const f = await fixture(t, { raw });
  assert.equal(f.snapshot().ready, false); assert.ok(f.snapshot().storageError);
  assert.equal(f.control.raw, raw);
  await f.app.exportData('json'); assert.equal(f.control.exports[0].content, raw);
  await assert.rejects(f.app.start(), /gespeicherte Verlauf/);
});

test('a real login is required; a configured server alone never makes the app authenticated', async t => {
  const f = await fixture(t, { auth: { authenticated: false, user: undefined } });
  assert.throws(() => f.app.preparePost({ category: 'general', title: 'Test' }), /mit Discord anmelden/);
  await f.app.login(); assert.equal(f.snapshot().auth.authenticated, false);
  assert.equal(f.snapshot().auth.pendingLogin.displayCode, 'ABCD-EFGH');
  const result = await f.app.pollLogin(); assert.equal(result.auth.authenticated, true);
  assert.equal(result.guilds.length, 2);
  assert.equal(/sessionToken|verifier|access_token/.test(JSON.stringify(result)), false);
  await f.app.logout(); assert.equal(f.snapshot().auth.authenticated, false);
  assert.equal(f.snapshot().guilds.length, 0);
});

test('missing bot, permissions or moderator role blocks creation with the actual setup reason', async t => {
  let extra = { botReady: false };
  const f = await fixture(t, { setup: id => setup(id, extra) });
  await f.select(); assert.throws(() => f.app.preparePost({ category: 'general', title: 'X' }), /Bot dort einrichten/);
  extra = { moderatorRoleId: '' }; await f.select();
  assert.throws(() => f.app.preparePost({ category: 'modstempel', title: 'X' }), /Moderatorrolle/);
  extra = { channels: [{ id: CHANNEL, name: 'gesperrt', type: 0, capabilities: { general: false }, reason: 'Kein @everyone-Recht' }] }; await f.select();
  assert.throws(() => f.app.preparePost({ category: 'general', title: 'X' }), /Kein @everyone-Recht/);
  await assert.rejects(f.app.selectChannel('999999999999999999'), /verfügbaren/);
});

test('a definitively cancelled device login clears its pending code instead of polling forever', async t => {
  const f = await fixture(t, { auth: { authenticated: false, user: undefined } }); await f.app.login();
  f.bridge.authPoll = async () => { delete f.control.auth.pendingLogin; return { ok: false, kind: 'auth', message: 'Geräteanmeldung abgebrochen' }; };
  await assert.rejects(f.app.pollLogin(), /abgebrochen/);
  assert.equal(f.snapshot().auth.pendingLogin, undefined); assert.equal(f.snapshot().auth.authenticated, false);
});

test('only a guild manager can configure a real non-everyone role', async t => {
  let canConfigure = false;
  const f = await fixture(t, { setup: id => setup(id, { canConfigure }) }); await f.select();
  await assert.rejects(f.app.setModeratorRole(ROLE), /Serververwaltung/);
  canConfigure = true; await f.select();
  await assert.rejects(f.app.setModeratorRole(GUILD), /Moderatorrolle/);
  await f.app.setModeratorRole(ROLE);
  assert.deepEqual(f.control.calls, [['role', GUILD, ROLE]]);
});

test('all five categories have a fixed audience and stream keeps its attendance poll', async t => {
  const f = await fixture(t); await f.select();
  for (const category of ['modstempel', 'stream', 'big_match', 'general', 'poll']) {
    const p = f.app.preparePost({ category, title: 'Stream am Abend', text: '@someone', ...(category === 'poll' ? { poll: { question: 'Wann?', answers: ['Heute', 'Morgen'], durationHours: 24 } } : {}) });
    assert.equal(p.mentionLabel, category === 'modstempel' ? '@Moderator' : '@everyone');
    assert.equal(p.operation.moderatorRoleId, category === 'modstempel' ? ROLE : undefined);
    assert.equal(p.operation.actorId, USER); assert.equal(p.operation.guildId, GUILD); assert.equal(p.operation.channelId, CHANNEL);
    if (category === 'stream') assert.deepEqual(p.operation.data.poll.answers, ['Bin dabei', 'Komme später', 'Kann heute nicht']);
  }
  assert.throws(() => f.app.preparePost({ category: 'poll', title: 'X', poll: { question: '?', answers: ['Ja', ' ja '] } }), /unterscheiden/);
  assert.throws(() => f.app.preparePost({ category: 'general', title: 'X', poll: {} }), /keine Umfrage/);
  assert.throws(() => f.app.preparePost({ category: 'general', title: 'X', startsAt: AT - 1 }), /zukünftigen/);
});

test('confirmation freezes the channel; a later selection never redirects its operation', async t => {
  const f = await fixture(t); await f.select();
  const p = f.app.preparePost({ category: 'general', title: 'Festes Ziel' });
  await f.app.selectChannel(OTHER_CHANNEL); await f.app.submit(p);
  p.operation.data.title = 'Mutated after save'; p.target.channelId = OTHER_CHANNEL;
  await f.app.sync();
  assert.equal(f.control.sends[0].operation.channelId, CHANNEL);
  assert.equal(f.control.sends[0].operation.data.title, 'Festes Ziel');
  assert.equal(f.snapshot().selection.channelId, OTHER_CHANNEL);
});

test('origin and account changes block old queued jobs and stale confirmations', async t => {
  const f = await fixture(t); await f.select();
  const p = f.app.preparePost({ category: 'general', title: 'Alter Server' }); await f.app.submit(p);
  const confirmation = f.app.preparePost({ category: 'general', title: 'Offener Dialog' });
  await f.app.configureBackend(OTHER_ORIGIN); await f.app.login(); await f.app.pollLogin();
  await assert.rejects(f.app.submit(confirmation), /Konto oder der Verbindungsserver/);
  await f.app.sync(); assert.equal(f.control.sends.length, 0); assert.ok(f.snapshot().events[0].waitingReason);
  f.control.auth.origin = ORIGIN; f.control.auth.user.id = OTHER_USER; await f.restart(); await f.app.sync();
  assert.equal(f.control.sends.length, 0);
  f.control.auth.user.id = USER; await f.restart(); await f.app.sync();
  assert.equal(f.control.sends.length, 1); assert.equal(f.control.sends[0].origin, ORIGIN);
});

test('an active duty remains bound to its original guild/channel/account and preserves pause totals', async t => {
  const f = await fixture(t); await f.select(); await f.app.start('Beginn');
  f.advance(20 * MINUTE); await f.app.pause(); f.advance(10 * MINUTE);
  await f.app.selectGuild(OTHER_GUILD); await f.app.selectChannel(OTHER_CHANNEL);
  await f.app.resume(); f.advance(30 * MINUTE); await f.app.finish('Fertig'); await f.app.sync();
  assert.equal(f.control.sends.length, 4);
  for (const { operation } of f.control.sends) { assert.equal(operation.guildId, GUILD); assert.equal(operation.channelId, CHANNEL); assert.equal(operation.actorId, USER); assert.equal(operation.moderatorRoleId, ROLE); }
  const last = f.control.sends[3].operation.data;
  assert.equal(last.activeMs, 50 * MINUTE); assert.equal(last.pauseMs, 10 * MINUTE); assert.equal(last.totalMs, HOUR);
  assert.equal(f.snapshot().activeSession, null);
});

test('image plus poll is one durable operation with two planned messages; retry never uploads it twice', async t => {
  const f = await fixture(t); await f.select();
  const p = f.app.preparePost({ category: 'stream', title: 'Bildstream', image: IMAGE });
  assert.equal(p.messageCount, 2); assert.equal(p.operation.image.ref, IMAGE.ref);
  await f.app.submit(p);
  f.control.replies.send.push({ ok: true, operation: { id: p.operation.id, type: 'post', status: 'pending', stage: 'poll', imageMessageId: MESSAGE, imageChannelId: CHANNEL, retryAfterMs: 1500 } });
  await f.app.sync(); assert.equal(f.snapshot().events[0].status, 'pending'); assert.equal(f.snapshot().events[0].stage, 'poll');
  f.advance(1500); await f.app.sync();
  assert.equal(f.control.sends.length, 1); assert.equal(f.control.sends[0].imageRef, IMAGE.ref);
  assert.deepEqual(f.control.retries, [{ id: p.operation.id, acknowledgeUncertain: false }]);
  assert.equal(f.snapshot().events[0].status, 'sent'); assert.equal(f.snapshot().events[0].imageMessageId, MESSAGE);
  await f.app.discardRequestImage(IMAGE.ref); assert.equal(f.control.discards.length, 0);
});

test('a lost send response is reconciled by GET and does not cause a duplicate POST', async t => {
  const f = await fixture(t); await f.select(); const id = await f.post();
  f.control.replies.send.push(new Error('Response lost'));
  await f.app.sync(); assert.equal(f.control.sends.length, 1); assert.deepEqual(f.control.reads, [id]);
  assert.equal(f.control.retries.length, 0); assert.equal(f.snapshot().events[0].status, 'sent');
});

test('unknown remote delivery needs explicit acknowledgement and never retries in a loop', async t => {
  const f = await fixture(t); await f.select(); const id = await f.post();
  f.control.replies.send.push(new Error('Response lost'));
  f.control.replies.status.push({ ok: true, operation: { id, type: 'post', status: 'uncertain', stage: 'message', error: 'Discord-Antwort fehlt' } });
  await f.app.sync(); await f.app.sync();
  assert.equal(f.control.sends.length, 1); assert.equal(f.control.reads.length, 1); assert.equal(f.control.retries.length, 0);
  await assert.rejects(f.app.retry(id), /ausdrücklich bestätigen/);
  await f.app.retry(id, true); assert.deepEqual(f.control.retries, [{ id, acknowledgeUncertain: true }]);
});

test('remote sending is polled after its delay and never resubmitted', async t => {
  const f = await fixture(t); await f.select(); const id = await f.post();
  f.control.replies.send.push({ ok: true, operation: { id, type: 'post', status: 'sending', stage: 'message', retryAfterMs: 2000 } });
  await f.app.sync(); assert.equal(f.control.reads.length, 0);
  f.advance(2000); await f.app.sync();
  assert.deepEqual(f.control.reads, [id]); assert.equal(f.control.sends.length, 1); assert.equal(f.control.retries.length, 0); assert.equal(f.snapshot().events[0].status, 'sent');
});

test('a crash during delivery recovers using the same operation id and a read-only status check', async t => {
  const f = await fixture(t); await f.select(); const id = await f.post();
  const state = JSON.parse(f.control.raw); Object.assign(state.events[0], { status: 'sending', submitted: true, statusChecked: true }); f.control.raw = JSON.stringify(state);
  await f.restart(); assert.equal(f.snapshot().events[0].status, 'uncertain'); await f.app.sync();
  assert.deepEqual(f.control.reads, [id]); assert.equal(f.control.sends.length, 0); assert.equal(f.control.retries.length, 0);
});

test('server not-found after a transport failure reuses the same id only after a read', async t => {
  const f = await fixture(t); await f.select(); const id = await f.post();
  f.control.replies.send.push({ ok: false, kind: 'network', message: 'Offline' });
  f.control.replies.status.push({ ok: false, kind: 'not_found', message: 'Kein Auftrag' });
  await f.app.sync(); f.advance(15000); await f.app.sync();
  assert.deepEqual(f.control.reads, [id]); assert.equal(f.control.sends.length, 1);
  f.advance(1000); await f.app.sync(); assert.deepEqual(f.control.sends.map(s => s.operation.id), [id, id]);
});

test('a definitive rejection does not block later jobs, and an expired unsent job is skipped', async t => {
  const f = await fixture(t); await f.select(); await f.post({ title: 'Abgelehnt' }); await f.post({ title: 'Später' });
  f.control.replies.send.push({ ok: false, kind: 'validation', message: 'Feld abgelehnt' });
  await f.app.sync(); assert.equal(f.control.sends.length, 2); assert.deepEqual(f.snapshot().events.map(e => e.status), ['sent', 'failed']);
  await f.post({ title: 'Abgelaufen', startsAt: f.control.now + MINUTE }); f.advance(MINUTE);
  await f.app.sync(); assert.equal(f.control.sends.length, 2); assert.equal(f.snapshot().events[0].status, 'skipped');
});

test('a resource 404 on initial POST is a failure and never becomes an automatic resubmission loop', async t => {
  const f = await fixture(t); await f.select(); await f.app.start();
  f.control.replies.send.push({ ok: false, kind: 'not_found', message: 'Servermitgliedschaft nicht mehr vorhanden' });
  await f.app.sync(); f.advance(60000); await f.app.sync();
  assert.equal(f.snapshot().events[0].status, 'failed'); assert.equal(f.control.sends.length, 1);
  assert.equal(f.control.reads.length, 0); assert.equal(f.control.retries.length, 0);
});

test('a missing previously acknowledged server operation preserves its image and never reuploads automatically', async t => {
  const f = await fixture(t); await f.select(); const id = await f.post({ category: 'stream', image: IMAGE });
  f.control.replies.send.push({ ok: true, operation: { id, type: 'post', status: 'pending', stage: 'poll', imageMessageId: MESSAGE, imageChannelId: CHANNEL, retryAfterMs: 3000 } });
  await f.app.sync();
  f.control.replies.status.push({ ok: false, kind: 'not_found', message: 'Auftrag nicht gefunden' });
  await f.app.checkOperation(id); f.advance(60000); await f.app.sync();
  assert.equal(f.snapshot().events[0].status, 'failed'); assert.equal(f.snapshot().events[0].imageMessageId, MESSAGE);
  assert.match(f.snapshot().events[0].error, /Serverbetreiber/); assert.equal(f.control.sends.length, 1); assert.equal(f.control.retries.length, 0);
});

test('401 stops the outbox and clears public login state while preserving the pending job', async t => {
  const f = await fixture(t); await f.select(); await f.post(); await f.post({ title: 'Zweiter' });
  f.control.replies.send.push({ ok: false, kind: 'auth', message: 'Anmeldung abgelaufen' });
  await f.app.sync(); assert.equal(f.snapshot().auth.authenticated, false); assert.equal(f.snapshot().auth.user, undefined);
  assert.equal(f.control.sends.length, 1); assert.equal(f.snapshot().events.every(e => e.status === 'pending'), true);
});

test('storage failure before submit produces no success and no network operation', async t => {
  const f = await fixture(t); await f.select(); const p = f.app.preparePost({ category: 'general', title: 'X' }); f.control.failSave = true;
  await assert.rejects(f.app.submit(p), /Speichern auf dem Gerät/); await f.app.sync();
  assert.equal(f.control.sends.length, 0); assert.equal(f.snapshot().events.length, 0);
});

test('a backend switch is blocked during an in-flight operation', async t => {
  const f = await fixture(t); await f.select(); const id = await f.post(); const d = deferred();
  f.control.replies.send.push(() => d.promise); const sending = f.app.sync();
  await assert.rejects(f.app.configureBackend(OTHER_ORIGIN), /laufende Verbindung/);
  d.resolve({ ok: true, operation: { id, type: 'post', status: 'sent', stage: 'message', messageId: MESSAGE, channelId: CHANNEL } }); await sending;
  assert.equal(f.control.sends[0].origin, ORIGIN);
});

test('external scheduled events have a real location/time contract and no implicit channel ping', async t => {
  const f = await fixture(t); await f.app.selectGuild(GUILD);
  const p = f.app.prepareEvent({ title: 'BIG Match', description: 'Finale', location: 'TikTok Live', startsAt: AT + HOUR, endsAt: AT + 2 * HOUR });
  assert.equal(p.messageCount, 0); assert.equal(p.operation.type, 'scheduled_event'); assert.equal(p.operation.channelId, undefined);
  assert.equal(p.operation.category, undefined); assert.equal(p.operation.data.location, 'TikTok Live');
  assert.throws(() => f.app.prepareEvent({ title: 'X', location: 'X', startsAt: AT + HOUR, endsAt: AT + HOUR }), /nach dem Beginn/);
  await f.app.submit(p); f.control.replies.send.push({ ok: true, operation: { id: p.operation.id, type: 'scheduled_event', status: 'sent', stage: 'event', eventId: MESSAGE } }); await f.app.sync();
  await f.app.openOperation(p.operation.id); assert.deepEqual(f.control.calls.pop(), ['open', { guildId: GUILD, eventId: MESSAGE }]);
  await f.app.loadScheduledEvents(); assert.equal(f.snapshot().scheduledEvents.length, 1);
  await f.app.openScheduledEvent(MESSAGE); assert.deepEqual(f.control.calls.pop(), ['open', { guildId: GUILD, eventId: MESSAGE }]);
});

test('poll results preserve real counts and are never invented by the core', async t => {
  const f = await fixture(t); await f.select(); const id = await f.post({ category: 'poll', poll: { question: 'Wer kommt?', answers: ['Ja', 'Nein'] } });
  assert.equal(f.snapshot().events[0].poll, undefined); await f.app.sync(); await f.app.refreshPoll(id);
  assert.deepEqual(f.snapshot().events[0].poll.results.answer_counts, [{ id: 1, count: 3 }]);
});

test('local cancellation and export neither publish nor expose credentials', async t => {
  const f = await fixture(t); await f.select(); const id = await f.post(); await f.app.markHandled(id); await f.app.sync();
  assert.equal(f.control.sends.length, 0); assert.equal(f.snapshot().events[0].status, 'skipped');
  await f.app.exportData('json'); const exported = JSON.parse(f.control.exports[0].content);
  assert.equal(exported.version, 2); assert.equal(/sessionToken|verifier|access_token|botToken/.test(f.control.exports[0].content), false);
  assert.equal(parseState(f.control.exports[0].content).events[0].id, id);
});
