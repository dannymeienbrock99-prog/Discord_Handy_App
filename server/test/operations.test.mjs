import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeFixture, IDS, PNG, imageMeta, postOperation, eventOperation, json, NOW } from './fixtures.mjs';
import { P } from '../src/permissions.mjs';
import { buildPayload, normalizeOperation, summarizePoll, validateImageBytes } from '../src/payloads.mjs';

test('category payloads have only the intended mentions and ignore untrusted raw payload fields', () => {
  for (const category of ['modstempel', 'stream', 'big_match', 'general', 'poll']) {
    const raw = postOperation({ category, ...(category === 'modstempel' ? { moderatorRoleId: IDS.moderator } : {}), allowed_mentions: { parse: ['users', 'roles', 'everyone'] }, data: { title: 'Titel @everyone', text: '<@' + IDS.outsider + '> @here', ...(category === 'poll' ? { poll: { question: 'Frage?', answers: ['Ja', 'Nein'], durationHours: 24 } } : {}) } });
    const op = normalizeOperation(raw), payload = buildPayload(op, op.data.poll ? 'poll' : 'message', { displayName: 'Konto', id: IDS.user });
    assert.equal(payload.content, category === 'modstempel' ? '<@&' + IDS.moderator + '>' : '@everyone');
    assert.deepEqual(payload.allowed_mentions.users, []);
    assert.deepEqual(payload.allowed_mentions.roles, category === 'modstempel' ? [IDS.moderator] : []);
    assert.deepEqual(payload.allowed_mentions.parse, category === 'modstempel' ? [] : ['everyone']);
    assert.equal(payload.enforce_nonce, true); assert.equal(payload.nonce.length, 25);
    assert.equal('allowed_mentions' in op, false);
    if (category === 'stream') assert.deepEqual(payload.poll.answers.map(row => row.poll_media.text), ['Bin dabei', 'Komme später', 'Kann heute nicht']);
  }
});

test('image plus poll uses two durable phases with byte-exact upload and one ping', async t => {
  const f = makeFixture(t), { session } = await f.login();
  const operation = postOperation({ category: 'stream', image: imageMeta(PNG) });
  f.state.postResponses.push(null, post => {
    const stored = f.store.data.operations[operation.id];
    assert.equal(stored.phases[0].status, 'sent');
    assert.equal(stored.phases[1].status, 'sending');
    assert.equal(stored.phases[0].messageId, '810000000000000001');
    return json({ id: '810000000000000002', channel_id: IDS.channel, poll: { question: post.payload.poll.question, answers: post.payload.poll.answers.map((answer, index) => ({ answer_id: index + 1, ...answer })) } });
  });
  const response = await f.service.accept(session, operation, { bytes: PNG, contentType: 'image/png' });
  assert.equal(response.operation.status, 'sent');
  assert.equal(f.state.posts.length, 2);
  assert.deepEqual(f.state.posts[0].bytes, PNG);
  assert.equal(f.state.posts[0].payload.poll, undefined);
  assert.equal(f.state.posts[1].bytes, null);
  assert.equal(f.state.posts[1].payload.attachments, undefined);
  assert.equal(f.state.posts[0].payload.content, '@everyone');
  assert.equal(f.state.posts[1].payload.content, '');
  assert.deepEqual(f.state.posts[1].payload.allowed_mentions.parse, []);
  assert.notEqual(f.state.posts[0].payload.nonce, f.state.posts[1].payload.nonce);
  assert.equal(response.operation.imageMessageId, '810000000000000001');
  assert.equal(response.operation.poll.question.text, 'Wer ist beim Stream dabei?');
  assert.equal(response.operation.poll.results, undefined);
});

test('failed poll retains image ACK across restart and explicit retry needs no image file or upload permission', async t => {
  const f = makeFixture(t), login = await f.login();
  const operation = postOperation({ category: 'stream', image: imageMeta(PNG) });
  f.state.postResponses.push(null, () => json({ code: 50035, errors: { poll: { _errors: [{ code: 'INVALID_POLL', message: 'hidden raw text' }] } } }, 400));
  const failed = await f.service.accept(login.session, operation, { bytes: PNG, contentType: 'image/png' });
  assert.equal(failed.operation.status, 'failed'); assert.equal(failed.operation.stage, 'poll');
  assert.equal(failed.operation.imageMessageId, '810000000000000001');
  assert.match(failed.operation.error, /50035/); assert.match(failed.operation.error, /poll \[INVALID_POLL\]/);
  assert.equal(failed.operation.error.includes('hidden raw text'), false);
  f.restart();
  const session = f.service.auth.session(login.claim.sessionToken);
  assert.equal((await f.service.accept(session, operation)).operation.status, 'failed');
  assert.equal(f.state.posts.length, 2);
  fs.unlinkSync(f.store.imagePath(operation.image.ref));
  f.state.channels[0].permission_overwrites.push({ id: IDS.bot, type: 1, deny: String(P.ATTACH_FILES), allow: '0' });
  const retried = await f.service.retry(session, operation.id, false);
  assert.equal(retried.operation.status, 'sent');
  assert.equal(retried.operation.imageMessageId, failed.operation.imageMessageId);
  assert.equal(f.state.posts.length, 3); assert.equal(f.state.posts[2].bytes, null);
  assert.equal(f.state.posts[2].payload.nonce, f.state.posts[1].payload.nonce);
});

test('unknown POST outcome survives restart and cannot be resent without explicit acknowledgement', async t => {
  const f = makeFixture(t), login = await f.login(), operation = postOperation();
  f.state.postResponses.push(() => { throw new TypeError('simulated transport interruption'); });
  const unknown = await f.service.accept(login.session, operation);
  assert.equal(unknown.operation.status, 'uncertain'); assert.equal(f.state.posts.length, 1);
  f.restart(); const session = f.service.auth.session(login.claim.sessionToken);
  assert.equal(f.service.operationStatus(session, operation.id).operation.status, 'uncertain');
  assert.equal((await f.service.accept(session, operation)).operation.status, 'uncertain');
  await assert.rejects(f.service.retry(session, operation.id, false), { kind: 'uncertain' });
  assert.equal(f.state.posts.length, 1);
  assert.equal((await f.service.retry(session, operation.id, true)).operation.status, 'sent');
  assert.equal(f.state.posts.length, 2);
});

test('known 429 stays pending, waits until its deadline and resumes without a repeated image upload', async t => {
  const f = makeFixture(t), { session } = await f.login(), operation = postOperation({ image: imageMeta(PNG) });
  f.state.postResponses.push(() => json({ retry_after: 2, global: false }, 429));
  const pending = await f.service.accept(session, operation, { bytes: PNG, contentType: 'image/png' });
  assert.equal(pending.operation.status, 'pending'); assert.equal(pending.operation.retryAfterMs, 2000);
  assert.equal((await f.service.accept(session, operation)).operation.status, 'pending');
  assert.equal((await f.service.retry(session, operation.id, false)).operation.status, 'pending');
  assert.equal(f.state.posts.length, 1);
  f.advance(1999); await f.service.retry(session, operation.id, false); assert.equal(f.state.posts.length, 1);
  f.advance(1);
  assert.equal((await f.service.retry(session, operation.id, false)).operation.status, 'sent');
  assert.equal(f.state.posts.length, 2); assert.deepEqual(f.state.posts[1].bytes, PNG);
});

test('duplicate ID is immutable and actor-bound; failed messages do not block unrelated operations', async t => {
  const f = makeFixture(t), { session } = await f.login(), first = postOperation();
  f.state.postResponses.push(() => json({ code: 50035 }, 400));
  assert.equal((await f.service.accept(session, first)).operation.status, 'failed');
  assert.equal((await f.service.accept(session, first)).operation.status, 'failed');
  await assert.rejects(f.service.accept(session, { ...first, data: { title: 'Geändert', text: '' } }), { kind: 'validation', status: 409 });
  await assert.rejects(f.service.accept(session, { ...first, id: 'different-actor-0000001', actorId: IDS.outsider }), { kind: 'forbidden' });
  assert.throws(() => f.service.operationStatus({ ...session, userId: IDS.outsider }, first.id), { kind: 'not_found', status: 404 });
  assert.equal((await f.service.accept(session, postOperation({ id: 'operation-test-00000002' }))).operation.status, 'sent');
  assert.equal(f.state.posts.length, 2);
});

test('concurrent submissions and GET status never create a second message', async t => {
  const f = makeFixture(t), { session } = await f.login(), operation = postOperation();
  let release, started;
  const arrived = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  f.state.postResponses.push(async () => { started(); await gate; return json({ id: '810000000000000001', channel_id: IDS.channel }); });
  const a = f.service.accept(session, operation), b = f.service.accept(session, operation);
  await arrived;
  assert.equal(f.service.operationStatus(session, operation.id).operation.status, 'sending');
  assert.equal(f.state.posts.length, 1);
  release();
  const responses = await Promise.all([a, b]);
  assert.deepEqual(responses[0], responses[1]);
  assert.equal(f.state.posts.length, 1);
});

test('process restart maps an unacknowledged sending phase to uncertain without external traffic', async t => {
  const f = makeFixture(t), login = await f.login(), operation = postOperation();
  f.state.postResponses.push(() => json({ retry_after: 1 }, 429));
  await f.service.accept(login.session, operation);
  f.store.transaction(draft => { draft.operations[operation.id].status = 'sending'; draft.operations[operation.id].phases[0].status = 'sending'; });
  const calls = f.state.calls.length;
  f.restart();
  assert.equal(f.service.operationStatus(f.service.auth.session(login.claim.sessionToken), operation.id).operation.status, 'uncertain');
  assert.equal(f.state.calls.length, calls);
});

test('failure to persist image ACK prevents the second phase and exposes uncertain delivery', async t => {
  const f = makeFixture(t), { session } = await f.login(), operation = postOperation({ category: 'stream', image: imageMeta(PNG) });
  const transaction = f.store.transaction.bind(f.store);
  f.store.transaction = change => transaction(draft => {
    const value = change(draft);
    if (draft.operations[operation.id]?.phases[0].status === 'sent') throw new Error('simulated fsync error');
    return value;
  });
  const result = await f.service.accept(session, operation, { bytes: PNG, contentType: 'image/png' });
  assert.equal(result.operation.status, 'uncertain'); assert.equal(f.state.posts.length, 1);
  assert.equal(f.store.data.operations[operation.id].phases[1].status, 'pending');
});

test('role configuration is checked at acceptance and a retry preserves the original target', async t => {
  const f = makeFixture(t), { session } = await f.login();
  const operation = postOperation({ category: 'modstempel', moderatorRoleId: IDS.moderator });
  await assert.rejects(f.service.accept(session, operation), { kind: 'validation' });
  await f.service.setModeratorRole(session, IDS.guild, IDS.moderator);
  f.state.postResponses.push(() => json({ code: 50035 }, 400));
  await f.service.accept(session, operation);
  await f.service.setModeratorRole(session, IDS.guild, IDS.manager);
  assert.equal((await f.service.retry(session, operation.id, false)).operation.status, 'sent');
  assert.equal(f.state.posts[1].payload.content, '<@&' + IDS.moderator + '>');
  assert.equal(f.state.posts[1].route, '/channels/' + IDS.channel + '/messages');
});

test('stamps use authenticated identity and require the configured moderator role or manager', async t => {
  const f = makeFixture(t), { session } = await f.login();
  await f.service.setModeratorRole(session, IDS.guild, IDS.moderator);
  const operation = postOperation({ type: 'stamp', category: 'modstempel', moderatorRoleId: IDS.moderator, data: { action: 'start', at: NOW, sessionId: 'local-session-0000001', name: 'Erfundener Absender', team: 'L'.repeat(100), note: '', activeMs: 0, pauseMs: 0, totalMs: 0, startedAt: NOW } });
  assert.equal((await f.service.accept(session, operation)).operation.status, 'sent');
  assert.match(f.state.posts[0].payload.embeds[0].fields[0].value, /Bestätigtes Konto/);
  assert.equal(JSON.stringify(f.state.posts[0].payload).includes('Erfundener Absender'), false);
  assert.equal(f.state.posts[0].payload.embeds[0].fields.find(field => field.name === 'Team').value, 'L'.repeat(100));
  f.state.member.roles = [];
  await assert.rejects(f.service.accept(session, { ...operation, id: 'stamp-second-00000001' }), { kind: 'forbidden' });
});

test('scheduled event needs CREATE_EVENTS and makes exactly one external event with ISO times', async t => {
  const f = makeFixture(t), { session } = await f.login(), operation = eventOperation();
  const result = await f.service.accept(session, operation);
  assert.equal(result.operation.status, 'sent'); assert.equal(result.operation.stage, 'event');
  assert.match(result.operation.url, /^https:\/\/discord.com\/events\//);
  assert.equal(f.state.posts.length, 1);
  assert.equal(f.state.posts[0].route, '/guilds/' + IDS.guild + '/scheduled-events');
  assert.equal(f.state.posts[0].payload.channel_id, null);
  assert.equal(f.state.posts[0].payload.entity_type, 3);
  assert.equal(f.state.posts[0].payload.scheduled_start_time, new Date(operation.data.startsAt).toISOString());
  assert.equal(f.state.posts[0].payload.allowed_mentions, undefined);
  await f.service.accept(session, operation); assert.equal(f.state.posts.length, 1);
  const listed = await f.service.scheduledEvents(session, IDS.guild);
  assert.equal(listed.events[0].startsAt, operation.data.startsAt);
  f.state.member.roles = [];
  await assert.rejects(f.service.accept(session, eventOperation({ id: 'event-without-rights-0001' })), { kind: 'forbidden' });
});

test('unknown event outcome cannot auto-create an additional event and past starts are rejected', async t => {
  const f = makeFixture(t), { session } = await f.login(), operation = eventOperation();
  f.state.postResponses.push(() => new Response('', { status: 502 }));
  assert.equal((await f.service.accept(session, operation)).operation.status, 'uncertain');
  await f.service.accept(session, operation);
  await assert.rejects(f.service.retry(session, operation.id, false), { kind: 'uncertain' });
  assert.equal(f.state.posts.length, 1);
  f.advance(3600_001);
  await assert.rejects(f.service.accept(session, eventOperation({ id: 'event-now-expired-00001' })), { kind: 'validation' });
});

test('image metadata mismatch is rejected before acceptance or Discord POST', async t => {
  const f = makeFixture(t), { session } = await f.login(), meta = imageMeta(PNG);
  assert.throws(() => validateImageBytes({ ...meta, width: 2 }, PNG, 'image/png'), { kind: 'validation' });
  await assert.rejects(f.service.accept(session, postOperation({ image: meta }), { bytes: Buffer.from('not the image'), contentType: 'image/png' }), { kind: 'validation' });
  assert.equal(f.state.posts.length, 0); assert.equal(Object.keys(f.store.data.operations).length, 0);
});

test('lost Discord membership is forbidden and cannot be confused with a missing local operation', async t => {
  const f = makeFixture(t), { session } = await f.login(), operation = postOperation();
  f.state.missingMember = true;
  await assert.rejects(f.service.accept(session, operation), { kind: 'forbidden', status: 404 });
  assert.equal(Object.keys(f.store.data.operations).length, 0);
  assert.throws(() => f.service.operationStatus(session, operation.id), { kind: 'not_found', status: 404 });
  assert.equal(f.state.posts.length, 0);
});

test('poll results keep Discord wire shape, missing counts stay unknown, prior results can become stale', async t => {
  const f = makeFixture(t), { session } = await f.login(), operation = postOperation({ category: 'poll', data: { title: 'Umfrage', text: '', poll: { question: 'Frage?', answers: ['Ja', 'Nein'], durationHours: 24 } } });
  const sent = await f.service.accept(session, operation), message = f.state.messages.get(sent.operation.messageId);
  assert.equal(sent.operation.poll.results, undefined);
  message.poll.results = { answer_counts: [{ id: 1, count: 3 }], is_finalized: false };
  const live = await f.service.pollResults(session, operation.id);
  assert.equal(live.poll.question.text, 'Frage?');
  assert.deepEqual(live.poll.answers.map(answer => answer.answer_id), [1, 2]);
  assert.deepEqual(live.poll.results.answer_counts, [{ id: 1, count: 3 }]);
  delete message.poll.results;
  const stale = await f.service.pollResults(session, operation.id);
  assert.equal(stale.poll.stale, true); assert.deepEqual(stale.poll.results.answer_counts, [{ id: 1, count: 3 }]);
  assert.equal(summarizePoll(null, NOW, stale.poll).stale, true);
});
