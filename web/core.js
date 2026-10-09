(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.ModstempelCore = api; root.Modstempel = api.createApp({ bridge: root.ModstempelBridge }); }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = 1;
  const EVENT_NAMES = { start: 'Dienst gestartet', pause: 'Pause begonnen', resume: 'Dienst fortgesetzt', finish: 'Dienst beendet', request: 'Team-Abfrage erstellt' };
  const COLORS = { start: 9545130, pause: 15189900, resume: 8221183, finish: 11241961 };
  const HOUR = 3600000;
  const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
  const IMAGE_MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  const IMAGE_REF = /^[a-f0-9]{64}\.(jpg|png|webp)$/;
  const REQUEST_ANSWERS = ['Bin dabei', 'Komme später', 'Kann heute nicht'];
  const safeDiscordId = value => typeof value === 'string' && /^\d{17,20}$/.test(value) ? value : '';
  const clone = value => JSON.parse(JSON.stringify(value));
  const defaultProfile = () => ({ name: '', discordId: '', team: 'Moderation', accent: 'gold', theme: 'dark' });
  const freshState = () => ({ version: VERSION, profile: defaultProfile(), sessions: [], events: [], activeId: null, blockedRoutes: {}, cooldownUntil: 0, clockAnchor: null, connectionMeta: {} });
  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
  function cleanText(value, label, limit, optional) {
    const text = String(value == null ? '' : value).trim().normalize('NFC');
    if (!optional && !text) throw new Error(label + ' fehlt.');
    if (text.length > limit) throw new Error(label + ' darf höchstens ' + limit + ' Zeichen haben.');
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) throw new Error(label + ' enthält ungültige Zeichen.');
    return text;
  }
  function validateWebhook(value) {
    let url;
    try { url = new URL(String(value).trim()); } catch (_) { throw new Error('Bitte eine gültige Discord-Webhook-URL einfügen.'); }
    const path = url.pathname.match(/^\/api\/(?:v\d+\/)?webhooks\/(\d{17,20})\/([A-Za-z0-9_-]{20,200})\/?$/);
    if (url.protocol !== 'https:' || !['discord.com', 'discordapp.com', 'canary.discord.com', 'ptb.discord.com'].includes(url.hostname) || url.port || url.username || url.password || url.hash || !path) throw new Error('Bitte eine gültige HTTPS-Webhook-URL von Discord einfügen.');
    for (const [key, val] of url.searchParams) {
      if (key !== 'wait' && key !== 'thread_id') throw new Error('Diese Webhook-URL enthält unbekannte Parameter.');
      if (key === 'thread_id' && !/^\d{17,20}$/.test(val)) throw new Error('Die Discord-Thread-ID ist ungültig.');
    }
    const thread = url.searchParams.get('thread_id');
    return 'https://discord.com/api/v10/webhooks/' + path[1] + '/' + path[2] + (thread ? '?thread_id=' + thread : '');
  }
  function formatDuration(ms) {
    const seconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
  }
  function sessionTotals(session, now) {
    const end = session.endedAt == null ? now : session.endedAt;
    const totalMs = Math.max(0, end - session.startedAt);
    const pauseMs = Math.min(totalMs, (session.pauses || []).reduce((sum, p) => sum + Math.max(0, Math.min(p.endedAt == null ? end : p.endedAt, end) - Math.max(p.startedAt, session.startedAt)), 0));
    return { activeMs: totalMs - pauseMs, pauseMs, totalMs };
  }
  function rangeTotals(sessions, from, to, now) {
    let activeMs = 0, pauseMs = 0;
    for (const s of sessions) {
      const end = s.endedAt == null ? now : s.endedAt;
      const overlap = Math.max(0, Math.min(end, to) - Math.max(s.startedAt, from));
      const pauses = (s.pauses || []).reduce((sum, p) => sum + Math.max(0, Math.min(p.endedAt == null ? end : p.endedAt, end, to) - Math.max(p.startedAt, from, s.startedAt)), 0);
      activeMs += Math.max(0, overlap - pauses); pauseMs += Math.min(overlap, pauses);
    }
    return { activeMs, pauseMs };
  }
  const discordText = text => String(text || '').replace(/([\\*_~`|<>])/g, '\\$1');
  function normalizeRequestImage(image) {
    if (image == null) return null;
    if (!image || typeof image !== 'object' || Array.isArray(image)) throw new Error('Das ausgewählte Bild ist ungültig. Bitte erneut auswählen.');
    const match = typeof image.ref === 'string' && image.ref.match(IMAGE_REF);
    if (!match || image.name !== 'Modstempel-Bild.' + match[1] || image.mime !== IMAGE_MIME[match[1]]) throw new Error('Das Bildformat ist ungültig. Bitte JPG, PNG oder WebP auswählen.');
    if (!Number.isSafeInteger(image.size) || image.size < 1 || image.size > MAX_IMAGE_BYTES) throw new Error('Das Bild darf höchstens 8 MB groß sein.');
    if (![image.width, image.height].every(n => Number.isSafeInteger(n) && n > 0 && n <= 8192) || image.width * image.height > 32000000) throw new Error('Das Bild ist zu groß. Maximal 8192 Pixel pro Seite und 32 Megapixel sind möglich.');
    return { ref: image.ref, name: image.name, mime: image.mime, size: image.size, width: image.width, height: image.height };
  }
  function requestImageUrl(image) {
    const value = normalizeRequestImage(image);
    return value ? 'https://appassets.androidplatform.net/images/' + value.ref : '';
  }
  function normalizeRequestInput(input, at) {
    input = input || {};
    const title = cleanText(input.title, 'Der Streamtitel', 120, false);
    if (/[\r\n]/.test(title)) throw new Error('Der Streamtitel darf keine Zeilenumbrüche enthalten.');
    const note = cleanText(input.note, 'Die Notiz', 280, true);
    const startsAt = input.startsAt == null || input.startsAt === '' ? null : input.startsAt;
    if (startsAt != null && (!Number.isSafeInteger(startsAt) || startsAt <= at || startsAt > at + 31 * 24 * HOUR)) throw new Error('Bitte einen zukünftigen Streambeginn innerhalb der nächsten 31 Tage wählen.');
    const durationHours = input.durationHours == null ? 24 : Number(input.durationHours);
    if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 168) throw new Error('Die Antwortzeit muss zwischen 1 und 168 ganzen Stunden liegen.');
    const request = { title, startsAt, note, durationHours };
    const image = normalizeRequestImage(input.image);
    if (image) request.image = image;
    return request;
  }
  function buildRequestPayload(event) {
    const request = event.request;
    const fields = [
      { name: '📅 Streambeginn', value: request.startsAt == null ? 'Noch offen' : '<t:' + Math.floor(request.startsAt / 1000) + ':f>', inline: false }
    ];
    if (request.note) fields.push({ name: '💬 Nachricht an das Team', value: discordText(request.note), inline: false });
    const payload = {
      username: 'Modstempel', allowed_mentions: { parse: [] },
      embeds: [{
        author: { name: 'Modstempel · Stream-Anfrage' },
        title: discordText(request.title),
        description: '**Streamer:** ' + discordText(request.streamer) + '\n**Team:** ' + discordText(request.team),
        color: 12100080,
        fields,
        footer: { text: 'Zusage startet noch keinen Dienst' },
        timestamp: new Date(event.at).toISOString()
      }],
      poll: {
        question: { text: 'Wer ist dabei? – ' + request.title },
        answers: REQUEST_ANSWERS.map((text, index) => ({ poll_media: { text, emoji: { name: ['✅', '🕒', '❌'][index] } } })),
        duration: request.durationHours, allow_multiselect: false, layout_type: 1
      }
    };
    const image = normalizeRequestImage(request.image);
    if (image) {
      // Discord rejects uploaded attachments on poll messages. Each image
      // request therefore has two separately confirmed, durable send stages.
      if (event.requestStage === 'poll') {
        const imageLink = safeDiscordId(event.imageGuildId) && safeDiscordId(event.imageChannelId) && safeDiscordId(event.imageMessageId)
          ? 'Bild und Details: <https://discord.com/channels/' + event.imageGuildId + '/' + event.imageChannelId + '/' + event.imageMessageId + '>'
          : 'Bild und Details findest du in der vorherigen Modstempel-Nachricht zu diesem Stream.';
        return {
          username: payload.username, allowed_mentions: payload.allowed_mentions,
          content: '**Abstimmung · ' + discordText(request.title) + '**\n**Streamer:** ' + discordText(request.streamer) + ' · **Team:** ' + discordText(request.team) + '\n' + imageLink,
          poll: payload.poll
        };
      }
      delete payload.poll;
      payload.embeds[0].image = { url: 'attachment://' + image.name };
      payload.embeds[0].footer.text = 'Die Umfrage folgt als eigene Nachricht · Zusage startet noch keinen Dienst';
      payload.attachments = [{ id: 0, filename: image.name, description: 'Bild zur Stream-Anfrage' }];
    }
    return payload;
  }
  function mergePollSummary(previous, poll, checkedAt) {
    const retain = () => previous ? Object.assign({}, clone(previous), { stale: true }) : null;
    if (!poll || !Array.isArray(poll.answers)) return retain();
    const answers = poll.answers.map(answer => ({ id: answer && answer.answer_id, text: answer && answer.poll_media && answer.poll_media.text }));
    if (answers.length !== REQUEST_ANSWERS.length || new Set(answers.map(a => a.id)).size !== answers.length || answers.some(a => !Number.isSafeInteger(a.id) || a.id < 1 || !REQUEST_ANSWERS.includes(a.text)) || new Set(answers.map(a => a.text)).size !== REQUEST_ANSWERS.length) return retain();
    const counts = poll.results && poll.results.answer_counts;
    const countsValid = Array.isArray(counts) && new Set(counts.map(c => c && c.id)).size === counts.length && counts.every(c => c && answers.some(a => a.id === c.id) && Number.isSafeInteger(c.count) && c.count >= 0);
    const previousMatches = previous && previous.known && Array.isArray(previous.answers) && answers.every(a => previous.answers.some(p => p.id === a.id && p.text === a.text));
    const expiry = typeof poll.expiry === 'string' ? Date.parse(poll.expiry) : NaN;
    return {
      answers: answers.map(a => ({ id: a.id, text: a.text, count: countsValid ? ((counts.find(c => c.id === a.id) || {}).count || 0) : previousMatches ? previous.answers.find(p => p.id === a.id).count : null })),
      known: !!(countsValid || previousMatches), stale: !countsValid,
      isFinalized: countsValid ? poll.results.is_finalized === true : !!(previous && previous.isFinalized),
      expiresAt: Number.isFinite(expiry) ? expiry : previous && previous.expiresAt || null,
      updatedAt: countsValid ? checkedAt : previous && previous.updatedAt || null
    };
  }
  function buildPayload(event, session) {
    if (event.type === 'request') return buildRequestPayload(event);
    const profile = session.profile || { name: session.name, team: session.team, discordId: session.discordId };
    const metrics = event.metrics || sessionTotals(session, event.at);
    const time = ms => '<t:' + Math.floor(ms / 1000) + ':F>';
    const fields = [
      { name: 'Moderator', value: discordText(profile.name || 'Moderator'), inline: true },
      { name: 'Team', value: discordText(profile.team || 'Moderation'), inline: true },
      { name: 'Zeitpunkt', value: time(event.at), inline: false },
      { name: 'Netto-Dienstzeit', value: formatDuration(metrics.activeMs), inline: true },
      { name: 'Pausenzeit', value: formatDuration(metrics.pauseMs), inline: true }
    ];
    if (profile.discordId) fields.push({ name: 'Discord-ID (selbst angegeben)', value: profile.discordId, inline: false });
    if (event.type === 'finish') {
      fields.push({ name: 'Dienstbeginn', value: time(session.startedAt), inline: true });
      fields.push({ name: 'Gesamtdauer', value: formatDuration(metrics.totalMs), inline: true });
    }
    if (event.note) fields.push({ name: 'Notiz', value: discordText(event.note), inline: false });
    return { username: 'Modstempel', allowed_mentions: { parse: [] }, embeds: [{ title: EVENT_NAMES[event.type] || 'Mod-Dienst', color: COLORS[event.type] || COLORS.start, timestamp: new Date(event.at).toISOString(), fields, footer: { text: 'Stempelzeit · Sitzung ' + session.id + ' · Ereignis ' + event.id } }] };
  }
  function createApp(options) {
    options = options || {};
    const bridge = options.bridge;
    if (!bridge) throw new Error('App-Verbindung fehlt.');
    let state = freshState(), ready = false, storageError = null, rawState = '', disposed = false, recoveryUnavailable = false;
    let connection = { configured: false }, queueBusy = false, readBusy = false, imagePickerBusy = false, timer = null, ticker = null, initializing = null;
    const listeners = new Set();
    function readClock() {
      if (options.now) return { wallMs: options.now() };
      try { if (bridge.clock) return bridge.clock(); } catch (_) { /* Wall-clock fallback. */ }
      return { wallMs: Date.now() };
    }
    function now() {
      const c = readClock(), a = state.clockAnchor;
      if (a && a.bootId != null && c.bootId === a.bootId && Number.isFinite(c.elapsedMs) && c.elapsedMs >= a.elapsedMs) return a.wallMs + c.elapsedMs - a.elapsedMs;
      return Number.isFinite(c.wallMs) ? c.wallMs : Date.now();
    }
    function notify() {
      if (disposed) return;
      const snapshot = getSnapshot();
      for (const fn of listeners) { try { fn(snapshot); } catch (_) { /* One view cannot block saving. */ } }
    }
    function assertReady() {
      if (!ready) throw new Error(storageError || 'Die App wird noch geladen.');
      if (storageError) throw new Error(storageError);
    }
    function transaction(change) {
      assertReady();
      const draft = clone(state);
      change(draft);
      const content = JSON.stringify(draft);
      try {
        const result = bridge.saveState(content);
        if (result === false || (result && result.ok === false)) throw new Error('Speichern fehlgeschlagen.');
      } catch (_) {
        storageError = 'Speichern auf dem Gerät fehlgeschlagen. Bitte Speicherplatz prüfen und die App neu öffnen. Die letzte Aktion wurde nicht bestätigt.';
        notify(); throw new Error(storageError);
      }
      state = draft; rawState = content; notify();
    }
    function validateState(value) {
      if (!value || value.version !== VERSION || !value.profile || !Array.isArray(value.sessions) || !Array.isArray(value.events)) throw new Error('Ungültiger Verlauf.');
      const ids = new Set();
      for (const s of value.sessions) {
        if (!s || typeof s.id !== 'string' || ids.has(s.id) || !Number.isFinite(s.startedAt) || !Array.isArray(s.pauses) || !s.profile || !['active', 'paused', 'finished'].includes(s.status)) throw new Error('Ungültiger Dienst.');
        ids.add(s.id);
        if ((s.status === 'finished') !== (s.endedAt != null)) throw new Error('Ungültiger Dienststatus.');
        if (s.endedAt != null && (!Number.isFinite(s.endedAt) || s.endedAt < s.startedAt)) throw new Error('Ungültige Endzeit.');
        let previous = s.startedAt, openPauses = 0;
        s.pauses.forEach((p, i) => {
          if (!Number.isFinite(p.startedAt) || p.startedAt < previous || (p.endedAt == null && (i !== s.pauses.length - 1 || s.status !== 'paused')) || (p.endedAt != null && (!Number.isFinite(p.endedAt) || p.endedAt < p.startedAt))) throw new Error('Ungültige Pause.');
          if (p.endedAt == null) openPauses++;
          previous = p.endedAt == null ? p.startedAt : p.endedAt;
          if (s.endedAt != null && previous > s.endedAt) throw new Error('Pause nach Dienstende.');
        });
        if ((s.status === 'paused') !== (openPauses === 1)) throw new Error('Ungültiger Pausenstatus.');
      }
      const active = value.sessions.filter(s => s.endedAt == null);
      if (active.length > 1 || (active.length === 1 && value.activeId !== active[0].id) || (active.length === 0 && value.activeId)) throw new Error('Uneindeutiger aktiver Dienst.');
      const eventIds = new Set();
      for (const e of value.events) {
        if (!e || typeof e.id !== 'string' || eventIds.has(e.id) || !EVENT_NAMES[e.type] || !Number.isFinite(e.at) || !['pending', 'sending', 'sent', 'failed', 'uncertain', 'skipped'].includes(e.status)) throw new Error('Ungültiges Ereignis.');
        if (e.type === 'request') {
          if (e.sessionId != null || !e.request) throw new Error('Ungültige Team-Abfrage.');
          const request = normalizeRequestInput(e.request, e.at);
          request.streamer = cleanText(e.request.streamer, 'Der Streamername', 60, false);
          request.team = cleanText(e.request.team, 'Der Teamname', 80, false);
          if (/[\r\n]/.test(request.streamer + request.team)) throw new Error('Ungültiges Anfrageprofil.');
          e.request = request;
          e.sendBefore = e.request.startsAt == null ? e.at + HOUR : e.request.startsAt;
          if (e.requestStage != null && !['image', 'poll'].includes(e.requestStage)) throw new Error('Ungültiger Versandschritt.');
          if (e.requestStage === 'image' && !request.image) throw new Error('Zum Bildversand fehlt die Bildreferenz.');
          if (e.imageMessageId != null) {
            if (!request.image || !safeDiscordId(e.imageMessageId) || e.requestStage !== 'poll' || !Number.isFinite(e.imageSentAt)) throw new Error('Ungültige Bild-Sendebestätigung.');
            if (e.imageChannelId && !safeDiscordId(e.imageChannelId) || e.imageGuildId && !safeDiscordId(e.imageGuildId)) throw new Error('Ungültiges Ziel der Bildnachricht.');
          } else if (e.requestStage === 'poll' && request.image) throw new Error('Die Bild-Sendebestätigung fehlt.');
        } else if (!ids.has(e.sessionId)) throw new Error('Ungültige Dienstzuordnung.');
        eventIds.add(e.id);
      }
      value.profile = Object.assign(defaultProfile(), value.profile);
      value.blockedRoutes = value.blockedRoutes || {};
      value.connectionMeta = value.connectionMeta || {};
      value.cooldownUntil = Number(value.cooldownUntil) || 0;
      return value;
    }
    async function init() {
      if (initializing) return initializing;
      initializing = Promise.resolve().then(() => {
        try {
          try { rawState = bridge.loadState() || ''; }
          catch (error) { recoveryUnavailable = true; throw error; }
          if (rawState) {
            const loaded = JSON.parse(rawState);
            if (loaded && loaded.nativeStorageError === true) {
              recoveryUnavailable = true;
              rawState = '';
              throw new Error('Der native Speicher konnte nicht gelesen werden.');
            }
            state = validateState(loaded);
          }
          connection = bridge.getConnection() || { configured: false };
          if (connection.configured && !connection.ref) throw new Error('Verbindungsdaten fehlen.');
          ready = true;
          let recovered = false;
          for (const event of state.events) if (event.status === 'sending') {
            event.status = 'uncertain'; event.error = 'Die App wurde während des Versands beendet. Bitte zuerst im Discord-Kanal prüfen.'; recovered = true;
          }
          const clock = readClock();
          if (!state.activeId || !state.clockAnchor || state.clockAnchor.bootId !== clock.bootId || (clock.elapsedMs != null && clock.elapsedMs < state.clockAnchor.elapsedMs)) { state.clockAnchor = clock; recovered = true; }
          if (recovered || !rawState) transaction(() => {});
          if (options.ticker !== false) ticker = setInterval(notify, 1000);
          kick();
        } catch (_) {
          if (recoveryUnavailable) storageError = 'Der gespeicherte Verlauf konnte nicht gelesen werden. Die Originaldatei bleibt unverändert. Ein Export ist gerade nicht möglich. Bitte die App neu öffnen und den freien Gerätespeicher prüfen.';
          else if (!storageError) storageError = 'Gespeicherte Daten konnten nicht sicher geöffnet werden. Sie werden nicht überschrieben. Bitte zunächst als JSON exportieren.';
          ready = false;
        }
        notify(); return getSnapshot();
      });
      return initializing;
    }
    function queueTerminal(event) {
      // A definite rejection is retained for review, but is not an active send.
      // Unknown delivery stays active until explicitly resolved by the user.
      return event.status === 'sent' || event.status === 'skipped' || event.status === 'failed';
    }
    function waitingForEvent(event, head) {
      if (event.status !== 'pending' || !head || head.id === event.id) return null;
      let message;
      if (head.status === 'uncertain') {
        message = 'Eine frühere Meldung hat eine unklare Zustellung. Öffne den blockierenden Eintrag und prüfe Discord. Danach kannst du ihn bewusst erneut senden oder lokal erledigen.';
      } else if (head.status === 'sending') {
        message = 'Eine frühere Meldung wird gerade an Discord übertragen. Danach ist diese Meldung an der Reihe.';
      } else {
        message = head.error ? 'Wartet auf eine frühere Meldung: ' + String(head.error).slice(0, 840)
          : 'Eine frühere Meldung wartet noch auf den Versand. Danach ist diese Meldung an der Reihe.';
      }
      return { eventId: head.id, status: head.status, type: head.type, message };
    }
    function getSnapshot() {
      const time = now();
      const sessionMap = new Map(state.sessions.map(s => [s.id, s]));
      const sessions = state.sessions.map(s => Object.assign(clone(s), s.profile, sessionTotals(s, time))).reverse();
      const midnight = new Date(time); midnight.setHours(0, 0, 0, 0);
      const monday = new Date(midnight); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      const day = rangeTotals(state.sessions, midnight.getTime(), time, time);
      const week = rangeTotals(state.sessions, monday.getTime(), time, time);
      const counts = { pending: 0, uncertain: 0, failed: 0, sent: 0, lastError: '', nextRetryAt: 0 };
      const heads = new Map();
      const events = state.events.map(e => {
        const s = sessionMap.get(e.sessionId);
        if (!queueTerminal(e) && !heads.has(e.routeId)) heads.set(e.routeId, e);
        if (e.status === 'sending') counts.pending++;
        else if (['pending', 'uncertain', 'failed', 'sent'].includes(e.status)) counts[e.status]++;
        if (e.error && !['sent', 'skipped'].includes(e.status)) counts.lastError = e.error;
        if (e.status === 'pending' && e.nextAttemptAt) counts.nextRetryAt = counts.nextRetryAt ? Math.min(counts.nextRetryAt, e.nextAttemptAt) : e.nextAttemptAt;
        const entry = Object.assign(clone(e), { name: e.type === 'request' ? e.request.streamer : s ? s.profile.name : '', title: EVENT_NAMES[e.type] });
        const waitingFor = waitingForEvent(e, heads.get(e.routeId));
        if (waitingFor) entry.waitingFor = waitingFor;
        if (e.type === 'request') entry.retryExpired = e.sendBefore <= time && ['failed', 'uncertain', 'pending'].includes(e.status);
        return entry;
      }).reverse();
      return { ready, profile: clone(state.profile), connection: Object.assign({}, connection, state.connectionMeta[connection.ref] || {}), activeSession: sessions.find(s => s.id === state.activeId) || null, sessions, events, requests: events.filter(e => e.type === 'request'), delivery: counts, networkBusy: queueBusy || readBusy, imageBusy: imagePickerBusy,
        totals: { todayMs: day.activeMs, todayPauseMs: day.pauseMs, weekMs: week.activeMs, sessionCount: state.sessions.length }, platform: { native: !!bridge.native }, storageError, jsonExportAvailable: !recoveryUnavailable };
    }
    function eventTime() {
      const time = now(), last = state.events[state.events.length - 1];
      if (last && time < last.at) throw new Error('Die Gerätezeit liegt vor dem letzten Stempel. Bitte die Uhrzeit prüfen.');
      return time;
    }
    function addEvent(draft, session, type, at, note) {
      const routeError = draft.blockedRoutes[session.routeId];
      draft.events.push({ id: uuid(), sessionId: session.id, type, at, note: note || '', routeId: session.routeId, metrics: sessionTotals(session, at), status: bridge.native ? (routeError ? 'failed' : 'pending') : 'skipped', attempts: 0, nextAttemptAt: 0, error: bridge.native ? (routeError || '') : 'Lokale Vorschau – kein Discord-Versand.' });
    }
    function validateProfile(profile) {
      const value = Object.assign(defaultProfile(), profile);
      value.name = cleanText(value.name, 'Dein Name', 60, false);
      value.team = cleanText(value.team, 'Der Teamname', 80, true) || 'Moderation';
      if (/[\r\n]/.test(value.name + value.team)) throw new Error('Name und Team dürfen keine Zeilenumbrüche enthalten.');
      value.discordId = String(value.discordId || '').trim();
      if (value.discordId && !/^\d{17,20}$/.test(value.discordId)) throw new Error('Die Discord-ID muss aus 17 bis 20 Ziffern bestehen.');
      if (!['gold', 'violet', 'blue', 'green'].includes(value.accent) && !/^#[0-9a-fA-F]{6}$/.test(value.accent)) throw new Error('Bitte eine gültige Akzentfarbe auswählen.');
      if (!['dark', 'light', 'system'].includes(value.theme)) throw new Error('Bitte ein gültiges Design auswählen.');
      return value;
    }
    async function start(note) {
      assertReady();
      if (state.activeId) throw new Error('Ein Dienst läuft bereits.');
      const profile = validateProfile(state.profile);
      if (bridge.native && !connection.configured) throw new Error('Bitte zuerst deinen Discord-Webhook in den Einstellungen speichern.');
      if (connection.ref && state.blockedRoutes[connection.ref]) throw new Error('Diese Discord-Verbindung ist gesperrt. Bitte den Webhook prüfen oder ersetzen.');
      note = cleanText(note, 'Die Notiz', 280, true);
      const clock = readClock(), at = Number.isFinite(clock.wallMs) ? clock.wallMs : eventTime();
      const last = state.events[state.events.length - 1];
      if (last && at < last.at) throw new Error('Bitte die Gerätezeit prüfen. Sie liegt vor dem letzten Stempel.');
      transaction(draft => {
        draft.clockAnchor = clock;
        const session = { id: uuid(), profile, routeId: connection.ref || null, startedAt: at, endedAt: null, status: 'active', pauses: [], note, endNote: '' };
        draft.sessions.push(session); draft.activeId = session.id; addEvent(draft, session, 'start', at, note);
      });
      kick(); return getSnapshot();
    }
    async function changeStatus(type, note) {
      assertReady();
      const current = state.sessions.find(s => s.id === state.activeId);
      if (!current) throw new Error('Es läuft gerade kein Dienst.');
      if (type === 'pause' && current.status !== 'active') throw new Error('Die Pause läuft bereits.');
      if (type === 'resume' && current.status !== 'paused') throw new Error('Es läuft gerade keine Pause.');
      note = cleanText(note, 'Die Notiz', 280, true);
      const at = eventTime();
      transaction(draft => {
        const s = draft.sessions.find(s => s.id === draft.activeId);
        if (type === 'pause') { s.pauses.push({ startedAt: at, endedAt: null }); s.status = 'paused'; }
        if (type === 'resume' || (type === 'finish' && s.status === 'paused')) s.pauses[s.pauses.length - 1].endedAt = at;
        if (type === 'resume') s.status = 'active';
        if (type === 'finish') { s.status = 'finished'; s.endedAt = at; s.endNote = note; draft.activeId = null; }
        addEvent(draft, s, type, at, note);
      });
      kick(); return getSnapshot();
    }
    async function createRequest(input) {
      assertReady();
      const profile = validateProfile(state.profile);
      if (bridge.native && !connection.configured) throw new Error('Bitte zuerst deinen Namen und den Discord-Webhook in den Einstellungen speichern.');
      if (connection.ref && state.blockedRoutes[connection.ref]) throw new Error('Diese Discord-Verbindung ist gesperrt. Bitte zuerst die Verbindung prüfen.');
      const at = eventTime();
      const request = Object.assign(normalizeRequestInput(input, at), { streamer: profile.name, team: profile.team });
      if (request.image && !bridge.native) throw new Error('Bilder kannst du in der installierten Android-App auswählen und senden.');
      const signature = JSON.stringify(request);
      if (state.events.some(e => e.type === 'request' && e.routeId === (connection.ref || null) && at - e.at < 60000 && !e.expired && e.status !== 'failed' && (e.status !== 'skipped' || !bridge.native) && JSON.stringify(e.request) === signature)) throw new Error('Diese Abfrage wurde gerade schon erstellt. Du findest sie unter „Deine Abfragen“.');
      transaction(draft => {
        draft.events.push({
          id: uuid(), type: 'request', sessionId: null, at, request,
          requestStage: request.image ? 'image' : 'poll',
          routeId: connection.ref || null, sendBefore: request.startsAt == null ? at + HOUR : request.startsAt,
          status: bridge.native ? 'pending' : 'skipped', attempts: 0, nextAttemptAt: 0,
          error: bridge.native ? '' : 'Lokale Vorschau – kein Discord-Versand.',
          pollSummary: null, pollError: ''
        });
      });
      kick(); return getSnapshot();
    }
    function previewRequest(input) {
      const at = now();
      const request = Object.assign(normalizeRequestInput(input, at), { streamer: state.profile.name || 'Dein Name', team: state.profile.team || 'Moderation' });
      return buildRequestPayload({ id: 'vorschau', type: 'request', at, request });
    }
    async function pickRequestImage() {
      assertReady();
      if (!bridge.native || typeof bridge.pickImage !== 'function') throw new Error('Bilder kannst du in der installierten Android-App auswählen.');
      if (imagePickerBusy) throw new Error('Die Bildauswahl ist bereits geöffnet.');
      imagePickerBusy = true; notify();
      try {
        const result = await bridge.pickImage();
        if (result && result.kind === 'cancelled') return null;
        if (!result || !result.ok || !result.image) throw new Error(result && result.message || 'Das Bild konnte nicht ausgewählt werden. Bitte erneut versuchen.');
        return normalizeRequestImage(result.image);
      } finally { imagePickerBusy = false; notify(); }
    }
    async function discardRequestImage(ref) {
      assertReady();
      if (typeof ref !== 'string' || !IMAGE_REF.test(ref)) throw new Error('Die Bildreferenz ist ungültig.');
      if (state.events.some(e => e.type === 'request' && e.request.image && e.request.image.ref === ref)) return { ok: true, removed: false, retained: true };
      if (!bridge.native || typeof bridge.discardImage !== 'function') throw new Error('Bitte die aktuelle Android-Version von Modstempel verwenden.');
      const result = await bridge.discardImage(ref);
      if (!result || !result.ok) throw new Error(result && result.message || 'Das Bild konnte nicht entfernt werden. Bitte erneut versuchen.');
      return result.retained ? { ok: true, removed: false, retained: true } : { ok: true, removed: result.removed === true };
    }
    function getRequest(id) {
      const event = state.events.find(e => e.id === id && e.type === 'request');
      if (!event) throw new Error('Diese Team-Abfrage wurde nicht gefunden.');
      return event;
    }
    async function refreshRequest(id) {
      assertReady();
      const event = getRequest(id);
      if (event.status !== 'sent' || !safeDiscordId(event.messageId)) throw new Error('Die Abfrage muss erst von Discord bestätigt werden.');
      if (typeof bridge.readPoll !== 'function') throw new Error('Bitte die aktuelle Android-Version von Modstempel installieren.');
      beginRead();
      let result;
      try {
        try { result = await bridge.readPoll(event.routeId, event.messageId); }
        catch (_) { result = { ok: false, kind: 'network', message: 'Die Antworten konnten gerade nicht geladen werden.' }; }
        result = result || { ok: false, kind: 'network', message: 'Discord hat keine Antwort geliefert.' };
        transaction(draft => {
          const current = draft.events.find(e => e.id === id), time = now();
          current.pollCheckedAt = time;
          current.pollSummary = mergePollSummary(current.pollSummary, result.ok ? result.poll : null, time);
          current.pollError = result.ok ? (result.poll ? '' : 'Discord liefert derzeit keine Umfragedaten. Bitte die Nachricht in Discord öffnen.') : (result.message || 'Die Antworten konnten gerade nicht geladen werden.');
          if (result.ok && safeDiscordId(result.channelId)) current.channelId = result.channelId;
          if (result.kind === 'rate_limited') draft.cooldownUntil = Math.max(draft.cooldownUntil || 0, time + Math.max(1, Number(result.retryAfterMs) || 1000));
        });
      } finally { endRead(); }
      if (!result.ok) throw new Error(result.message || 'Die Antworten konnten gerade nicht geladen werden.');
      return getSnapshot();
    }
    async function openRequestMessage(id, imageOnly) {
      assertReady();
      if (!bridge.native || typeof bridge.openDiscord !== 'function') throw new Error('Discord öffnen steht in der Android-App zur Verfügung.');
      const event = getRequest(id);
      const messageId = safeDiscordId(imageOnly ? event.imageMessageId : event.messageId);
      if (!messageId || !imageOnly && event.status !== 'sent') throw new Error(imageOnly ? 'Die Bildnachricht muss erst von Discord bestätigt werden.' : 'Die Abfrage muss erst von Discord bestätigt werden.');
      let metadata = state.connectionMeta[event.routeId] || {};
      if (!safeDiscordId(metadata.guildId)) {
        beginRead();
        try {
          const checked = await checkRoute(event.routeId);
          if (!checked.ok) throw new Error(checked.message || 'Die Discord-Verbindung konnte nicht gelesen werden.');
          metadata = state.connectionMeta[event.routeId] || {};
        } finally { endRead(); }
      }
      const guildId = safeDiscordId(metadata.guildId), channelId = safeDiscordId(imageOnly ? event.imageChannelId : event.channelId);
      if (!guildId || !channelId) throw new Error('Der Discord-Nachrichtenlink ist noch unvollständig. Bitte zuerst die Ergebnisse aktualisieren und die Verbindung prüfen.');
      const result = await bridge.openDiscord({ guildId, channelId, messageId });
      if (!result || !result.ok) throw new Error(result && result.message || 'Discord konnte nicht geöffnet werden.');
      return result;
    }
    async function openRequest(id) { return openRequestMessage(id, false); }
    async function openRequestImage(id) { return openRequestMessage(id, true); }
    async function saveSettings(input) {
      assertReady(); input = input || {};
      const fields = {};
      ['name', 'discordId', 'team', 'accent', 'theme'].forEach(key => { if (input[key] !== undefined) fields[key] = input[key]; });
      const next = validateProfile(Object.assign({}, state.profile, fields));
      const webhook = String(input.webhook || '').trim();
      if (state.activeId && (webhook || ['name', 'discordId', 'team'].some(k => next[k] !== state.profile[k]))) throw new Error('Bitte den laufenden Dienst beenden, bevor du Profil oder Webhook änderst.');
      let savedConnection = connection;
      if (webhook) {
        savedConnection = bridge.storeWebhook(validateWebhook(webhook));
        if (!savedConnection || !savedConnection.configured || !savedConnection.ref) throw new Error('Webhook konnte nicht gespeichert werden.');
      }
      transaction(draft => { draft.profile = next; });
      connection = savedConnection; notify(); return getSnapshot();
    }
    async function checkRoute(ref) {
      let result;
      try { result = await bridge.check(ref); } catch (_) { result = { ok: false, message: 'Die Verbindung konnte nicht geprüft werden.' }; }
      result = result || { ok: false, message: 'Discord hat keine Antwort geliefert.' };
      transaction(draft => {
        const old = draft.connectionMeta[ref] || {};
        draft.connectionMeta[ref] = { verified: !!result.ok, name: result.ok ? (result.name || 'Discord-Webhook') : '', error: result.ok ? '' : (result.message || 'Verbindung fehlgeschlagen.'), guildId: result.ok ? safeDiscordId(result.guildId) : old.guildId || '', channelId: result.ok ? safeDiscordId(result.channelId) : old.channelId || '' };
        if (result.kind === 'rate_limited') draft.cooldownUntil = Math.max(draft.cooldownUntil || 0, now() + Math.max(1, Number(result.retryAfterMs) || 1000));
        if (result.ok) delete draft.blockedRoutes[ref];
      });
      return result;
    }
    function beginRead() {
      assertReady();
      if (!bridge.native) throw new Error('Discord-Abfragen stehen in der Android-App zur Verfügung.');
      if (queueBusy || readBusy) throw new Error('Bitte kurz warten, bis die laufende Übertragung abgeschlossen ist.');
      if (state.cooldownUntil > now()) throw new Error('Discord hat eine kurze Sendepause angefordert. Bitte danach erneut versuchen.');
      readBusy = true; clearTimeout(timer); notify();
    }
    function endRead() { readBusy = false; notify(); kick(); }
    async function checkConnection() {
      assertReady();
      if (!connection.configured) throw new Error('Bitte zuerst einen Webhook speichern.');
      beginRead();
      let result;
      try { result = await checkRoute(connection.ref); } finally { endRead(); }
      if (!result.ok) throw new Error(result.message || 'Verbindung fehlgeschlagen.');
      return result;
    }
    function expireRequests() {
      const time = now();
      const expired = state.events.filter(e => e.type === 'request' && e.status === 'pending' && e.sendBefore <= time);
      if (!expired.length) return;
      const ids = new Set(expired.map(e => e.id));
      transaction(draft => draft.events.forEach(e => {
        if (ids.has(e.id)) { e.status = 'skipped'; e.expired = true; e.error = e.imageMessageId ? 'Das Bild wurde bereits in Discord bestätigt. Die Umfrage wurde nicht gesendet, weil der Streamtermin beziehungsweise das Versandfenster abgelaufen ist.' : 'Diese Abfrage wurde nicht gesendet, weil der Streamtermin beziehungsweise das Versandfenster abgelaufen ist.'; e.nextAttemptAt = 0; }
      }));
    }
    function firstPending() {
      if (state.cooldownUntil > now()) return null;
      const seen = new Set();
      for (const e of state.events) {
        if (queueTerminal(e)) continue;
        if (seen.has(e.routeId)) continue;
        seen.add(e.routeId);
        if (e.status === 'pending' && !state.blockedRoutes[e.routeId] && (e.nextAttemptAt || 0) <= now()) return e;
      }
      return null;
    }
    function schedule() {
      if (options.autoSync === false || disposed || !ready || storageError || !bridge.native || readBusy) return;
      clearTimeout(timer);
      let next = Infinity;
      const seen = new Set();
      for (const e of state.events) {
        if (e.type === 'request' && e.status === 'pending') next = Math.min(next, e.sendBefore);
        if (queueTerminal(e)) continue;
        if (seen.has(e.routeId)) continue;
        seen.add(e.routeId);
        if (e.status === 'pending' && !state.blockedRoutes[e.routeId]) next = Math.min(next, e.type === 'request' ? e.sendBefore : Infinity, Math.max(e.nextAttemptAt || 0, state.cooldownUntil || 0));
      }
      if (next !== Infinity) timer = setTimeout(() => { flushQueue().catch(() => {}); }, Math.max(50, Math.min(60000, next - now())));
    }
    function kick() { if (!queueBusy) schedule(); }
    async function flushQueue() {
      if (queueBusy || readBusy || !ready || disposed || storageError || !bridge.native) return getSnapshot();
      queueBusy = true; clearTimeout(timer);
      try {
        let event;
        while (!disposed && !storageError) {
          expireRequests();
          event = firstPending();
          if (!event) break;
          const id = event.id;
          transaction(draft => {
            const e = draft.events.find(e => e.id === id);
            // Legacy failed/pending requests adopt the new plan only when a
            // send attempt actually begins. Historical sent items stay intact.
            if (e.type === 'request' && !e.requestStage) e.requestStage = e.request.image ? 'image' : 'poll';
            e.status = 'sending'; e.attempts++; e.error = '';
          });
          const e = state.events.find(e => e.id === id), s = state.sessions.find(s => s.id === e.sessionId);
          let result;
          try { result = await bridge.send(e.routeId, buildPayload(e, s), e.type === 'request' && e.requestStage === 'image' && e.request.image ? e.request.image.ref : undefined); }
          catch (_) { result = { ok: false, kind: 'uncertain', message: 'Es fehlt eine sichere Sendebestätigung. Bitte Discord prüfen.' }; }
          result = result || { ok: false, kind: 'uncertain', message: 'Discord hat keine Bestätigung zurückgegeben.' };
          if (e.type === 'request' && e.requestStage === 'image' && result.ok && !safeDiscordId(result.messageId)) result = { ok: false, kind: 'uncertain', message: 'Für das Bild fehlt eine gültige Sendebestätigung. Bitte zuerst Discord prüfen; die Umfrage wurde noch nicht gesendet.' };
          transaction(draft => {
            const e = draft.events.find(e => e.id === id), time = now();
            if (result.ok && result.messageId) {
              if (e.type === 'request' && e.requestStage === 'image') {
                e.imageMessageId = String(result.messageId);
                e.imageChannelId = safeDiscordId(result.channelId);
                e.imageSentAt = time;
                const metadata = draft.connectionMeta[e.routeId] || {};
                if (safeDiscordId(metadata.guildId)) e.imageGuildId = metadata.guildId;
                e.requestStage = 'poll'; e.status = 'pending';
                // This checkpoint must save successfully before the next
                // loop iteration is allowed to send the poll.
              } else {
                e.status = 'sent'; e.messageId = String(result.messageId); e.sentAt = time;
                if (safeDiscordId(result.channelId)) e.channelId = result.channelId;
                if (e.type === 'request') { e.pollSummary = mergePollSummary(e.pollSummary, result.poll, time); e.pollCheckedAt = time; }
              }
              e.error = ''; e.nextAttemptAt = 0;
              if (result.cooldownMs) draft.cooldownUntil = Math.max(draft.cooldownUntil || 0, time + Math.max(0, Number(result.cooldownMs) || 0));
            } else if (result.kind === 'rate_limited') {
              e.status = 'pending'; e.nextAttemptAt = time + Math.max(1, Number(result.retryAfterMs) || 1000);
              draft.cooldownUntil = Math.max(draft.cooldownUntil || 0, e.nextAttemptAt);
              e.error = 'Discord hat eine kurze Sendepause angefordert. Die Meldung wird danach übertragen.';
            } else if (result.kind === 'network' || result.kind === 'unconfigured') {
              e.status = 'pending'; e.nextAttemptAt = time + Math.min(60000, 1000 * Math.pow(2, Math.min(e.attempts, 6)));
              e.error = result.message || 'Offline. Lokal gespeichert; Versand beim nächsten Öffnen mit Verbindung.';
            } else if (result.kind === 'permanent') {
              e.status = 'failed'; e.error = result.message || 'Discord hat die Meldung abgelehnt.';
              if (result.blockRoute) {
                draft.blockedRoutes[e.routeId] = e.error;
                draft.connectionMeta[e.routeId] = { verified: false, name: '', error: e.error };
                draft.events.forEach(other => { if (other.routeId === e.routeId && other.status === 'pending') { other.status = 'failed'; other.error = e.error; } });
              }
            } else { e.status = 'uncertain'; e.error = result.message || 'Bestätigung fehlt. Bitte vor erneutem Senden den Discord-Kanal prüfen.'; }
          });
        }
      } finally { queueBusy = false; notify(); schedule(); }
      return getSnapshot();
    }
    async function retryEvent(id) {
      assertReady();
      const current = state.events.find(e => e.id === id);
      if (!current || !['failed', 'uncertain', 'pending'].includes(current.status)) throw new Error('Diese Meldung kann nicht erneut gesendet werden.');
      if (current.type === 'request' && current.sendBefore <= now()) throw new Error('Der Termin dieser Abfrage ist abgelaufen. Bitte eine neue Abfrage erstellen; die alte kannst du lokal erledigen.');
      if (state.blockedRoutes[current.routeId]) throw new Error('Der Webhook wurde abgelehnt. Bitte zuerst die Verbindung prüfen.');
      transaction(draft => { const e = draft.events.find(e => e.id === id); e.status = 'pending'; e.error = ''; e.nextAttemptAt = 0; });
      kick(); return getSnapshot();
    }
    async function markEventHandled(id) {
      assertReady();
      transaction(draft => {
        const e = draft.events.find(e => e.id === id);
        if (!e || !['failed', 'uncertain', 'pending'].includes(e.status)) throw new Error('Diese Meldung kann nicht manuell erledigt werden.');
        e.status = 'skipped'; e.error = e.imageMessageId ? 'Bild in Discord bestätigt. Umfrage lokal erledigt; für die Umfrage liegt keine Sendebestätigung vor.' : 'Manuell erledigt; keine Sendebestätigung von Discord.';
      });
      kick(); return getSnapshot();
    }
    function csvCell(value) {
      let text = String(value == null ? '' : value);
      if (/^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    }
    async function exportData(format) {
      if (!['csv', 'json'].includes(format)) throw new Error('Unbekanntes Exportformat.');
      if (recoveryUnavailable) throw new Error('Der gespeicherte Verlauf ist nicht lesbar. Ein Export ist gerade nicht möglich; die Originaldatei bleibt unverändert.');
      const day = new Date(now()).toISOString().slice(0, 10);
      let content;
      if (format === 'json') content = !ready && rawState ? rawState : JSON.stringify({ app: 'Modstempel', version: VERSION, exportedAt: new Date(now()).toISOString(), profile: state.profile, sessions: state.sessions, events: state.events }, null, 2);
      else {
        if (!ready) throw new Error('Bitte beschädigte Daten zuerst als JSON sichern.');
        const rows = [['Sitzungs-ID', 'Moderator', 'Discord-ID', 'Team', 'Beginn (ISO)', 'Ende (ISO)', 'Status', 'Netto (Sekunden)', 'Pause (Sekunden)', 'Gesamt (Sekunden)', 'Startnotiz', 'Endnotiz']];
        state.sessions.forEach(s => { const t = sessionTotals(s, now()); rows.push([s.id, s.profile.name, s.profile.discordId, s.profile.team, new Date(s.startedAt).toISOString(), s.endedAt == null ? '' : new Date(s.endedAt).toISOString(), s.status, Math.floor(t.activeMs / 1000), Math.floor(t.pauseMs / 1000), Math.floor(t.totalMs / 1000), s.note, s.endNote]); });
        content = '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
      }
      return bridge.exportFile('Modstempel-' + day + '.' + format, format === 'csv' ? 'text/csv' : 'application/json', content);
    }
    function previewPayload(type) {
      type = EVENT_NAMES[type] ? type : 'start';
      const at = now(), s = state.sessions.find(s => s.id === state.activeId) || { id: 'vorschau', profile: Object.assign({}, state.profile, { name: state.profile.name || 'Dein Name' }), startedAt: at, endedAt: null, pauses: [] };
      return buildPayload({ id: 'vorschau', type, at, note: '', metrics: sessionTotals(s, at) }, s);
    }
    function onResume() { if (ready && !disposed) { notify(); kick(); } }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden) onResume(); });
    if (typeof window !== 'undefined') { window.addEventListener('online', onResume); window.addEventListener('modstempel-resume', onResume); }
    return { init, getSnapshot, start, pause: () => changeStatus('pause'), resume: () => changeStatus('resume'), finish: note => changeStatus('finish', note), createRequest, previewRequest, pickRequestImage, discardRequestImage, requestImageUrl, refreshRequest, openRequest, openRequestImage, saveSettings, checkConnection, flushQueue, retryEvent, markEventHandled, exportData, previewPayload,
      pasteWebhook: () => bridge.clipboard(),
      subscribe(fn) { listeners.add(fn); if (ready) fn(getSnapshot()); return () => listeners.delete(fn); },
      dispose() { disposed = true; clearTimeout(timer); clearInterval(ticker); listeners.clear(); }
    };
  }
  return { createApp, validateWebhook, sessionTotals, rangeTotals, buildPayload, buildRequestPayload, normalizeRequestImage, requestImageUrl, mergePollSummary, formatDuration };
}));
