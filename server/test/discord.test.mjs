import test from 'node:test';
import assert from 'node:assert/strict';
import { DiscordClient } from '../src/discord.mjs';
import { json } from './fixtures.mjs';

test('global Discord backoff stops other bot routes until the exact deadline', async () => {
  let now = 10_000, calls = 0;
  const client = new DiscordClient({ botToken: 'test-bot' }, { now: () => now, fetchImpl: async () => ++calls === 1 ? json({ retry_after: 2, global: true }, 429) : json({ id: '111111111111111111' }) });
  await assert.rejects(client.request('POST', '/channels/111111111111111111/messages', { payload: { content: 'test' } }), { kind: 'rate_limited', retryAfterMs: 2000 });
  now += 1999;
  await assert.rejects(client.request('POST', '/guilds/222222222222222222/scheduled-events', { payload: {} }), { kind: 'rate_limited', retryAfterMs: 1 });
  assert.equal(calls, 1); now++;
  await client.request('GET', '/users/@me'); assert.equal(calls, 2);
});

test('ambiguous network failures are uncertain while proven connection failures are retryable', async () => {
  const unknown = new DiscordClient({ botToken: 'test-bot' }, { fetchImpl: async () => { throw new Error('socket reset'); } });
  await assert.rejects(unknown.request('POST', '/channels/111111111111111111/messages', { payload: {} }), { kind: 'uncertain' });
  const offline = new DiscordClient({ botToken: 'test-bot' }, { fetchImpl: async () => { const error = new Error('DNS failure'); error.cause = { code: 'ENOTFOUND' }; throw error; } });
  await assert.rejects(offline.request('POST', '/channels/111111111111111111/messages', { payload: {} }), { kind: 'network' });
  await assert.rejects(unknown.request('GET', '/users/@me'), { kind: 'network' });
});
