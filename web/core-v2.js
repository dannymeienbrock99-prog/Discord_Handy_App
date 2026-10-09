(function (root, factory) {
  'use strict';
  const api = factory(typeof module === 'object' && module.exports ? require('./core.js') : root.ModstempelCore);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.ModstempelCoreV2 = api; root.Modstempel = api.createApp({ bridge: root.ModstempelBridge }); }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (base) {
  'use strict';
  const HOUR = 3600000, DAY = 24 * HOUR;
  const CATEGORIES = { modstempel: 'Modstempel', stream: 'Stream', big_match: 'BIG Match', general: 'Allgemein', poll: 'Umfrage' };
  const STAMPS = { start: 'Dienst gestartet', pause: 'Pause begonnen', resume: 'Dienst fortgesetzt', finish: 'Dienst beendet' };
  const STATUSES = ['pending', 'sending', 'sent', 'failed', 'uncertain', 'skipped'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const idOk = value => typeof value === 'string' && /^\d{17,20}$/.test(value);
  const opIdOk = value => typeof value === 'string' && /^[A-Za-z0-9_-]{16,80}$/.test(value);
  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) return Array.from(crypto.getRandomValues(new Uint8Array(20)), n => n.toString(16).padStart(2, '0')).join('');
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
  function text(value, name, max, optional) {
    const result = String(value == null ? '' : value).trim().normalize('NFC');
    if (!optional && !result) throw new Error(name + ' fehlt.');
    if (result.length > max) throw new Error(name + ' darf höchstens ' + max + ' Zeichen haben.');
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(result)) throw new Error(name + ' enthält ungültige Zeichen.');
    return result;
  }
  function line(value, name, max, optional) {
    const result = text(value, name, max, optional);
    if (/[\r\n]/.test(result)) throw new Error(name + ' darf keine Zeilenumbrüche enthalten.');
    return result;
  }
  const emptySelection = () => ({ guildId: '', guildName: '', channelId: '', channelName: '', moderatorRoleId: '', moderatorRoleName: '' });
  const emptyAuth = () => ({ configured: false, origin: '', serverReady: null, authenticated: false, access: null, accessCheckedAt: 0 });
  const fresh = () => ({
    version: 2, profile: { name: '', team: 'Moderation', accent: 'red', theme: 'dark' },
    sessions: [], events: [], activeId: null, selection: emptySelection(), legacyArchive: null, clockAnchor: null
  });
  function validateSessions(state) {
    const seen = new Set();
    for (const session of state.sessions) {
      if (!session || typeof session.id !== 'string' || seen.has(session.id) || !session.profile || !Number.isFinite(session.startedAt) || !Array.isArray(session.pauses) || !['active', 'paused', 'finished'].includes(session.status)) throw new Error('Ungültiger gespeicherter Dienst.');
      seen.add(session.id);
      if ((session.status === 'finished') !== (session.endedAt != null)) throw new Error('Ungültiger Dienststatus.');
      if (session.endedAt != null && (!Number.isFinite(session.endedAt) || session.endedAt < session.startedAt)) throw new Error('Ungültige Dienstzeit.');
      let previous = session.startedAt, open = 0;
      session.pauses.forEach((pause, index) => {
        if (!Number.isFinite(pause.startedAt) || pause.startedAt < previous || pause.endedAt != null && (!Number.isFinite(pause.endedAt) || pause.endedAt < pause.startedAt)) throw new Error('Ungültige Pausenzeit.');
        if (pause.endedAt == null) {
          if (index !== session.pauses.length - 1 || session.status !== 'paused') throw new Error('Ungültige offene Pause.');
          open++;
        }
        previous = pause.endedAt == null ? pause.startedAt : pause.endedAt;
        if (session.endedAt != null && previous > session.endedAt) throw new Error('Pause nach Dienstende.');
      });
      if ((session.status === 'paused') !== (open === 1)) throw new Error('Ungültiger Pausenstatus.');
    }
    const active = state.sessions.filter(s => s.endedAt == null);
    if (active.length > 1 || active.length === 1 && state.activeId !== active[0].id || !active.length && state.activeId) throw new Error('Uneindeutiger laufender Dienst.');
  }
  function parseState(raw) {
    if (!raw) return fresh();
    const loaded = JSON.parse(raw);
    if (!loaded || loaded.nativeStorageError) throw new Error('Der gespeicherte Verlauf konnte nicht gelesen werden.');
    if (![1, 2].includes(loaded.version) || !loaded.profile || !Array.isArray(loaded.sessions) || !Array.isArray(loaded.events)) throw new Error('Unbekanntes gespeichertes Datenformat.');
    validateSessions(loaded);
    if (loaded.version === 1) {
      const result = fresh();
      result.profile = Object.assign(result.profile, loaded.profile);
      result.sessions = clone(loaded.sessions).map(s => Object.assign(s, { legacy: true, target: null }));
      result.activeId = loaded.activeId;
      result.clockAnchor = loaded.clockAnchor || null;
      result.legacyArchive = clone(loaded);
      return result;
    }
    const seen = new Set();
    for (const event of loaded.events) {
      if (!event || !opIdOk(event.id) || seen.has(event.id) || !STATUSES.includes(event.status) || !['post', 'stamp', 'scheduled_event'].includes(event.type) || !Number.isFinite(event.createdAt)) throw new Error('Ungültiger gespeicherter Auftrag.');
      seen.add(event.id);
      if (!event.legacyLocal) {
        const op = event.operation, target = event.target;
        if (!op || op.id !== event.id || !target || op.actorId !== target.actorId || !idOk(op.actorId) || !idOk(op.guildId) || op.guildId !== target.guildId || typeof target.origin !== 'string' || !target.origin.startsWith('https://')) throw new Error('Ungültiges gespeichertes Discord-Ziel.');
        if (event.type !== 'scheduled_event' && (!idOk(op.channelId) || op.channelId !== target.channelId)) throw new Error('Ungültiger gespeicherter Kanal.');
        if (op.image) base.normalizeRequestImage(op.image);
      }
    }
    loaded.selection = Object.assign(emptySelection(), loaded.selection || {});
    loaded.profile = Object.assign(fresh().profile, loaded.profile);
    return loaded;
  }
  function createApp(options) {
    options = options || {};
    const bridge = options.bridge;
    if (!bridge) throw new Error('Native App-Verbindung fehlt.');
    let state = fresh(), ready = false, rawState = '', storageError = '', disposed = false, initializing = null;
    let auth = emptyAuth(), guilds = [], guildSetup = null, scheduledEvents = [];
    let work = 0, queueBusy = false, imageBusy = false, authBusy = false, catalogGeneration = 0;
    let ticker = null, queueTimer = null, authTimer = null, accessTimer = null, accessRetryDelay = 15000;
    const listeners = new Set();
    function clock() {
      if (options.now) return { wallMs: options.now() };
      try { if (bridge.clock) return bridge.clock(); } catch (_) {}
      return { wallMs: Date.now() };
    }
    function now() {
      const current = clock(), anchor = state.clockAnchor;
      if (state.activeId && anchor && anchor.bootId != null && current.bootId === anchor.bootId && Number.isFinite(current.elapsedMs) && current.elapsedMs >= anchor.elapsedMs) return anchor.wallMs + current.elapsedMs - anchor.elapsedMs;
      return Number.isFinite(current.wallMs) ? current.wallMs : Date.now();
    }
    function getSnapshot() {
      const at = now();
      const sessions = state.sessions.map(s => Object.assign(clone(s), base.sessionTotals(s, at), { name: s.profile.name || '', team: s.profile.team || '' })).reverse();
      const midnight = new Date(at); midnight.setHours(0, 0, 0, 0);
      const monday = new Date(midnight); monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
      const day = base.rangeTotals(state.sessions, +midnight, at, at), week = base.rangeTotals(state.sessions, +monday, at, at);
      const events = state.events.map(e => {
        const result = clone(e);
        if (!result.legacyLocal && result.status === 'pending' && !matchesAccount(result)) result.waitingReason = 'Mit dem ursprünglichen Discord-Konto und Verbindungsserver anmelden, um diesen Auftrag fortzusetzen.';
        else if (!result.legacyLocal && ['pending', 'sending', 'uncertain'].includes(result.status) && !hasAccess()) result.waitingReason = accessReason();
        return result;
      }).reverse();
      const legacyEvents = state.legacyArchive && Array.isArray(state.legacyArchive.events) ? state.legacyArchive.events.map(e => Object.assign(clone(e), { legacy: true, legacyNotice: 'Archiv aus Version 1 · Kein weiterer Webhook-Versand.' })).reverse() : [];
      return {
        ready, now: at, storageError, profile: clone(state.profile), auth: clone(auth), selection: clone(state.selection),
        guilds: clone(guilds), guildSetup: guildSetup ? clone(guildSetup) : null, scheduledEvents: clone(scheduledEvents),
        sessions, activeSession: sessions.find(s => s.id === state.activeId) || null, events,
        posts: events.filter(e => e.type === 'post'), eventOperations: events.filter(e => e.type === 'scheduled_event'), legacyEvents,
        totals: { todayMs: day.activeMs, todayPauseMs: day.pauseMs, weekMs: week.activeMs, sessionCount: sessions.length },
        networkBusy: work > 0 || queueBusy || authBusy, imageBusy, platform: { native: !!bridge.native }, jsonExportAvailable: !!rawState || ready
      };
    }
    function notify() {
      if (disposed) return;
      const snapshot = getSnapshot();
      for (const fn of listeners) { try { fn(snapshot); } catch (_) {} }
    }
    function assertReady() {
      if (!ready || storageError) throw new Error(storageError || 'Die App wird noch geladen.');
    }
    function save(change) {
      assertReady();
      const draft = clone(state);
      change(draft);
      const content = JSON.stringify(draft);
      try {
        const result = bridge.saveState(content);
        if (result === false || result && result.ok === false) throw new Error('Speicherfehler');
      } catch (_) {
        storageError = 'Speichern auf dem Gerät fehlgeschlagen. Die letzte Aktion wurde nicht bestätigt. Bitte Speicherplatz prüfen und die App neu öffnen.';
        notify(); throw new Error(storageError);
      }
      state = draft; rawState = content; notify();
    }
    function responseError(result, fallback) {
      const error = new Error(result && result.message || fallback || 'Die Anfrage konnte nicht abgeschlossen werden.');
      error.kind = result && result.kind;
      return error;
    }
    function cleanAccess(value) {
      if (!value || !['unregistered', 'pending', 'approved', 'rejected', 'revoked'].includes(value.status)) return null;
      return { status: value.status, isOwner: value.isOwner === true, canUseApp: value.status === 'approved' && value.canUseApp === true, version: Number.isSafeInteger(value.version) && value.version >= 0 ? value.version : 0, requestedAt: Number.isFinite(value.requestedAt) ? value.requestedAt : null, updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt : null, reviewedAt: Number.isFinite(value.reviewedAt) ? value.reviewedAt : null, reason: typeof value.reason === 'string' ? value.reason.slice(0, 500) : '' };
    }
    function hasAccess() { return !!(auth.authenticated && auth.serverReady === true && auth.accessCheckedAt > 0 && auth.access && auth.access.status === 'approved' && auth.access.canUseApp); }
    function accessReason() {
      const status = auth.access && auth.access.status;
      if (status === 'unregistered') return 'Bitte zuerst deinen Zugang im Browser anfragen. Die Verwaltung muss deine Registrierung freigeben.';
      if (status === 'pending') return 'Deine Registrierung wartet auf die persönliche Freigabe. Neue Discord-Aktionen sind danach verfügbar.';
      if (status === 'rejected') return 'Deine Registrierung wurde abgelehnt. Bitte wende dich bei Rückfragen an die Verwaltung.';
      if (status === 'revoked') return 'Dein Zugang wurde gesperrt. Dein lokaler Verlauf und laufende Dienstzeiten bleiben verfügbar.';
      return 'Der aktuelle Freigabestatus muss zuerst über die App-Verbindung geprüft werden.';
    }
    function clearCatalog() { guilds = []; guildSetup = null; scheduledEvents = []; catalogGeneration++; }
    function recordAccessError(result) {
      if (!result || result.kind !== 'access') return;
      auth.access = cleanAccess(result.access); auth.accessCheckedAt = Date.now();
      clearCatalog(); clearTimeout(queueTimer); notify(); scheduleAccess();
    }
    function recordConnectionError(result) {
      if (!result || !['network', 'unconfigured'].includes(result.kind)) return;
      auth.access = null; auth.accessCheckedAt = 0; auth.serverReady = null;
      auth.message = result.message || 'Die aktuelle App-Verbindung muss erneut geprüft werden.';
      clearCatalog(); clearTimeout(queueTimer); notify(); scheduleAccess();
    }
    async function checked(method, args, fallback) {
      if (typeof bridge[method] !== 'function') throw new Error('Bitte die aktuelle Android-Version der Crazy_Batto Discord App verwenden.');
      let result;
      try { result = await bridge[method].apply(bridge, args || []); }
      catch (_) { throw new Error(fallback || 'Der Verbindungsserver ist gerade nicht erreichbar.'); }
      if (!result || !result.ok) {
        if (result && result.kind === 'auth') { auth.authenticated = false; delete auth.user; guildSetup = null; notify(); }
        recordAccessError(result);
        recordConnectionError(result);
        throw responseError(result, fallback);
      }
      return result;
    }
    async function busyAction(action) {
      work++; notify();
      try { return await action(); } finally { work--; notify(); schedule(); }
    }
    function publicAuth(result) {
      const clean = emptyAuth();
      ['configured', 'origin', 'serverReady', 'authenticated', 'expiresAt', 'message', 'pendingLogin', 'user'].forEach(key => { if (result && result[key] !== undefined) clean[key] = clone(result[key]); });
      clean.access = cleanAccess(result && result.access);
      clean.accessCheckedAt = result && Number.isFinite(result.accessCheckedAt) && result.accessCheckedAt > 0 ? result.accessCheckedAt : 0;
      if (!clean.user || !idOk(clean.user.id)) { clean.authenticated = false; delete clean.user; }
      return clean;
    }
    async function refreshAuth() {
      if (!bridge.native || typeof bridge.backendStatus !== 'function') { auth = emptyAuth(); return; }
      let result;
      try { result = await bridge.backendStatus(); } catch (_) { result = null; }
      if (result && result.ok) { auth = publicAuth(result); accessRetryDelay = auth.accessCheckedAt > 0 ? 15000 : Math.min(60000, accessRetryDelay * 2); }
      else { auth.message = result && result.message || 'Der Verbindungsserver ist gerade nicht erreichbar.'; auth.access = null; auth.accessCheckedAt = 0; auth.serverReady = null; accessRetryDelay = Math.min(60000, accessRetryDelay * 2); }
      if (!hasAccess()) { clearCatalog(); clearTimeout(queueTimer); }
      notify(); scheduleAuth(); scheduleAccess();
    }
    function scheduleAccess() {
      clearTimeout(accessTimer);
      if (disposed || !ready || !bridge.native || !auth.configured || !auth.authenticated || options.autoAuth === false || hasAccess()) return;
      const status = auth.access && auth.access.status;
      if (['unregistered', 'rejected', 'revoked'].includes(status)) return;
      accessTimer = setTimeout(async () => {
        if (disposed) return;
        if (work || queueBusy || authBusy || typeof document !== 'undefined' && document.hidden) { scheduleAccess(); return; }
        try { await refreshAccess(); } catch (_) {} finally { scheduleAccess(); }
      }, status === 'pending' ? 20000 : accessRetryDelay);
    }
    async function refreshAccess() {
      assertReady();
      if (authBusy || queueBusy) throw new Error('Bitte die laufende Verbindung abwarten.');
      return busyAction(async () => {
        const wasAllowed = hasAccess();
        await refreshAuth();
        if (hasAccess() && (!wasAllowed || !guilds.length)) {
          await loadGuilds();
          if (state.selection.guildId) { try { await selectGuild(state.selection.guildId); } catch (error) { auth.message = error.message; } }
        }
        return getSnapshot();
      });
    }
    async function openPortal() {
      assertReady();
      if (!bridge.native || !auth.configured) throw new Error('Bitte zuerst die App-Serveradresse in den Einstellungen hinterlegen.');
      return checked('openPortal', []);
    }
    async function init() {
      if (initializing) return initializing;
      initializing = (async () => {
        try {
          rawState = bridge.loadState() || '';
          state = parseState(rawState);
          ready = true;
          let changed = !rawState || JSON.parse(rawState).version === 1;
          for (const event of state.events) if (event.status === 'sending') { event.status = 'uncertain'; event.error = 'Die App wurde während einer Übertragung beendet. Zuerst den gespeicherten Serverstatus prüfen.'; event.needsStatus = true; event.statusChecked = false; changed = true; }
          const current = clock();
          if (!state.activeId || !state.clockAnchor || state.clockAnchor.bootId !== current.bootId || Number.isFinite(current.elapsedMs) && current.elapsedMs < state.clockAnchor.elapsedMs) { state.clockAnchor = current; changed = true; }
          if (changed) save(() => {});
          if (options.ticker !== false) ticker = setInterval(notify, 1000);
        } catch (_) {
          ready = false;
          storageError = storageError || 'Der gespeicherte Verlauf konnte nicht sicher geöffnet werden. Die Originaldaten bleiben erhalten. Bitte zuerst als JSON exportieren.';
          notify(); return getSnapshot();
        }
        await refreshAuth();
        if (hasAccess()) {
          try { await loadGuilds(); if (state.selection.guildId) await selectGuild(state.selection.guildId); } catch (error) { auth.message = error.message; }
        }
        notify(); schedule(); return getSnapshot();
      })();
      return initializing;
    }
    function scheduleAuth() {
      clearTimeout(authTimer);
      if (disposed || !auth.pendingLogin || options.autoAuth === false) return;
      if (auth.pendingLogin.expiresAt <= Date.now()) { delete auth.pendingLogin; auth.message = 'Die Anmeldung ist abgelaufen. Bitte erneut mit Discord anmelden.'; notify(); return; }
      authTimer = setTimeout(() => pollLogin().catch(() => {}), Math.max(3000, Number(auth.pendingLogin.intervalMs) || 3000));
    }
    async function configureBackend(url) {
      assertReady();
      if (queueBusy || authBusy) throw new Error('Bitte die laufende Verbindung abwarten, bevor du den Verbindungsserver wechselst.');
      return busyAction(async () => {
        const result = await checked('configureBackend', [url]);
        auth = publicAuth(result); guilds = []; guildSetup = null; scheduledEvents = []; catalogGeneration++;
        save(draft => { draft.selection = emptySelection(); });
        await refreshAuth(); return getSnapshot();
      });
    }
    async function login() {
      assertReady();
      return busyAction(async () => { await checked('authBegin', []); await refreshAuth(); return getSnapshot(); });
    }
    async function pollLogin() {
      if (authBusy || disposed) return getSnapshot();
      authBusy = true; notify();
      const wasAuthenticated = auth.authenticated;
      try {
        const result = await checked('authPoll', []);
        await refreshAuth();
        if (!wasAuthenticated && hasAccess()) {
          catalogGeneration++;
          guilds = []; guildSetup = null;
          await loadGuilds();
          if (state.selection.guildId) {
            try { await selectGuild(state.selection.guildId); } catch (error) { auth.message = error.message; }
          }
        }
        return getSnapshot();
      } catch (error) {
        if (error.kind === 'auth') { try { await refreshAuth(); } catch (_) {} }
        auth.message = error.message; throw error;
      }
      finally { authBusy = false; notify(); scheduleAuth(); schedule(); }
    }
    async function cancelLogin() {
      return busyAction(async () => { await checked('authCancel', []); clearTimeout(authTimer); await refreshAuth(); return getSnapshot(); });
    }
    async function logout() {
      return busyAction(async () => {
        await checked('authLogout', []); clearTimeout(authTimer);
        await refreshAuth(); guilds = []; guildSetup = null; scheduledEvents = []; catalogGeneration++;
        return getSnapshot();
      });
    }
    function requireAccount() {
      assertReady();
      if (!bridge.native) throw new Error('Discord-Anmeldung und Versand stehen in der Android-App zur Verfügung.');
      if (!auth.configured) throw new Error('Bitte zuerst den App-Verbindungsserver einrichten.');
      if (!auth.authenticated || !auth.user || !idOk(auth.user.id)) throw new Error('Bitte zuerst mit Discord anmelden.');
      if (!hasAccess()) throw new Error(accessReason());
    }
    async function loadGuilds() {
      requireAccount();
      return busyAction(async () => {
        const generation = catalogGeneration, actor = auth.user.id;
        const result = await checked('guilds', []);
        if (generation === catalogGeneration && auth.user && auth.user.id === actor) guilds = Array.isArray(result.guilds) ? result.guilds : [];
        notify(); return getSnapshot();
      });
    }
    async function selectGuild(guildId) {
      requireAccount();
      if (!idOk(guildId)) throw new Error('Bitte einen gültigen Discord-Server wählen.');
      const generation = ++catalogGeneration;
      return busyAction(async () => {
        const result = await checked('guildSetup', [guildId]);
        if (generation !== catalogGeneration) return getSnapshot();
        if (!result.guild || result.guild.id !== guildId) throw new Error('Der Server hat ein anderes Discord-Ziel zurückgegeben.');
        guildSetup = result; scheduledEvents = [];
        save(draft => {
          const previous = draft.selection;
          const role = (result.roles || []).find(r => r.id === result.moderatorRoleId);
          const channel = previous.guildId === guildId && (result.channels || []).find(c => c.id === previous.channelId);
          draft.selection = Object.assign(emptySelection(), {
            guildId, guildName: result.guild.name, channelId: channel ? channel.id : '', channelName: channel ? channel.name : '',
            moderatorRoleId: role ? role.id : '', moderatorRoleName: role ? role.name : ''
          });
        });
        return getSnapshot();
      });
    }
    async function selectChannel(channelId) {
      requireAccount();
      const channel = guildSetup && (guildSetup.channels || []).find(c => c.id === channelId);
      if (!channel || ![0, 5].includes(channel.type)) throw new Error('Bitte einen verfügbaren Text- oder Ankündigungskanal wählen.');
      save(draft => { draft.selection.channelId = channel.id; draft.selection.channelName = channel.name; });
      return getSnapshot();
    }
    async function setModeratorRole(roleId) {
      requireAccount();
      if (!guildSetup || !guildSetup.canConfigure) throw new Error('Nur die Serververwaltung kann die Moderatorrolle festlegen.');
      if (!idOk(roleId) || roleId === state.selection.guildId || !(guildSetup.roles || []).some(r => r.id === roleId)) throw new Error('Bitte eine Moderatorrolle dieses Servers wählen.');
      return busyAction(async () => {
        const guildId = state.selection.guildId;
        await checked('moderatorRole', [guildId, roleId]);
        return selectGuild(guildId);
      });
    }
    async function installBot() {
      requireAccount();
      if (!state.selection.guildId) throw new Error('Bitte zuerst einen Server wählen.');
      return busyAction(() => checked('botInstall', [state.selection.guildId]));
    }
    async function saveSettings(input) {
      assertReady(); input = input || {};
      const profile = clone(state.profile);
      if (input.team !== undefined) profile.team = line(input.team, 'Team', 80, true) || 'Moderation';
      if (input.theme !== undefined) { if (!['dark', 'light', 'system'].includes(input.theme)) throw new Error('Ungültiges Design.'); profile.theme = input.theme; }
      if (input.accent !== undefined) { if (!['red', 'gold', 'violet', 'blue', 'green'].includes(input.accent) && !/^#[0-9a-fA-F]{6}$/.test(input.accent)) throw new Error('Ungültige Akzentfarbe.'); profile.accent = input.accent; }
      save(draft => { draft.profile = profile; }); return getSnapshot();
    }
    function currentTarget(category, forEvent) {
      requireAccount();
      if (!guildSetup || !guildSetup.botReady || !state.selection.guildId) throw new Error('Bitte einen Server wählen und den Discord-Bot dort einrichten.');
      if (forEvent) {
        if (!guildSetup.canCreateEvents) throw new Error('Deinem Konto oder dem Bot fehlt die Berechtigung zum Erstellen von Discord-Events.');
      } else {
        const channel = (guildSetup.channels || []).find(c => c.id === state.selection.channelId);
        if (!channel) throw new Error('Bitte zuerst einen Discord-Kanal wählen.');
        if (!channel.capabilities || !channel.capabilities[category]) throw new Error(channel.reason || 'Deinem Konto oder dem Bot fehlen die Rechte für diese Kategorie in diesem Kanal.');
        if (category === 'modstempel' && !idOk(state.selection.moderatorRoleId)) throw new Error('Die Serververwaltung muss zuerst die Moderatorrolle festlegen.');
      }
      return Object.assign(clone(state.selection), { origin: auth.origin, actorId: auth.user.id });
    }
    function normalizePost(input, at) {
      input = input || {};
      if (!CATEGORIES[input.category]) throw new Error('Bitte eine Beitragsart auswählen.');
      const data = { title: line(input.title, 'Titel', 120, false), text: text(input.text, 'Nachricht', 1800, true) };
      if (input.startsAt != null && input.startsAt !== '') {
        if (!Number.isSafeInteger(input.startsAt) || input.startsAt <= at || input.startsAt > at + 31 * DAY) throw new Error('Bitte einen zukünftigen Beginn innerhalb der nächsten 31 Tage wählen.');
        data.startsAt = input.startsAt;
      }
      if (input.category === 'stream' || input.category === 'poll') {
        const supplied = input.poll || {};
        const durationHours = Number(supplied.durationHours == null ? 24 : supplied.durationHours);
        if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 168) throw new Error('Die Umfrage-Laufzeit muss 1 bis 168 ganze Stunden betragen.');
        const answers = input.category === 'stream' ? ['Bin dabei', 'Komme später', 'Kann heute nicht'] : supplied.answers;
        if (!Array.isArray(answers) || answers.length < 2 || answers.length > 10) throw new Error('Eine Umfrage braucht 2 bis 10 Antworten.');
        const clean = answers.map(a => line(a, 'Antwort', 55, false));
        if (new Set(clean.map(a => a.toLocaleLowerCase())).size !== clean.length) throw new Error('Die Antworten müssen sich unterscheiden.');
        data.poll = { question: input.category === 'stream' ? 'Wer ist dabei? – ' + data.title : line(supplied.question, 'Umfragefrage', 300, false), answers: clean, durationHours };
      } else if (input.poll) throw new Error('Für diese Beitragsart ist keine Umfrage vorgesehen.');
      return { category: input.category, data, image: base.normalizeRequestImage(input.image) };
    }
    function preparePost(input) {
      const at = now(), normalized = normalizePost(input, at), target = currentTarget(normalized.category, false);
      const operation = { id: uuid(), type: 'post', actorId: target.actorId, guildId: target.guildId, channelId: target.channelId, category: normalized.category, createdAt: at, sendBefore: normalized.data.startsAt || at + (normalized.category === 'stream' ? HOUR : DAY), data: normalized.data };
      if (normalized.category === 'modstempel') operation.moderatorRoleId = target.moderatorRoleId;
      if (normalized.image) operation.image = normalized.image;
      return { operation, target, title: operation.data.title, mentionLabel: normalized.category === 'modstempel' ? '@' + target.moderatorRoleName : '@everyone', messageCount: normalized.image && normalized.data.poll ? 2 : 1, image: normalized.image };
    }
    function prepareEvent(input) {
      input = input || {};
      const at = now(), target = currentTarget(null, true);
      if (!Number.isSafeInteger(input.startsAt) || input.startsAt <= at || input.startsAt > at + 366 * DAY) throw new Error('Bitte einen zukünftigen Eventbeginn innerhalb eines Jahres wählen.');
      if (!Number.isSafeInteger(input.endsAt) || input.endsAt <= input.startsAt) throw new Error('Das Eventende muss nach dem Beginn liegen.');
      const data = { title: line(input.title, 'Eventtitel', 100, false), description: text(input.description, 'Beschreibung', 1000, true), startsAt: input.startsAt, endsAt: input.endsAt, location: line(input.location, 'Ort oder Link', 100, false) };
      return { operation: { id: uuid(), type: 'scheduled_event', actorId: target.actorId, guildId: target.guildId, createdAt: at, sendBefore: data.startsAt, data }, target, title: data.title, mentionLabel: 'Keine zusätzliche Kanal-Erwähnung', messageCount: 0 };
    }
    function newJob(prepared) {
      const op = prepared.operation;
      return { id: op.id, type: op.type, category: op.category || '', title: prepared.title, createdAt: op.createdAt, status: 'pending', stage: op.type === 'scheduled_event' ? 'event' : op.image && op.data.poll ? 'image' : op.data.poll ? 'poll' : 'message', error: '', target: clone(prepared.target), operation: clone(op), submitted: false, nextAttemptAt: 0, attempts: 0 };
    }
    async function submit(prepared) {
      requireAccount();
      if (!prepared || !prepared.operation || !opIdOk(prepared.operation.id) || !prepared.target || prepared.target.origin !== auth.origin || prepared.target.actorId !== auth.user.id || prepared.operation.actorId !== auth.user.id) throw new Error('Das angemeldete Konto oder der Verbindungsserver hat sich geändert. Bitte die Bestätigung neu öffnen.');
      if (!['post', 'scheduled_event'].includes(prepared.operation.type)) throw new Error('Ungültige Beitragsbestätigung.');
      if (state.events.some(e => e.id === prepared.operation.id)) throw new Error('Dieser Auftrag wurde bereits gespeichert.');
      if (prepared.operation.sendBefore <= now()) throw new Error('Der Termin ist inzwischen abgelaufen. Bitte einen neuen Zeitpunkt wählen.');
      save(draft => { draft.events.push(newJob(prepared)); });
      schedule(); return getSnapshot();
    }
    function stamp(draft, session, action, at, note) {
      const totals = base.sessionTotals(session, at), opId = uuid();
      if (!session.target) {
        draft.events.push({ id: opId, type: 'stamp', category: 'modstempel', title: STAMPS[action] + ' · lokal', createdAt: at, status: 'skipped', stage: 'message', error: 'Früherer Dienst lokal fortgesetzt. Kein alter Webhook und kein neues Discord-Ziel verwendet.', operation: null, target: null, legacyLocal: true, sessionId: session.id, note: note || '' });
        return;
      }
      const target = session.target;
      const operation = { id: opId, type: 'stamp', category: 'modstempel', actorId: target.actorId, guildId: target.guildId, channelId: target.channelId, moderatorRoleId: target.moderatorRoleId, createdAt: at, data: { action, at, sessionId: session.id, name: session.profile.name, team: session.profile.team, note: note || '', activeMs: totals.activeMs, pauseMs: totals.pauseMs, totalMs: totals.totalMs, startedAt: session.startedAt } };
      const job = newJob({ operation, target, title: STAMPS[action] });
      job.sessionId = session.id; draft.events.push(job);
    }
    async function start(note) {
      assertReady();
      if (state.activeId) throw new Error('Ein Dienst läuft bereits.');
      const target = currentTarget('modstempel', false), current = clock(), at = Number.isFinite(current.wallMs) ? current.wallMs : now();
      note = text(note, 'Notiz', 280, true);
      save(draft => {
        const profile = { name: auth.user.displayName || auth.user.username, team: target.guildName, discordId: auth.user.id };
        const session = { id: uuid(), profile, target, legacy: false, status: 'active', startedAt: at, endedAt: null, pauses: [], note };
        draft.sessions.push(session); draft.activeId = session.id; draft.clockAnchor = current;
        stamp(draft, session, 'start', at, note);
      });
      schedule(); return getSnapshot();
    }
    async function changeDuty(action, note) {
      assertReady();
      const current = state.sessions.find(s => s.id === state.activeId);
      if (!current) throw new Error('Es läuft kein Dienst.');
      if (action === 'pause' && current.status !== 'active' || action === 'resume' && current.status !== 'paused') throw new Error('Diese Aktion passt nicht zum laufenden Dienst.');
      const at = now(), previous = current.pauses.length ? current.pauses[current.pauses.length - 1].endedAt || current.pauses[current.pauses.length - 1].startedAt : current.startedAt;
      if (at < previous) throw new Error('Die Gerätezeit liegt vor dem letzten Stempel. Bitte die Uhrzeit prüfen.');
      note = text(note, 'Notiz', 280, true);
      save(draft => {
        const session = draft.sessions.find(s => s.id === draft.activeId);
        if (action === 'pause') { session.pauses.push({ startedAt: at, endedAt: null }); session.status = 'paused'; }
        else if (action === 'resume') { session.pauses[session.pauses.length - 1].endedAt = at; session.status = 'active'; }
        else {
          if (session.status === 'paused') session.pauses[session.pauses.length - 1].endedAt = at;
          session.status = 'finished'; session.endedAt = at; session.endNote = note; draft.activeId = null;
        }
        stamp(draft, session, action, at, note);
      });
      schedule(); return getSnapshot();
    }
    function matchesAccount(job) {
      return !!(job.target && auth.authenticated && auth.user && job.target.actorId === auth.user.id && job.target.origin === auth.origin);
    }
    function findJob(id) {
      const job = state.events.find(e => e.id === id);
      if (!job || job.legacyLocal) throw new Error('Dieser Eintrag ist kein neuer Discord-Auftrag.');
      return job;
    }
    function requireJobAccount(job) {
      requireAccount();
      if (!matchesAccount(job)) throw new Error('Bitte mit dem ursprünglichen Konto und Verbindungsserver dieses Auftrags anmelden.');
    }
    function recordResult(id, result, fromStatus) {
      if (result && result.ok && (!result.operation || result.operation.id !== id || !STATUSES.includes(result.operation.status))) result = { ok: false, kind: 'uncertain', message: 'Der Server hat keinen passenden Auftragsstatus geliefert. Bitte den gespeicherten Status prüfen.' };
      if (result && result.kind === 'auth') { auth.authenticated = false; delete auth.user; guildSetup = null; catalogGeneration++; }
      recordAccessError(result);
      recordConnectionError(result);
      save(draft => {
        const job = draft.events.find(e => e.id === id);
        if (result && result.ok && result.operation) {
          const remote = result.operation;
          job.result = clone(remote); job.status = remote.status; job.error = remote.error || ''; job.stage = remote.stage || job.stage; job.submitted = true; job.needsStatus = remote.status === 'sending'; job.statusChecked = false;
          ['imageMessageId', 'imageChannelId', 'messageId', 'channelId', 'eventId', 'url', 'imageUrl', 'poll'].forEach(key => { if (remote[key] !== undefined) job[key] = clone(remote[key]); });
          job.nextAttemptAt = ['pending', 'sending'].includes(remote.status) ? now() + Math.max(1000, Number(remote.retryAfterMs) || 3000) : 0;
        } else {
          const kind = result && result.kind;
          job.error = result && result.message || 'Eine sichere Serverbestätigung fehlt. Bitte zuerst den Auftragsstatus prüfen.';
          if (kind === 'not_found') {
            if (fromStatus && !job.result && !job.imageMessageId && !job.messageId && !job.eventId) {
              job.status = 'pending'; job.submitted = false; job.needsStatus = false; job.nextAttemptAt = now() + 1000;
            } else {
              job.status = 'failed'; job.needsStatus = false; job.nextAttemptAt = 0;
              if (fromStatus) job.error = 'Der zuvor bestätigte Auftrag fehlt auf dem Verbindungsserver. Vorhandene Discord-Bestätigungen bleiben erhalten. Bitte den Serverbetreiber kontaktieren; es wird nichts automatisch neu veröffentlicht.';
            }
          }
          else if (kind === 'rate_limited' || kind === 'network' || kind === 'unconfigured' || kind === 'auth' || kind === 'access') {
            job.status = 'pending'; job.needsStatus = !!job.submitted; job.nextAttemptAt = now() + Math.max(3000, Number(result.retryAfterMs) || 15000);
          } else if (['forbidden', 'validation', 'permanent'].includes(kind)) { job.status = 'failed'; job.needsStatus = false; }
          else { job.status = 'uncertain'; job.needsStatus = true; job.nextAttemptAt = 0; }
        }
      });
    }
    async function rawCall(method, args) {
      try {
        if (typeof bridge[method] !== 'function') return { ok: false, kind: 'unconfigured', message: 'Die native Schnittstelle dieser App ist noch nicht verfügbar.' };
        return await bridge[method].apply(bridge, args);
      } catch (_) { return { ok: false, kind: 'uncertain', message: 'Die Verbindung wurde unterbrochen. Bitte zuerst den gespeicherten Auftragsstatus prüfen.' }; }
    }
    function nextJob() {
      if (!hasAccess()) return null;
      const blocked = new Set(), at = now();
      for (const job of state.events) {
        if (job.legacyLocal || ['sent', 'skipped', 'failed'].includes(job.status) || !matchesAccount(job)) continue;
        const route = job.target.guildId + ':' + (job.target.channelId || 'events');
        if (blocked.has(route)) continue;
        blocked.add(route);
        if (job.status === 'uncertain' && job.needsStatus && !job.statusChecked) return job;
        if (job.status === 'sending' && job.needsStatus && (job.nextAttemptAt || 0) <= at) return job;
        if (job.status === 'pending' && (job.nextAttemptAt || 0) <= at) return job;
      }
      return null;
    }
    function schedule() {
      clearTimeout(queueTimer);
      if (options.autoSync === false || disposed || !ready || storageError || queueBusy || work || !hasAccess()) return;
      const job = nextJob();
      if (job) queueTimer = setTimeout(() => sync().catch(() => {}), 50);
      else {
        const pending = state.events.filter(e => ['pending', 'sending'].includes(e.status) && matchesAccount(e));
        if (pending.length) {
          const next = Math.min.apply(null, pending.map(e => e.nextAttemptAt || now() + 3000));
          queueTimer = setTimeout(() => sync().catch(() => {}), Math.max(1000, Math.min(60000, next - now())));
        }
      }
    }
    async function sync() {
      if (queueBusy || work || authBusy || disposed || !ready || storageError) return getSnapshot();
      if (!hasAccess()) {
        if (!auth.authenticated || !auth.configured) return getSnapshot();
        await refreshAccess();
        if (!hasAccess()) return getSnapshot();
      }
      queueBusy = true; clearTimeout(queueTimer); notify();
      try {
        let job, count = 0;
        while (!disposed && !storageError && (job = nextJob()) && count++ < 30) {
          const id = job.id;
          if (job.submitted && (job.needsStatus || job.status === 'uncertain')) {
            save(draft => { draft.events.find(e => e.id === id).statusChecked = true; });
            const result = await rawCall('operationStatus', [id]);
            recordResult(id, result, true);
            continue;
          }
          if (!job.submitted && job.operation.sendBefore && job.operation.sendBefore <= now()) {
            save(draft => { const e = draft.events.find(e => e.id === id); e.status = 'skipped'; e.error = 'Der geplante Termin oder das Versandfenster ist abgelaufen. Es wurde kein neuer Auftrag veröffentlicht.'; });
            continue;
          }
          const wasSubmitted = job.submitted;
          save(draft => { const e = draft.events.find(e => e.id === id); e.status = 'sending'; e.error = ''; e.submitted = true; e.attempts++; });
          const result = wasSubmitted ? await rawCall('operationRetry', [id, false]) : await rawCall('operationSend', [clone(job.operation), job.operation.image ? job.operation.image.ref : undefined]);
          recordResult(id, result);
        }
      } finally { queueBusy = false; notify(); schedule(); }
      return getSnapshot();
    }
    async function checkOperation(id) {
      const job = findJob(id); requireJobAccount(job);
      if (queueBusy || work || authBusy) throw new Error('Bitte die laufende Verbindung abwarten.');
      return busyAction(async () => { const result = await rawCall('operationStatus', [id]); recordResult(id, result, true); return getSnapshot(); });
    }
    async function retry(id, acknowledgeUncertain) {
      const job = findJob(id); requireJobAccount(job);
      if (!['failed', 'uncertain', 'pending'].includes(job.status)) throw new Error('Dieser Auftrag kann gerade nicht erneut gesendet werden.');
      if (job.status === 'uncertain' && acknowledgeUncertain !== true) throw new Error('Bitte zuerst Discord prüfen und den erneuten Versuch ausdrücklich bestätigen.');
      if (queueBusy || work || authBusy) throw new Error('Bitte die laufende Übertragung abwarten.');
      if (!job.submitted) {
        save(draft => { const e = draft.events.find(e => e.id === id); e.status = 'pending'; e.error = ''; e.nextAttemptAt = 0; e.statusChecked = false; });
        schedule(); return getSnapshot();
      }
      return busyAction(async () => {
        save(draft => { const e = draft.events.find(e => e.id === id); e.status = 'sending'; e.error = ''; e.attempts++; });
        const result = await rawCall('operationRetry', [id, acknowledgeUncertain === true]);
        recordResult(id, result); return getSnapshot();
      });
    }
    async function markHandled(id) {
      const job = findJob(id);
      if (!['pending', 'failed', 'uncertain'].includes(job.status)) throw new Error('Ein laufender oder bestätigter Auftrag kann nicht lokal erledigt werden.');
      save(draft => { const e = draft.events.find(e => e.id === id); e.status = 'skipped'; e.error = 'Lokale Nachverfolgung beendet. Bereits erfolgte Discord-Aktionen bleiben erhalten; das ist keine Sendebestätigung.'; e.needsStatus = false; });
      schedule(); return getSnapshot();
    }
    async function refreshPoll(id) {
      const job = findJob(id); requireJobAccount(job);
      if (queueBusy || work || authBusy) throw new Error('Bitte die laufende Verbindung abwarten.');
      if (job.status !== 'sent' || !job.operation.data.poll) throw new Error('Die Umfrage muss zuerst bestätigt sein.');
      return busyAction(async () => {
        const result = await checked('pollResults', [id]);
        save(draft => { const e = draft.events.find(e => e.id === id); e.poll = result.poll || null; e.pollCheckedAt = now(); });
        return getSnapshot();
      });
    }
    async function openOperation(id, part) {
      const job = findJob(id);
      if (job.eventId && idOk(job.eventId)) return checked('openDiscord', [{ guildId: job.target.guildId, eventId: job.eventId }]);
      const messageId = part === 'image' ? job.imageMessageId : job.messageId;
      const channelId = part === 'image' ? job.imageChannelId : job.channelId || job.target.channelId;
      if (!idOk(messageId) || !idOk(channelId)) throw new Error('Für diese Nachricht liegt noch keine vollständige Discord-Bestätigung vor.');
      return checked('openDiscord', [{ guildId: job.target.guildId, channelId, messageId }]);
    }
    async function loadScheduledEvents() {
      requireAccount();
      if (!state.selection.guildId) throw new Error('Bitte zuerst einen Server wählen.');
      return busyAction(async () => {
        const guildId = state.selection.guildId, result = await checked('scheduledEvents', [guildId]);
        if (state.selection.guildId === guildId) scheduledEvents = Array.isArray(result.events) ? result.events : [];
        return getSnapshot();
      });
    }
    async function openScheduledEvent(eventId) {
      if (!idOk(eventId) || !idOk(state.selection.guildId) || !scheduledEvents.some(e => e.id === eventId)) throw new Error('Dieses Discord-Event wurde nicht gefunden.');
      return checked('openDiscord', [{ guildId: state.selection.guildId, eventId }]);
    }
    async function pickRequestImage() {
      assertReady();
      if (!bridge.native) throw new Error('Bilder kannst du in der Android-App auswählen.');
      if (imageBusy) throw new Error('Die Bildauswahl ist bereits geöffnet.');
      imageBusy = true; notify();
      try {
        const result = await bridge.pickImage();
        if (result && result.kind === 'cancelled') return null;
        if (!result || !result.ok || !result.image) throw responseError(result, 'Das Bild konnte nicht ausgewählt werden.');
        return base.normalizeRequestImage(result.image);
      } finally { imageBusy = false; notify(); }
    }
    async function discardRequestImage(ref) {
      assertReady();
      const local = state.events.some(e => e.operation && e.operation.image && e.operation.image.ref === ref);
      const legacy = state.legacyArchive && state.legacyArchive.events.some(e => e.request && e.request.image && e.request.image.ref === ref);
      if (local || legacy) return { ok: true, retained: true, removed: false };
      return checked('discardImage', [ref]);
    }
    function csvCell(value) {
      let result = String(value == null ? '' : value);
      if (/^[\s]*[=+\-@\t\r]/.test(result)) result = "'" + result;
      return '"' + result.replace(/"/g, '""') + '"';
    }
    async function exportData(format) {
      if (!['csv', 'json'].includes(format)) throw new Error('Unbekanntes Exportformat.');
      if (!rawState && !ready) throw new Error('Der ursprüngliche Verlauf konnte nicht gelesen werden.');
      let content;
      if (format === 'json') content = rawState || JSON.stringify(state);
      else {
        assertReady();
        const rows = [['Name', 'Team', 'Beginn', 'Ende', 'Nettozeit', 'Pausenzeit', 'Status']];
        for (const s of state.sessions) {
          const totals = base.sessionTotals(s, now());
          rows.push([s.profile.name, s.profile.team, new Date(s.startedAt).toISOString(), s.endedAt == null ? '' : new Date(s.endedAt).toISOString(), base.formatDuration(totals.activeMs), base.formatDuration(totals.pauseMs), s.status]);
        }
        content = '\ufeff' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
      }
      return bridge.exportFile('Crazy_Batto-Discord-App-' + new Date(now()).toISOString().slice(0, 10) + '.' + format, format === 'json' ? 'application/json' : 'text/csv', content);
    }
    function dispose() { disposed = true; clearTimeout(queueTimer); clearTimeout(authTimer); clearTimeout(accessTimer); clearInterval(ticker); listeners.clear(); }
    function onResume() {
      if (!ready || disposed) return;
      // Recheck the live approval before a resumed queue can use cached privileges.
      if (!authBusy && !queueBusy && !work) {
        if (auth.pendingLogin) pollLogin().catch(() => {});
        else if (auth.configured && bridge.native) { auth.accessCheckedAt = 0; clearTimeout(queueTimer); refreshAccess().catch(() => {}); }
      }
      notify();
    }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden) onResume(); });
    if (typeof window !== 'undefined') { window.addEventListener('online', onResume); window.addEventListener('modstempel-resume', onResume); }
    return {
      init, getSnapshot, subscribe(fn) { listeners.add(fn); if (ready) fn(getSnapshot()); return () => listeners.delete(fn); }, dispose,
      configureBackend, login, pollLogin, cancelLogin, logout, refreshAccess, openPortal, loadGuilds, selectGuild, selectChannel, setModeratorRole, installBot, saveSettings,
      start, pause: () => changeDuty('pause'), resume: () => changeDuty('resume'), finish: note => changeDuty('finish', note),
      preparePost, prepareEvent, submit, sync, checkOperation, retry, markHandled, refreshPoll, openOperation, loadScheduledEvents, openScheduledEvent,
      pickRequestImage, discardRequestImage, requestImageUrl: base.requestImageUrl, exportData
    };
  }
  return { createApp, parseState, categories: clone(CATEGORIES), formatDuration: base.formatDuration };
}));
