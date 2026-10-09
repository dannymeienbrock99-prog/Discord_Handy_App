'use strict';

// Cross-layer contract: actual CoreV2 output must be accepted unchanged by the
// actual backend normalizer. This test uses no Discord request or browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createApp } = require('../web/core-v2.js');

const USER = '123456789012345678', GUILD = '223456789012345678', CHANNEL = '323456789012345678', ROLE = '423456789012345678';
const AT = Date.parse('2026-10-09T12:00:00Z');
async function preparedApp(t) {
  let stored = '', clock = AT;
  const app = createApp({ ticker: false, autoSync: false, autoAuth: false, now: () => clock, bridge: {
    native: true, loadState: () => stored, saveState: value => { stored = value; },
    backendStatus: async () => ({ ok: true, configured: true, origin: 'https://modstempel.example', serverReady: true, authenticated: true, access: { status: 'approved', canUseApp: true, isOwner: false, version: 2, requestedAt: AT, updatedAt: AT, reviewedAt: AT, reason: '' }, accessCheckedAt: clock, user: { id: USER, username: 'test', displayName: 'Test Moderator' } }),
    guilds: async () => ({ ok: true, guilds: [{ id: GUILD, name: 'Team' }] }),
    guildSetup: async () => ({ ok: true, guild: { id: GUILD, name: 'Ein langer gültiger Discord-Servername – '.repeat(2) + 'Community' }, botReady: true, canConfigure: true, canCreateEvents: true, moderatorRoleId: ROLE, roles: [{ id: ROLE, name: 'Moderator' }], channels: [{ id: CHANNEL, name: 'team', type: 0, capabilities: { modstempel: true, stream: true, big_match: true, general: true, poll: true } }] }),
  } });
  t.after(() => app.dispose()); await app.init(); await app.selectGuild(GUILD); await app.selectChannel(CHANNEL);
  return { app, advance: ms => { clock += ms; } };
}

test('real CoreV2 post, stamp and event operations satisfy the server contract without losing their confirmed fields', async t => {
  const { normalizeOperation } = await import('../server/src/payloads.mjs');
  const { app, advance } = await preparedApp(t);
  for (const category of ['modstempel', 'stream', 'big_match', 'general', 'poll']) {
    const input = { category, title: 'Gemeinsam am Abend', text: 'Freitags live', startsAt: AT + 3600000 };
    if (category === 'poll') input.poll = { question: 'Wer hat Zeit?', answers: ['Heute', 'Morgen'], durationHours: 24 };
    const op = app.preparePost(input).operation;
    assert.deepEqual(normalizeOperation(op), op);
  }
  const event = app.prepareEvent({ title: 'BIG Match', description: 'Finale', startsAt: AT + 3600000, endsAt: AT + 7200000, location: 'TikTok Live' }).operation;
  assert.deepEqual(normalizeOperation(event), event);
  await app.start('Start'); advance(60000); await app.pause(); advance(60000); await app.resume(); advance(60000); await app.finish('Fertig');
  assert.ok(app.getSnapshot().sessions[0].profile.team.length > 80);
  for (const job of app.getSnapshot().events) assert.deepEqual(normalizeOperation(job.operation), job.operation);
});

test('the original PNG travels through real core and server metadata validation; its poll phase has no attachment or second ping', async t => {
  const { normalizeOperation, validateImageBytes, operationPhases, buildPayload } = await import('../server/src/payloads.mjs');
  const { app } = await preparedApp(t);
  const bytes = fs.readFileSync(path.join(__dirname, '../android/app/src/main/res/drawable-nodpi/moderation_original.png'));
  const meta = { ref: crypto.createHash('sha256').update(bytes).digest('hex') + '.png', name: 'Modstempel-Bild.png', mime: 'image/png', size: bytes.length, width: 1254, height: 1254 };
  const prepared = app.preparePost({ category: 'stream', title: 'Bildstream', image: meta });
  const op = normalizeOperation(prepared.operation);
  assert.equal(validateImageBytes(op.image, bytes, 'image/png'), true); assert.equal(prepared.messageCount, 2);
  assert.deepEqual(operationPhases(op), ['image', 'poll']);
  const actor = { id: USER, displayName: 'Test Moderator' };
  const first = buildPayload(op, 'image', actor);
  const second = buildPayload(op, 'poll', actor, { imageMessageId: '523456789012345678' });
  assert.equal(first.content, '@everyone'); assert.equal(first.poll, undefined); assert.equal(first.attachments.length, 1);
  assert.equal(second.content, ''); assert.deepEqual(second.allowed_mentions.parse, []); assert.equal(second.attachments, undefined);
  assert.deepEqual(second.poll.answers.map(a => a.poll_media.text), ['Bin dabei', 'Komme später', 'Kann heute nicht']);
  assert.notEqual(first.nonce, second.nonce); assert.equal(first.enforce_nonce, true); assert.equal(second.enforce_nonce, true);
});
