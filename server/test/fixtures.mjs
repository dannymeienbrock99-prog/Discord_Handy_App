import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readConfig } from '../src/config.mjs';
import { Store, sha256 } from '../src/store.mjs';
import { DiscordClient } from '../src/discord.mjs';
import { Service } from '../src/service.mjs';
import { Site } from '../src/site.mjs';
import { P } from '../src/permissions.mjs';

export const IDS = Object.freeze({ user: '111111111111111111', bot: '222222222222222222', guild: '333333333333333333', channel: '444444444444444444', moderator: '555555555555555555', manager: '666666666666666666', outsider: '777777777777777777', otherGuild: '888888888888888888', otherChannel: '999999999999999999' });
export const NOW = Date.UTC(2026, 9, 9, 14, 30);
export const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jFh8AAAAASUVORK5CYII=', 'base64');
export const imageMeta = bytes => ({ ref: sha256(bytes) + '.png', name: 'Modstempel-Bild.png', mime: 'image/png', size: bytes.length, width: 1, height: 1 });

export function makeFixture(t, options = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modstempel-server-test-'));
  const config = readConfig({ PUBLIC_ORIGIN: 'https://modstempel.example.test', DISCORD_CLIENT_ID: IDS.bot, DISCORD_CLIENT_SECRET: 'test-client-secret-not-valid-in-discord', DISCORD_BOT_TOKEN: 'test-bot-token-not-valid-in-discord', TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32), DATA_DIR: dataDir, OWNER_DISCORD_ID: options.ownerId || IDS.user, ...(options.env || {}) });
  let time = NOW;
  const all = P.VIEW_CHANNEL | P.SEND_MESSAGES | P.EMBED_LINKS | P.ATTACH_FILES | P.READ_MESSAGE_HISTORY | P.MENTION_EVERYONE | P.CREATE_EVENTS | P.SEND_POLLS;
  const state = {
    guild: { id: IDS.guild, name: 'Testserver', owner_id: IDS.outsider, roles: [
      { id: IDS.guild, name: '@everyone', permissions: String(P.VIEW_CHANNEL | P.SEND_MESSAGES | P.EMBED_LINKS | P.ATTACH_FILES | P.READ_MESSAGE_HISTORY), mentionable: false, color: 0 },
      { id: IDS.moderator, name: 'Moderatoren', permissions: String(all), mentionable: false, color: 0x66ccaa },
      { id: IDS.manager, name: 'Serververwaltung', permissions: String(all | P.MANAGE_GUILD), mentionable: false, color: 0x7788ff }
    ] },
    member: { user: { id: IDS.user }, roles: [IDS.moderator, IDS.manager], communication_disabled_until: null },
    botMember: { user: { id: IDS.bot }, roles: [IDS.moderator], communication_disabled_until: null },
    channels: [{ id: IDS.channel, guild_id: IDS.guild, name: 'stream-planung', type: 0, position: 0, permission_overwrites: [] }],
    messages: new Map(), events: [], posts: [], calls: [], postResponses: [], missingBot: false, missingMember: false, oauthResponses: [], messageSerial: 810000000000000000n
  };
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input), method = init.method || 'GET';
    const route = url.pathname.replace('/api/v10', '');
    const auth = init.headers?.Authorization || '';
    state.calls.push({ method, route });
    if (route === '/oauth2/token') {
      const fields = Object.fromEntries(new URLSearchParams(init.body));
      state.lastTokenFields = fields;
      if (state.oauthResponses.length) return state.oauthResponses.shift()(fields, init);
      return json({ access_token: 'test-access-token-not-a-real-credential', refresh_token: 'test-refresh-token-not-a-real-credential', expires_in: 3600, token_type: 'Bearer', scope: 'identify guilds guilds.members.read' });
    }
    if (method === 'GET' && route === '/users/@me') return json(auth.startsWith('Bearer ')
      ? { id: IDS.user, username: 'Testkonto', global_name: 'Bestätigtes Konto', avatar: null, ...(state.oauthUser || {}) }
      : { id: IDS.bot, username: 'Modstempel', bot: true });
    if (method === 'GET' && route === '/users/@me/guilds') return json(auth.startsWith('Bot ') && state.missingBot ? [] : [{ id: IDS.guild, name: state.guild.name, owner: false, permissions: String(all | P.MANAGE_GUILD) }]);
    if (method === 'GET' && route === '/users/@me/guilds/' + IDS.guild + '/member') return state.missingMember ? json({ code: 10004 }, 404) : json(state.member);
    if (method === 'GET' && route === '/guilds/' + IDS.guild) return state.missingBot ? json({ code: 10004 }, 404) : json(state.guild);
    if (method === 'GET' && route === '/guilds/' + IDS.guild + '/members/' + IDS.bot) return json(state.botMember);
    if (method === 'GET' && route === '/guilds/' + IDS.guild + '/channels') return json(state.channels);
    if (method === 'GET' && route === '/guilds/' + IDS.guild + '/scheduled-events') return json(state.events);
    if (method === 'POST' && (route.endsWith('/messages') || route.endsWith('/scheduled-events'))) {
      let payload, bytes = null;
      if (init.body instanceof FormData) {
        payload = JSON.parse(init.body.get('payload_json'));
        bytes = Buffer.from(await init.body.get('files[0]').arrayBuffer());
      } else payload = JSON.parse(init.body);
      const post = { route, payload, bytes }; state.posts.push(post);
      if (state.postResponses.length) {
        const selected = state.postResponses.shift();
        if (selected) return selected(post, init);
      }
      const id = String(++state.messageSerial);
      if (route.endsWith('/scheduled-events')) { const event = { id, guild_id: IDS.guild, status: 1, ...payload }; state.events.push(event); return json(event); }
      const message = { id, channel_id: IDS.channel, author: { id: IDS.bot }, ...payload, ...(bytes ? { attachments: [{ id, filename: imageMeta(PNG).name, url: 'https://cdn.discordapp.com/attachments/' + IDS.channel + '/' + id + '/bild.png' }] } : {}) };
      if (payload.poll) message.poll = { question: payload.poll.question, answers: payload.poll.answers.map((answer, index) => ({ answer_id: index + 1, ...answer })), expiry: new Date(time + payload.poll.duration * 3600_000).toISOString(), allow_multiselect: false };
      state.messages.set(id, message); return json(message);
    }
    const messageId = /\/messages\/(\d+)$/.exec(route)?.[1];
    if (method === 'GET' && messageId && state.messages.has(messageId)) return json(state.messages.get(messageId));
    return json({ code: 10004 }, 404);
  };
  function createService(store) {
    // Generic CMS tests intentionally start with an empty template; dedicated
    // initial-content tests use the actual packaged portrait and biography.
    if (options.emptySite) new Site(config, store, null, { now: () => time, defaultFile: path.join(dataDir, 'absent-initial-template.json') });
    return new Service(config, store, new DiscordClient(config, { fetchImpl, now: () => time }), { now: () => time });
  }
  let store = new Store(dataDir), service = createService(store);
  const fixture = { config, dataDir, state, get service() { return service; }, get store() { return store; }, advance(ms) { time += ms; }, now: () => time,
    async login() {
      const verifier = 'device-verifier-with-32-random-bytes-faked-for-test';
      const start = service.auth.start(sha256(verifier));
      const browser = service.auth.browserStart(start.loginId);
      const oauth = new URL(browser.url);
      const browserSecret = /^ms_oauth=([^;]+)/.exec(browser.cookie)[1];
      await service.auth.callback({ state: oauth.searchParams.get('state'), code: 'fake-code', browserSecret });
      const claim = service.auth.poll(start.loginId, verifier);
      return { session: service.auth.session(claim.sessionToken), claim, start, verifier, browserSecret, oauth };
    },
    restart() { store.close(); store = new Store(dataDir); service = createService(store); },
    close() { store.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
  };
  t.after(() => fixture.close());
  return fixture;
}

export function postOperation(overrides = {}) {
  return { id: 'operation-test-00000001', type: 'post', actorId: IDS.user, guildId: IDS.guild, channelId: IDS.channel, category: 'general', createdAt: NOW, data: { title: 'Ein Beitrag', text: 'Beschreibung' }, ...overrides };
}
export function eventOperation(overrides = {}) {
  return { id: 'event-test-0000000001', type: 'scheduled_event', actorId: IDS.user, guildId: IDS.guild, createdAt: NOW, data: { title: 'BIG Match', description: 'Beschreibung', startsAt: NOW + 3600_000, endsAt: NOW + 7200_000, location: 'TikTok' }, ...overrides };
}
