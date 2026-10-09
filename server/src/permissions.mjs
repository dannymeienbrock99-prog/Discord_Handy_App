export const P = Object.freeze({
  ADMINISTRATOR: 1n << 3n, MANAGE_GUILD: 1n << 5n,
  VIEW_CHANNEL: 1n << 10n, SEND_MESSAGES: 1n << 11n,
  EMBED_LINKS: 1n << 14n, ATTACH_FILES: 1n << 15n,
  READ_MESSAGE_HISTORY: 1n << 16n, MENTION_EVERYONE: 1n << 17n,
  CREATE_EVENTS: 1n << 44n, SEND_POLLS: 1n << 49n
});
const ALL = (1n << 64n) - 1n;
const value = input => /^\d+$/.test(String(input ?? '')) ? BigInt(input) : 0n;
export const has = (permissions, flag) => (permissions & flag) === flag;

export function basePermissions(guild, member, now = Date.now()) {
  if (!member?.user?.id || !Array.isArray(member.roles) || !Array.isArray(guild?.roles)) return 0n;
  if (guild.owner_id === member.user.id) return ALL;
  let permissions = value(guild.roles.find(role => role.id === guild.id)?.permissions);
  for (const role of guild.roles) if (member.roles.includes(role.id)) permissions |= value(role.permissions);
  if (has(permissions, P.ADMINISTRATOR)) return ALL;
  const timeout = Date.parse(member.communication_disabled_until || '');
  if (Number.isFinite(timeout) && timeout > now) return permissions & (P.VIEW_CHANNEL | P.READ_MESSAGE_HISTORY);
  if (member.pending === true) return permissions & (P.VIEW_CHANNEL | P.READ_MESSAGE_HISTORY);
  return permissions;
}

export function channelPermissions(guild, member, channel, now = Date.now()) {
  if (!channel || channel.guild_id !== guild.id || !Array.isArray(member?.roles)) return 0n;
  let permissions = basePermissions(guild, member, now);
  if (has(permissions, P.ADMINISTRATOR)) return ALL;
  const overwrites = channel.permission_overwrites || [];
  const everyone = overwrites.find(item => item.type === 0 && item.id === guild.id);
  if (everyone) permissions = (permissions & ~value(everyone.deny)) | value(everyone.allow);
  let allow = 0n, deny = 0n;
  for (const item of overwrites) {
    if (item.type === 0 && member.roles.includes(item.id)) { allow |= value(item.allow); deny |= value(item.deny); }
  }
  permissions = (permissions & ~deny) | allow;
  const personal = overwrites.find(item => item.type === 1 && item.id === member.user.id);
  if (personal) permissions = (permissions & ~value(personal.deny)) | value(personal.allow);
  const timeout = Date.parse(member.communication_disabled_until || '');
  if ((Number.isFinite(timeout) && timeout > now) || member.pending === true) permissions &= P.VIEW_CHANNEL | P.READ_MESSAGE_HISTORY;
  return permissions;
}

export function canConfigure(guild, member, now) { return has(basePermissions(guild, member, now), P.MANAGE_GUILD); }
export function canMentionRole(permissions, role) { return !!role && (role.mentionable === true || has(permissions, P.MENTION_EVERYONE)); }

export function channelCapabilities(context, channel, moderatorRoleId, now) {
  const user = channelPermissions(context.guild, context.member, channel, now);
  const bot = channelPermissions(context.guild, context.botMember, channel, now);
  const base = P.VIEW_CHANNEL | P.SEND_MESSAGES | P.EMBED_LINKS;
  const both = flag => has(user, flag) && has(bot, flag);
  const ready = [0, 5].includes(channel.type) && both(base);
  const role = context.guild.roles.find(item => item.id === moderatorRoleId && item.id !== context.guild.id);
  const memberMayStamp = !!role && (context.member.roles.includes(role.id) || canConfigure(context.guild, context.member, now));
  const mod = ready && memberMayStamp && canMentionRole(user, role) && canMentionRole(bot, role);
  const everyone = ready && both(P.MENTION_EVERYONE);
  return {
    capabilities: { modstempel: mod, stream: everyone && both(P.SEND_POLLS), big_match: everyone, general: everyone, poll: everyone && both(P.SEND_POLLS) },
    ...(!ready ? { reason: 'Dir oder dem Bot fehlen Kanalzugriff, Nachrichten- oder Einbettungsrechte.' }
      : !mod && !everyone ? { reason: 'Moderatorrolle oder Erwähnungsrechte fehlen für diesen Kanal.' }
        : {}),
    userPermissions: user, botPermissions: bot
  };
}

export const INSTALL_PERMISSIONS = Object.entries(P).filter(([key]) => !['ADMINISTRATOR', 'MANAGE_GUILD'].includes(key)).reduce((all, [, bit]) => all | bit, 0n).toString();
