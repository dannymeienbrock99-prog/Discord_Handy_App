'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../web/core-v2.js');
const copy = value => JSON.parse(JSON.stringify(value));
const AT = Date.parse('2026-10-09T17:00:00Z');
const USER = '123456789012345678', GUILD = '223456789012345678', CHANNEL = '323456789012345678', ROLE = '423456789012345678';
const access = status => ({ status, isOwner: false, canUseApp: status === 'approved', version: 1, requestedAt: AT, updatedAt: AT, reviewedAt: status === 'pending' ? null : AT, reason: '' });
async function fixture(t, state = 'pending', options = {}) {
  const data = { raw: '', now: AT, status: { ok: true, configured: true, origin: 'https://modstempel.example', serverReady: true, authenticated: true, user: { id: USER, username: 'test', displayName: 'Testkonto' }, access: access(state), accessCheckedAt: AT }, calls: [], exports: [], sendReply: null };
  const bridge = {
    native: true, loadState: () => data.raw, saveState: raw => { data.raw = raw; },
    backendStatus: async () => { data.calls.push('status'); if (data.status instanceof Error) throw data.status; return copy(data.status); },
    guilds: async () => { data.calls.push('guilds'); return { ok: true, guilds: [{ id: GUILD, name: 'Testserver' }] }; },
    guildSetup: async () => { data.calls.push('setup'); return { ok: true, guild: { id: GUILD, name: 'Testserver' }, canConfigure: true, canCreateEvents: true, botReady: true, moderatorRoleId: ROLE, roles: [{ id: ROLE, name: 'Moderation' }], channels: [{ id: CHANNEL, name: 'team', type: 0, capabilities: { modstempel: true, general: true } }] }; },
    openPortal: async () => { data.calls.push('portal'); return { ok: true }; },
    operationSend: async op => { data.calls.push('send'); return data.sendReply || { ok: true, operation: { id: op.id, status: 'sent', messageId: '523456789012345678', channelId: CHANNEL } }; },
    exportFile: async (filename, mime, content) => { data.exports.push({ filename, mime, content }); return { ok: true }; },
    authLogout: async () => { data.status.authenticated = false; delete data.status.user; return { ok: true }; }
  };
  const app = createApp({ bridge, now: () => data.now, ticker: false, autoAuth: false, autoSync: false, ...options });
  t.after(() => app.dispose());
  await app.init();
  return { app, data, bridge, async select() { await app.selectGuild(GUILD); await app.selectChannel(CHANNEL); } };
}

test('registration states never load guild data or allow new Discord operations', async t => {
  for (const state of ['unregistered', 'pending', 'rejected', 'revoked']) {
    const f = await fixture(t, state);
    assert.deepEqual(f.data.calls, ['status']);
    assert.equal(f.app.getSnapshot().auth.authenticated, true);
    assert.equal(f.app.getSnapshot().auth.access.status, state);
    await assert.rejects(f.app.loadGuilds());
    await assert.rejects(f.app.start());
    assert.throws(() => f.app.preparePost({ category: 'general', title: 'Unfreigegeben' }));
    await f.app.sync(); assert.equal(f.data.calls.includes('send'), false);
    await f.app.exportData('json'); assert.equal(f.data.exports.length, 1);
  }
});

test('approval must be explicit and freshly returned by the native connection', async t => {
  const f = await fixture(t, 'approved');
  f.data.status.accessCheckedAt = 0;
  await f.app.refreshAccess();
  assert.equal(f.app.getSnapshot().guilds.length, 0);
  await assert.rejects(f.app.loadGuilds(), /Freigabestatus/);
  f.data.status.accessCheckedAt = AT;
  f.data.status.access.canUseApp = false;
  await f.app.refreshAccess();
  await assert.rejects(f.app.start(), /Freigabestatus/);
  f.data.status.access = null;
  await f.app.refreshAccess();
  await assert.rejects(f.app.start(), /Freigabestatus/);
});

test('a pending account becomes usable only after a fresh approved status', async t => {
  const f = await fixture(t);
  await f.app.openPortal();
  assert.equal(f.data.calls.includes('portal'), true);
  f.data.status.access = access('approved');
  await f.app.refreshAccess();
  assert.equal(f.app.getSnapshot().guilds.length, 1);
  await f.select(); await f.app.start(); await f.app.sync();
  assert.ok(f.app.getSnapshot().activeSession);
  assert.equal(f.data.calls.filter(v => v === 'send').length, 1);
});

test('revocation preserves queued posts and local duty actions while stopping the queue', async t => {
  const f = await fixture(t, 'approved'); await f.select(); await f.app.start();
  const prepared = f.app.preparePost({ category: 'general', title: 'Wartender Beitrag' }); await f.app.submit(prepared);
  f.data.status.access = { ...access('revoked'), reason: 'Testhinweis' };
  await f.app.refreshAccess();
  assert.equal(f.app.getSnapshot().guildSetup, null);
  assert.equal(f.app.getSnapshot().guilds.length, 0);
  assert.equal(f.app.getSnapshot().selection.guildId, GUILD);
  f.data.now += 60000; await f.app.pause(); f.data.now += 60000; await f.app.resume(); f.data.now += 60000; await f.app.finish();
  await f.app.sync(); assert.equal(f.data.calls.includes('send'), false);
  const snapshot = f.app.getSnapshot();
  assert.equal(snapshot.sessions[0].activeMs, 120000);
  assert.equal(snapshot.sessions[0].pauseMs, 60000);
  assert.equal(snapshot.posts.length, 1); assert.match(snapshot.posts[0].waitingReason, /gesperrt/);
  await f.app.exportData('json'); await f.app.exportData('csv');
  assert.equal(f.data.exports.length, 2);
  assert.match(f.data.exports[1].content, /00:02:00/);
});

test('an offline status never retains cached approved privileges', async t => {
  const f = await fixture(t, 'approved'); await f.select(); await f.app.start();
  f.data.status = new Error('offline');
  await f.app.refreshAccess(); await f.app.sync();
  const state = f.app.getSnapshot();
  assert.equal(state.auth.access, null); assert.equal(state.auth.accessCheckedAt, 0); assert.equal(state.guilds.length, 0);
  assert.equal(f.data.calls.includes('send'), false);
  await f.app.finish('Lokal trotz Offline');
  assert.equal(f.app.getSnapshot().sessions[0].endNote, 'Lokal trotz Offline');
});

test('server access denial updates the account state without logging it out or discarding the job', async t => {
  const f = await fixture(t, 'approved'); await f.select(); await f.app.start();
  f.data.sendReply = { ok: false, kind: 'access', message: 'Der Zugang wurde gesperrt.', access: access('revoked') };
  await f.app.sync();
  assert.equal(f.data.calls.filter(v => v === 'send').length, 1);
  assert.equal(f.app.getSnapshot().auth.authenticated, true);
  assert.equal(f.app.getSnapshot().auth.access.status, 'revoked');
  assert.equal(f.app.getSnapshot().events[0].status, 'pending');
  f.data.status.access = access('revoked');
  await f.app.sync(); assert.equal(f.data.calls.filter(v => v === 'send').length, 1);
});

test('network rejection pauses queued sends until the live connection is rechecked', async t => {
  const f = await fixture(t, 'approved'); await f.select(); await f.app.start();
  f.data.sendReply = { ok: false, kind: 'network', message: 'Keine Verbindung.' };
  await f.app.sync(); f.data.status = new Error('Offline'); f.data.now += 60000; await f.app.sync();
  assert.equal(f.data.calls.filter(v => v === 'send').length, 1);
  assert.equal(f.app.getSnapshot().auth.accessCheckedAt, 0);
  assert.equal(f.app.getSnapshot().events[0].status, 'pending');
});

test('presentation settings and historical export stay available before approval', async t => {
  const f = await fixture(t);
  await f.app.saveSettings({ accent: '#3CA6EA', theme: 'light', team: 'Mein Team' });
  await f.app.exportData('json');
  const saved = JSON.parse(f.data.exports[0].content);
  assert.equal(saved.profile.team, 'Mein Team'); assert.equal(saved.profile.accent, '#3CA6EA');
  assert.equal('access' in saved, false); assert.equal('auth' in saved, false);
});

test('pending approval is rechecked automatically without exposing guild data', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = await fixture(t, 'pending', { autoAuth: true });
  t.mock.timers.tick(20000); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.data.calls.filter(value => value === 'status').length, 2);
  assert.equal(f.data.calls.includes('guilds'), false);
  f.data.status.access = access('approved');
  t.mock.timers.tick(20000); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.app.getSnapshot().auth.access.canUseApp, true);
  assert.equal(f.app.getSnapshot().guilds.length, 1);
});

test('temporary connection failures recover through a bounded status retry without an online event', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = await fixture(t, 'approved', { autoAuth: true }); await f.select(); await f.app.start();
  f.data.sendReply = { ok: false, kind: 'network', message: 'Vorübergehend nicht erreichbar.' };
  await f.app.sync();
  assert.equal(f.app.getSnapshot().auth.accessCheckedAt, 0);
  const calls = f.data.calls.filter(value => value === 'status').length;
  t.mock.timers.tick(15000); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.data.calls.filter(value => value === 'status').length, calls + 1);
  assert.equal(f.app.getSnapshot().auth.access.status, 'approved');
  assert.ok(f.app.getSnapshot().auth.accessCheckedAt > 0);
});
