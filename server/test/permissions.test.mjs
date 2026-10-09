import test from 'node:test';
import assert from 'node:assert/strict';
import { P, has, basePermissions, channelPermissions, channelCapabilities, INSTALL_PERMISSIONS } from '../src/permissions.mjs';
import { makeFixture, IDS, NOW } from './fixtures.mjs';

test('permissions combine role overrides before member overrides and ignore role positions', t => {
  const f = makeFixture(t), { guild, member, channels } = f.state;
  const channel = channels[0];
  guild.roles[1].position = 100; guild.roles[2].position = 1;
  channel.permission_overwrites = [
    { id: IDS.guild, type: 0, deny: String(P.SEND_MESSAGES), allow: '0' },
    { id: IDS.moderator, type: 0, deny: String(P.SEND_MESSAGES), allow: '0' },
    { id: IDS.manager, type: 0, deny: '0', allow: String(P.SEND_MESSAGES) }
  ];
  assert.equal(has(channelPermissions(guild, member, channel, NOW), P.SEND_MESSAGES), true);
  channel.permission_overwrites.push({ id: IDS.user, type: 1, deny: String(P.SEND_MESSAGES), allow: '0' });
  assert.equal(has(channelPermissions(guild, member, channel, NOW), P.SEND_MESSAGES), false);
});

test('timeouts and membership screening cannot regain send rights from overwrites', t => {
  const f = makeFixture(t), { guild, member, channels } = f.state;
  channels[0].permission_overwrites = [{ id: IDS.user, type: 1, allow: String(P.SEND_MESSAGES | P.MENTION_EVERYONE), deny: '0' }];
  member.communication_disabled_until = new Date(NOW + 10_000).toISOString();
  assert.equal(has(channelPermissions(guild, member, channels[0], NOW), P.SEND_MESSAGES), false);
  assert.equal(has(basePermissions(guild, member, NOW), P.CREATE_EVENTS), false);
  member.communication_disabled_until = null; member.pending = true;
  assert.equal(has(channelPermissions(guild, member, channels[0], NOW), P.SEND_MESSAGES), false);
});

test('owner and administrator bypass local overwrites, but never foreign guild channels', t => {
  const f = makeFixture(t), { guild, member, channels } = f.state;
  guild.owner_id = IDS.user;
  channels[0].permission_overwrites = [{ id: IDS.user, type: 1, deny: String(P.SEND_MESSAGES), allow: '0' }];
  assert.equal(has(channelPermissions(guild, member, channels[0], NOW), P.SEND_MESSAGES), true);
  assert.equal(channelPermissions(guild, member, { ...channels[0], guild_id: IDS.otherGuild }, NOW), 0n);
  guild.owner_id = IDS.outsider; guild.roles[1].permissions = String(P.ADMINISTRATOR);
  assert.equal(has(channelPermissions(guild, member, channels[0], NOW), P.CREATE_EVENTS), true);
});

test('capabilities require both actors and keep mentionable moderator role distinct from everyone', t => {
  const f = makeFixture(t), context = { ...f.state };
  context.member.roles = [IDS.moderator];
  context.guild.roles[1].permissions = '0';
  context.guild.roles[1].mentionable = true;
  const first = channelCapabilities(context, context.channels[0], IDS.moderator, NOW);
  assert.equal(first.capabilities.modstempel, true);
  assert.equal(first.capabilities.general, false);
  context.member.roles = [];
  assert.equal(channelCapabilities(context, context.channels[0], IDS.moderator, NOW).capabilities.modstempel, false);
  context.member.roles = [IDS.moderator];
  context.guild.roles[1].mentionable = false;
  assert.equal(channelCapabilities(context, context.channels[0], IDS.moderator, NOW).capabilities.modstempel, false);
  context.member.roles = [IDS.manager]; context.botMember.roles = [IDS.manager];
  context.channels[0].permission_overwrites = [{ id: IDS.bot, type: 1, deny: String(P.SEND_POLLS), allow: '0' }];
  const last = channelCapabilities(context, context.channels[0], IDS.moderator, NOW);
  assert.equal(last.capabilities.general, true);
  assert.equal(last.capabilities.poll, false);
  assert.equal(INSTALL_PERMISSIONS, '580542139714560');
});

test('setup hides channels the user cannot view and rejects unrelated role configuration', async t => {
  const f = makeFixture(t), { session } = await f.login();
  f.state.channels.push({ id: IDS.otherChannel, guild_id: IDS.guild, type: 0, name: 'geheim', permission_overwrites: [{ id: IDS.user, type: 1, deny: String(P.VIEW_CHANNEL), allow: '0' }] });
  const setup = await f.service.setup(session, IDS.guild);
  assert.deepEqual(setup.channels.map(row => row.id), [IDS.channel]);
  await assert.rejects(f.service.setModeratorRole(session, IDS.guild, IDS.guild), { kind: 'validation' });
  await assert.rejects(f.service.setModeratorRole(session, IDS.guild, IDS.otherGuild), { kind: 'validation' });
  f.state.member.roles = [IDS.moderator];
  await assert.rejects(f.service.setModeratorRole(session, IDS.guild, IDS.moderator), { kind: 'forbidden' });
  assert.equal(f.state.posts.length, 0);
});
