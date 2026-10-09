(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const tabs = ['clock', 'posts', 'events', 'history'];
  const views = tabs.concat('settings');
  const categories = { modstempel: 'Modstempel', stream: 'Stream', big_match: 'BIG Match', general: 'Allgemein', poll: 'Umfrage' };
  const categoryIcons = { modstempel: 'shield-clock', stream: 'megaphone', big_match: 'trophy', general: 'note', poll: 'poll' };
  const statusNames = { pending: 'Wartet auf Versand', sending: 'Wird gesendet', sent: 'In Discord bestätigt', failed: 'Versand fehlgeschlagen', uncertain: 'Zustellung unklar', skipped: 'Lokal erledigt' };
  const stampNames = { start: 'Dienst gestartet', pause: 'Pause begonnen', resume: 'Dienst fortgesetzt', finish: 'Dienst beendet' };
  const accentPresets = { '#c92a38': 'red', '#e7c789': 'gold', '#b8a1f0': 'violet', '#89b4ee': 'blue', '#91c9aa': 'green' };
  const streamAnswers = ['Bin dabei', 'Komme später', 'Kann heute nicht'];
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  const signatures = {};
  let app;
  let snapshot;
  let currentView = 'clock';
  let previousMainView = 'clock';
  let busy = false;
  let postCreating = false;
  let eventCreating = false;
  let imageBusy = false;
  let requestImage = null;
  let settingsDirty = false;
  let appearanceDirty = false;
  let backendDirty = false;
  let roleDirty = false;
  let formAccent = '#C92A38';
  let formTheme = 'dark';
  let pollAnswerSequence = 0;
  let dialogAction = null;
  let dialogBusy = false;
  let dialogReturnFocus = null;
  let toastTimer;
  let scheduledLoadedGuild = '';
  let guildsLoaded = false;

  function setText(id, value) {
    const node = typeof id === 'string' ? $(id) : id;
    const text = String(value == null ? '' : value);
    if (node && node.textContent !== text) node.textContent = text;
  }

  function show(id, visible) { $(id).hidden = !visible; }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function icon(name) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    node.setAttribute('class', 'icon');
    node.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', 'icons.svg#' + name);
    node.append(use);
    return node;
  }

  function cleanError(error) {
    let text = typeof error === 'string' ? error : error && error.message || 'Das hat nicht geklappt. Bitte erneut versuchen.';
    text = String(text).replace(/https?:\/\/[^\s]*\/api(?:\/v\d+)?\/webhooks\/[^\s]+/gi, '[geschützte Verbindung]');
    text = text.replace(/\bBearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [geschützt]');
    return text.slice(0, 1200);
  }

  function errorAt(id, error) {
    setText(id, cleanError(error));
    show(id, true);
  }

  function toast(message, error) {
    clearTimeout(toastTimer);
    setText('toast', message);
    $('toast').classList.toggle('is-error', Boolean(error));
    show('toast', true);
    toastTimer = window.setTimeout(() => show('toast', false), error ? 7000 : 4200);
  }

  function date(value) {
    if (value === null || value === undefined || value === '') return null;
    const result = new Date(value);
    return Number.isNaN(result.getTime()) ? null : result;
  }

  function time(value) { const d = date(value); return d ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–'; }
  function day(value) { const d = date(value); return d ? d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–'; }
  function dateTime(value) { return day(value) + ' · ' + time(value) + ' Uhr'; }
  function duration(value) {
    const s = Math.floor(Math.max(0, Number(value) || 0) / 1000);
    return [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(x => String(x).padStart(2, '0')).join(':');
  }
  function shortDuration(value) {
    const m = Math.floor(Math.max(0, Number(value) || 0) / 60000);
    return m < 60 ? m + ' Min.' : Math.floor(m / 60) + ' Std.' + (m % 60 ? ' ' + m % 60 + ' Min.' : '');
  }
  function timezone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Gerätezeit'; }
    catch (_) { return 'Gerätezeit'; }
  }
  function native() { return Boolean(snapshot && snapshot.platform && snapshot.platform.native); }
  function auth() { return snapshot && snapshot.auth || {}; }
  function selection() { return snapshot && snapshot.selection || {}; }
  function setup() { return snapshot && snapshot.guildSetup || null; }
  function localLocked() { return busy || dialogBusy || !snapshot || !snapshot.ready || Boolean(snapshot.storageError); }
  function remoteLocked() { return localLocked() || Boolean(snapshot && snapshot.networkBusy); }
  function accessGranted() { const a = auth(); return !!(a.authenticated && a.serverReady === true && a.accessCheckedAt > 0 && a.access && a.access.status === 'approved' && a.access.canUseApp === true); }
  function canContact() { return native() && auth().configured && accessGranted(); }
  function accessCopy() {
    const status = auth().access && auth().access.status;
    return {
      unregistered: ['Dein Zugang zur Discord-App', 'Melde dich im Browser mit diesem Discord-Konto an und sende deine Anfrage. Danach entscheidet die Verwaltung über deinen Zugang.', 'Noch nicht angefragt'],
      pending: ['Deine Anfrage wird geprüft', 'Deine Registrierung ist eingegangen. Du erhältst Zugang, sobald sie persönlich freigegeben wurde.', 'Wartet auf Freigabe'],
      approved: accessGranted() ? ['Dein Zugang ist freigegeben', 'Du kannst die Crazy_Batto Discord App mit diesem Discord-Konto verwenden.', 'Freigegeben'] : ['Verbindung prüfen', 'Deine Freigabe muss zuerst erneut über die App-Verbindung bestätigt werden.', 'Status nicht bestätigt'],
      rejected: ['Deine Anfrage wurde abgelehnt', 'Für dieses Discord-Konto ist der Zugang derzeit nicht freigegeben. Bei Rückfragen wende dich an die Verwaltung.', 'Abgelehnt'],
      revoked: ['Dein Zugang wurde gesperrt', 'Neue Discord-Aktionen sind gesperrt. Dein lokaler Verlauf und laufende Dienstzeiten bleiben verfügbar.', 'Gesperrt']
    }[status] || ['Verbindung prüfen', 'Der aktuelle Freigabestatus ist nicht verfügbar. Prüfe deine Verbindung und frage den Status erneut ab.', 'Status nicht bestätigt'];
  }
  function category() { return $('post-category').value; }
  function usesPoll(value) { return value === 'stream' || value === 'poll'; }
  function roleLabel(target) { return target && target.moderatorRoleName ? '@' + target.moderatorRoleName.replace(/^@/, '') : 'Moderatorrolle noch nicht eingerichtet'; }
  function resetScheduledView() { scheduledLoadedGuild = ''; show('scheduled-error', false); }
  function resolveAccent(accent) {
    if (/^#[0-9a-f]{6}$/i.test(accent || '')) return accent;
    return Object.keys(accentPresets).find(color => accentPresets[color] === accent) || '#C92A38';
  }

  function setupReason(kind) {
    if (!snapshot || !snapshot.ready) return 'Crazy_Batto Discord App wird geladen …';
    if (snapshot.storageError) return 'Deine Daten müssen zuerst wieder sicher gespeichert werden können.';
    if (!native()) return 'Anmeldung und Discord-Versand sind in der Android-App verfügbar.';
    const a = auth();
    if (!a.configured) return 'Bitte zuerst die App-Verbindung in den Einstellungen einrichten.';
    if (a.serverReady === false) return 'Auf dem App-Server fehlt noch die Discord-Einrichtung.';
    if (!a.authenticated) return a.pendingLogin ? 'Bitte die Discord-Anmeldung im Browser abschließen.' : 'Bitte zuerst mit Discord anmelden.';
    if (!accessGranted()) return accessCopy()[1];
    if (a.serverReady !== true) return 'Die App-Verbindung muss zuerst erfolgreich geprüft werden.';
    const target = selection();
    const s = setup();
    if (!target.guildId || !s || !s.guild || s.guild.id !== target.guildId) return 'Bitte zuerst einen Discord-Server auswählen.';
    if (!s.botReady) return 'Der Discord-Bot ist auf diesem Server noch nicht bereit.';
    if (kind === 'scheduled_event') return s.canCreateEvents ? '' : 'Du oder der Bot habt keine Berechtigung, hier Discord-Events zu erstellen.';
    if (kind === 'modstempel' && !target.moderatorRoleId) return 'Bitte zuerst die Moderatorrolle für diesen Server einrichten.';
    if (!target.channelId) return 'Bitte zuerst einen Discord-Kanal auswählen.';
    const channel = (s.channels || []).find(item => item.id === target.channelId);
    if (!channel) return 'Der ausgewählte Kanal ist nicht mehr verfügbar. Bitte ein anderes Ziel wählen.';
    if (!channel.capabilities || !channel.capabilities[kind]) return channel.reason || 'Für „' + (categories[kind] || kind) + ' fehlen in diesem Kanal Berechtigungen.';
    return '';
  }

  function applyAppearance(accent, theme) {
    const value = resolveAccent(accent);
    const resolved = theme === 'system' ? (systemTheme.matches ? 'dark' : 'light') : theme;
    const root = document.documentElement;
    root.dataset.theme = resolved === 'light' ? 'light' : 'dark';
    root.dataset.accent = accentPresets[value.toLowerCase()] || 'custom';
    root.style.setProperty('--accent', value);
    const channels = [1, 3, 5].map(offset => parseInt(value.slice(offset, offset + 2), 16) / 255).map(part => part <= .04045 ? part / 12.92 : Math.pow((part + .055) / 1.055, 2.4));
    root.style.setProperty('--on-accent', .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2] > .179 ? '#171a20' : '#ffffff');
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#0e0f12');
  }

  function setView(view, options) {
    if (!views.includes(view)) return;
    if (tabs.includes(view)) previousMainView = view;
    currentView = view;
    views.forEach(item => show('view-' + item, item === view));
    tabs.forEach(item => {
      const active = item === view;
      const tab = $('nav-' + item);
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active || view === 'settings' && item === previousMainView ? 0 : -1;
    });
    if (view === 'settings') $('open-settings').setAttribute('aria-current', 'page');
    else $('open-settings').removeAttribute('aria-current');
    if (snapshot) renderAccess();
    if (!(options && options.preserveScroll)) window.scrollTo({ top: 0, behavior: 'auto' });
    if (options && options.focus) $('view-' + view).focus({ preventScroll: true });
  }

  function targetSummary(id, target, kind) {
    const node = $(id);
    const signature = JSON.stringify([target, kind]);
    if (node.dataset.signature === signature) return;
    node.dataset.signature = signature;
    node.replaceChildren();
    if (!target || !target.guildId) {
      node.append(element('strong', '', 'Noch kein Discord-Ziel'), element('span', '', 'Server und Kanal in den Einstellungen auswählen.'));
      return;
    }
    node.append(element('strong', '', target.guildName || 'Discord-Server'));
    if (kind !== 'scheduled_event') node.append(element('span', '', target.channelName ? '#' + target.channelName : 'Noch kein Kanal ausgewählt'));
    node.append(element('span', 'target-audience', kind === 'scheduled_event' ? 'Server-Event · ohne zusätzlichen Kanalpost' : 'Erwähnung: ' + (kind === 'modstempel' ? roleLabel(target) : '@everyone')));
  }

  function fillSettings(state) {
    const profile = state.profile || {};
    $('setting-team').value = profile.team || '';
    formAccent = resolveAccent(profile.accent);
    formTheme = ['dark', 'light', 'system'].includes(profile.theme) ? profile.theme : 'dark';
    $('setting-custom-color').value = formAccent;
    document.querySelectorAll('[name="accent-choice"]').forEach(input => { input.checked = input.value.toLowerCase() === formAccent.toLowerCase(); });
    document.querySelectorAll('[name="theme"]').forEach(input => { input.checked = input.value === formTheme; });
    settingsDirty = false;
    appearanceDirty = false;
    signatures.profile = JSON.stringify(profile);
  }

  function setOptions(id, rows, value, placeholder) {
    const select = $(id);
    const signature = JSON.stringify([rows, placeholder]);
    if (select.dataset.options !== signature) {
      select.dataset.options = signature;
      const first = element('option', '', placeholder);
      first.value = '';
      select.replaceChildren(first, ...rows.map(row => {
        const option = element('option', '', row.label);
        option.value = row.id;
        option.disabled = Boolean(row.disabled);
        return option;
      }));
    }
    if (value !== undefined && select.value !== value) select.value = value || '';
  }

  function renderSettings() {
    const a = auth();
    const selected = selection();
    const s = setup();
    const locked = remoteLocked();
    if (!backendDirty && $('backend-url').value !== (a.origin || '')) $('backend-url').value = a.origin || '';
    $('backend-url').disabled = busy || dialogBusy;
    $('save-backend').disabled = localLocked() || !native();
    let backendStatus = 'Noch keine App-Verbindung eingerichtet.';
    if (a.configured) backendStatus = a.serverReady === true ? 'App-Server erreichbar · Discord-Anmeldung eingerichtet.' : a.serverReady === false ? 'App-Server erreichbar · Discord ist dort noch nicht eingerichtet.' : 'Adresse gespeichert · Erreichbarkeit noch nicht bestätigt.';
    if (!native()) backendStatus = 'Vorschau: Die echte Verbindung richtest du in der Android-App ein.';
    if (a.message) backendStatus += '\n' + cleanError(a.message);
    setText('backend-status', backendStatus);
    $('backend-status').className = 'connection-status' + (a.serverReady === true ? ' is-success' : a.serverReady === false ? ' is-error' : '');
    const accountSignature = JSON.stringify([a.authenticated, a.user]);
    if (signatures.account !== accountSignature) {
      signatures.account = accountSignature;
      const account = $('account-summary');
      account.replaceChildren();
      if (a.authenticated && a.user) account.append(element('strong', '', a.user.displayName || a.user.username || 'Discord-Konto'), element('span', '', a.user.username ? '@' + a.user.username : ''), element('span', 'verified-label', 'Über Discord angemeldet'));
    }
    const pending = a.pendingLogin;
    show('login-pending', Boolean(pending));
    show('login-discord', !a.authenticated && !pending);
    show('logout-discord', Boolean(a.authenticated));
    $('login-discord').disabled = locked || !native() || !a.configured || a.serverReady !== true;
    $('logout-discord').disabled = locked;
    $('poll-login').disabled = locked || !native();
    $('cancel-login').disabled = localLocked() || !native();
    if (pending) {
      setText('login-code', pending.displayCode || '–');
      const remaining = date(pending.expiresAt) ? date(pending.expiresAt).getTime() - (snapshot.now || Date.now()) : null;
      setText('login-expiry', remaining !== null && remaining <= 0 ? 'Anmeldung abgelaufen. Bitte abbrechen und erneut anmelden.' : 'Gültig bis ' + time(pending.expiresAt) + ' Uhr. Die App prüft den Abschluss automatisch.');
    }
    setText('auth-status', a.authenticated ? 'Deine bestätigte Discord-Identität wird für neue Beiträge und Dienste verwendet.' : pending ? 'Schließe die Anmeldung im geöffneten Browser bei Discord ab. Das Öffnen der Seite allein meldet dich noch nicht an.' : 'Die Anmeldung öffnet Discord in deinem Browser.');
    $('reload-guilds').disabled = locked || !canContact();
    const guildRows = (snapshot.guilds || []).map(guild => ({ id: guild.id, label: guild.name + (!guild.botReady ? ' · Bot fehlt' : '') }));
    setOptions('guild-select', guildRows, selected.guildId, !a.authenticated ? 'Zuerst mit Discord anmelden' : !accessGranted() ? 'Nach der Freigabe verfügbar' : 'Discord-Server auswählen');
    $('guild-select').disabled = locked || !canContact() || !guildRows.length;
    setText('guild-help', !a.authenticated ? 'Nach Anmeldung und Freigabe kannst du deine Server laden.' : !accessGranted() ? accessCopy()[1] : guildRows.length ? 'Die Auswahl lädt Kanäle und Berechtigungen dieses Servers.' : guildsLoaded ? 'Keine verfügbaren Server gefunden. Prüfe deine Discord-Mitgliedschaften und lade die Liste erneut.' : 'Lade deine Discord-Server, um ein Ziel auszuwählen.');
    const validSetup = s && s.guild && s.guild.id === selected.guildId;
    show('guild-setup', Boolean(validSetup));
    if (validSetup) {
      setText('bot-status', s.botReady ? 'Discord-Bot auf diesem Server verfügbar.' : 'Der Discord-Bot ist auf diesem Server noch nicht bereit.');
      $('bot-status').className = 'connection-status' + (s.botReady ? ' is-success' : '');
      show('install-bot', !s.botReady && Boolean(s.canConfigure));
      $('install-bot').disabled = locked || !canContact();
      $('reload-setup').disabled = locked || !canContact();
      const channelRows = (s.channels || []).map(channel => ({ id: channel.id, label: '#' + channel.name + (!Object.values(channel.capabilities || {}).some(Boolean) ? ' · keine Versandberechtigung' : ''), disabled: !Object.values(channel.capabilities || {}).some(Boolean) }));
      setOptions('channel-select', channelRows, selected.channelId, 'Kanal auswählen');
      $('channel-select').disabled = locked || !canContact() || !s.botReady || !channelRows.length;
      const currentChannel = (s.channels || []).find(channel => channel.id === selected.channelId);
      const allowed = currentChannel ? Object.keys(categories).filter(key => currentChannel.capabilities && currentChannel.capabilities[key]).map(key => categories[key]) : [];
      setText('channel-help', currentChannel ? (allowed.length ? 'Möglich: ' + allowed.join(', ') + '.' : currentChannel.reason || 'Hier fehlen Versandberechtigungen.') : channelRows.length ? 'Der Kanal gilt für neue Beiträge und neue Dienste.' : 'Keine nutzbaren Kanäle gefunden. Die Rechte von dir und dem Bot müssen passen.');
      const roleRows = (s.roles || []).filter(role => role.id !== s.guild.id).map(role => ({ id: role.id, label: '@' + role.name }));
      const currentRoleValue = roleDirty ? $('role-select').value : selected.moderatorRoleId || s.moderatorRoleId || '';
      setOptions('role-select', roleRows, currentRoleValue, 'Moderatorrolle auswählen');
      $('role-select').disabled = locked || !canContact() || !s.canConfigure || !s.botReady;
      show('save-role', Boolean(s.canConfigure));
      $('save-role').disabled = locked || !canContact() || !s.canConfigure || !s.botReady || !$('role-select').value;
      setText('role-help', s.canConfigure ? 'Die gespeicherte Rolle gilt für Modstempel auf diesem Server. Die Änderung betrifft auch dein Team.' : 'Nur eine Person mit Serververwaltungsrechten kann die Moderatorrolle ändern.' + (!s.moderatorRoleId ? ' Bitte die Serververwaltung um die Einrichtung.' : ''));
      setText('events-capability', s.canCreateEvents ? 'Discord-Events können auf diesem Server erstellt werden.' : 'Die Berechtigung zum Erstellen von Discord-Events fehlt dir oder dem Bot.');
    }
    setText('selection-status', selected.guildId ? (selected.guildName || 'Discord-Server') + (selected.channelName ? ' · #' + selected.channelName : ' · noch kein Kanal') + (selected.moderatorRoleName ? '\nModeratorrolle: ' + roleLabel(selected) : '') : 'Noch kein Ziel gespeichert.');
    $('save-settings').disabled = localLocked();
    if (!settingsDirty && signatures.profile !== JSON.stringify(snapshot.profile || {})) fillSettings(snapshot);
  }

  function renderAccess() {
    const a = auth();
    const visible = native() && a.configured && a.authenticated && (!accessGranted() || currentView === 'settings');
    show('access-panel', visible);
    document.querySelector('.app-shell').classList.toggle('has-access-gate', Boolean(visible && !accessGranted() && currentView === 'clock' && !snapshot.activeSession));
    if (!visible) return;
    const copy = accessCopy();
    setText('access-title', copy[0]); setText('access-copy', copy[1]); setText('access-state', copy[2]);
    setText('access-name', a.user && (a.user.displayName || a.user.username) || 'Dein Discord-Konto');
    $('access-icon').setAttribute('href', 'icons.svg#' + (accessGranted() ? 'check' : a.access && ['rejected', 'revoked'].includes(a.access.status) ? 'warning' : 'clock'));
    const reason = a.access && a.access.reason;
    show('access-reason', Boolean(reason)); setText('access-reason', reason || '');
    $('refresh-access').disabled = remoteLocked();
    $('open-access-portal').disabled = localLocked();
    setText('open-access-portal', a.access && a.access.status === 'unregistered' ? 'Zugang im Browser anfragen' : 'Zugang im Browser öffnen');
  }

  function renderClock() {
    const active = snapshot.activeSession;
    const a = auth();
    const selected = selection();
    const person = active ? active.name : a.authenticated && a.user ? a.user.displayName || a.user.username : snapshot.profile && snapshot.profile.name;
    setText('profile-name', person || 'Dein Moderatorprofil');
    setText('profile-team', active ? (active.team || 'Dein laufender Dienst') : a.authenticated ? (selected.guildName || 'Discord-Server auswählen') : 'Mit Discord anmelden');
    setText('duty-status', active ? active.status === 'paused' ? 'Du bist in der Pause' : 'Dein Dienst läuft' : 'Bereit für deinen Dienst');
    setText('duty-timer', duration(active ? active.activeMs : 0));
    $('duty-timer').classList.toggle('timer-long', Boolean(active && active.activeMs >= 360000000));
    setText('timer-caption', active ? 'Seit ' + time(active.startedAt) + ' Uhr · Nettozeit' : 'Deine Dienstzeit');
    setText('timer-footnote', active ? 'Pause: ' + duration(active.pauseMs) : a.authenticated && !accessGranted() ? 'Nach deiner Freigabe verfügbar.' : 'Pausen werden separat erfasst.');
    $('duty-dot').classList.toggle('is-active', Boolean(active && active.status === 'active'));
    $('duty-dot').classList.toggle('is-paused', Boolean(active && active.status === 'paused'));
    show('start-duty', !active);
    show('active-actions', Boolean(active));
    $('start-duty').disabled = localLocked() || Boolean(setupReason('modstempel'));
    $('pause-duty').disabled = localLocked();
    $('finish-duty').disabled = localLocked();
    setText('pause-label', active && active.status === 'paused' ? 'Fortsetzen' : 'Pause');
    $('pause-icon').setAttribute('href', 'icons.svg#' + (active && active.status === 'paused' ? 'play' : 'pause'));
    setText('start-help', active ? active.legacy ? '' : 'Dieser Dienst bleibt mit seinem ursprünglichen Discord-Ziel verbunden.' : setupReason('modstempel') || 'Stempelmeldungen erwähnen ausschließlich die ausgewählte Moderatorrolle.');
    show('legacy-duty-notice', Boolean(active && active.legacy));
    show('clock-target', !(active && active.legacy));
    targetSummary('clock-target', active && active.target || selected, 'modstempel');
    setText('today-net', shortDuration(snapshot.totals && snapshot.totals.todayMs));
    setText('today-pause', shortDuration(snapshot.totals && snapshot.totals.todayPauseMs));
    let connectionTitle = 'Discord einrichten';
    let connectionDetail = setupReason('modstempel');
    if (a.pendingLogin) connectionTitle = 'Anmeldung läuft';
    else if (a.authenticated) connectionTitle = a.serverReady === true ? 'Mit Discord angemeldet' : 'App-Verbindung prüfen';
    if (!connectionDetail) connectionDetail = (selected.guildName || 'Discord-Server') + ' · #' + selected.channelName;
    setText('connection-title', connectionTitle);
    setText('connection-detail', connectionDetail);
    document.querySelector('.connection-row').classList.toggle('is-verified', Boolean(a.authenticated && a.serverReady === true));
  }

  function imageDescription(image) {
    const parts = [image.mime === 'image/png' ? 'PNG' : image.mime === 'image/webp' ? 'WebP' : 'JPG'];
    if (image.width && image.height) parts.push(image.width + ' × ' + image.height + ' px');
    if (image.size > 0) {
      const mb = image.size / (1024 * 1024);
      parts.push(mb >= 1 ? mb.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' MB' : Math.max(1, Math.round(image.size / 1024)) + ' KB');
    }
    return parts.join(' · ');
  }

  function renderImage() {
    const picking = imageBusy || snapshot.imageBusy;
    const locked = localLocked() || picking || postCreating || !native();
    ['request-image-choose', 'request-image-replace', 'request-image-remove'].forEach(id => { $(id).disabled = Boolean(locked); });
    show('request-image-choose', !requestImage);
    show('request-image-selected', Boolean(requestImage));
    show('request-image-status', Boolean(picking));
    $('request-image-selected').setAttribute('aria-busy', String(Boolean(picking)));
    setText('request-image-source-label', native() ? 'Aus deiner Galerie' : 'In der Android-App verfügbar');
    setText('request-image-help', native() ? 'JPG, PNG oder WebP · bis 8 MB.' + (usesPoll(category()) ? ' Mit Bild: zuerst Bild und Details, danach die Umfrage als zweite Nachricht.' : '') : 'Vorschau: Bilder wählst du in der Android-App aus.');
    if (requestImage) {
      const url = app.requestImageUrl(requestImage);
      if ($('request-image-preview').getAttribute('src') !== url) $('request-image-preview').src = url;
      setText('request-image-meta', imageDescription(requestImage));
    } else {
      $('request-image-preview').removeAttribute('src');
      setText('request-image-meta', '');
    }
  }

  function renderComposer() {
    const kind = category();
    const withPoll = usesPoll(kind);
    const disabled = postCreating || imageBusy || Boolean(snapshot.imageBusy);
    show('post-start-group', kind === 'stream' || kind === 'big_match');
    $('post-start').disabled = !(kind === 'stream' || kind === 'big_match');
    setText('post-start-label', kind === 'big_match' ? 'Geplanter Beginn' : 'Geplanter Streamstart');
    show('stream-poll-group', kind === 'stream');
    show('custom-poll-group', kind === 'poll');
    show('poll-duration-group', withPoll);
    $('poll-question').disabled = kind !== 'poll';
    $('poll-question').required = kind === 'poll';
    $('poll-duration').disabled = !withPoll;
    $('poll-duration').required = withPoll;
    $('poll-answers').querySelectorAll('input').forEach(input => { input.disabled = kind !== 'poll'; input.required = kind === 'poll'; });
    $('post-fields').disabled = disabled;
    $('post-submit').disabled = localLocked() || disabled || Boolean(setupReason(kind));
    const audience = kind === 'modstempel' ? roleLabel(selection()) : '@everyone';
    setText('post-audience', 'Erwähnung: ' + audience);
    setText('post-category-help', kind === 'modstempel' ? 'Für dein Moderatorenteam. Die Kanalrechte bestimmen, wer den Beitrag sehen kann.' : kind === 'stream' ? 'Mit Teilnahme-Umfrage für deinen Stream. @everyone wird einmal erwähnt.' : kind === 'poll' ? 'Eine eigene Umfrage mit deinen Antwortmöglichkeiten. @everyone wird einmal erwähnt.' : 'Ein Beitrag für deine Community mit einer @everyone-Erwähnung.');
    targetSummary('post-target', selection(), kind);
    const help = setupReason(kind) || (withPoll && requestImage ? 'Du prüfst 2 zusammengehörige Nachrichten. Nur die erste erwähnt ' + audience + '.' : 'Vor dem Senden prüfst du Inhalt, Ziel und Erwähnung.');
    setText('post-publish-help', help);
    $('add-poll-answer').disabled = disabled || $('poll-answers').children.length >= 10;
    $('poll-answers').querySelectorAll('button').forEach(button => { button.disabled = disabled || $('poll-answers').children.length <= 2; });
    renderImage();
  }

  function renderEventForm() {
    targetSummary('event-target', selection(), 'scheduled_event');
    $('event-fields').disabled = eventCreating;
    $('event-submit').disabled = localLocked() || eventCreating || Boolean(setupReason('scheduled_event'));
    setText('event-publish-help', setupReason('scheduled_event') || 'Ein echtes Discord-Event. Keine zusätzliche Kanalnachricht und kein @everyone-Ping.');
    $('load-scheduled-events').disabled = remoteLocked() || !canContact() || !selection().guildId || !setup() || !setup().botReady;
    const events = snapshot.scheduledEvents || [];
    const loaded = scheduledLoadedGuild === selection().guildId && Boolean(selection().guildId);
    setText('scheduled-status', !selection().guildId ? 'Wähle zuerst deinen Discord-Server aus.' : events.length ? events.length + (events.length === 1 ? ' Event vom Server geladen.' : ' Events vom Server geladen.') : loaded ? 'Auf diesem Server wurden keine Events gefunden.' : 'Lade die aktuellen Events dieses Discord-Servers.');
    setText('load-scheduled-events', loaded ? 'Aktualisieren' : 'Laden');
  }

  function control(label, action, id, symbol, part) {
    const button = element('button', 'small-button');
    button.type = 'button';
    button.dataset.action = action;
    if (id) button.dataset.id = id;
    if (part) button.dataset.part = part;
    if (symbol) button.append(icon(symbol));
    button.append(document.createTextNode(label));
    return button;
  }

  function operationData(entry) { return entry.operation && entry.operation.data || {}; }
  function operationImage(entry) { return entry.operation && entry.operation.image || null; }
  function confirmedImage(entry) { return Boolean(entry.imageMessageId || entry.result && entry.result.imageMessageId); }
  function splitPost(entry) { return entry.type === 'post' && Boolean(operationImage(entry)) && Boolean(operationData(entry).poll); }
  function operationTitle(entry) { return entry.title || operationData(entry).title || stampNames[operationData(entry).action] || 'Discord-Aktivität'; }

  function statusLabel(entry) {
    let text = statusNames[entry.status] || 'Status noch nicht bekannt';
    if (entry.legacyLocal) text = 'Lokal gespeichert · kein Discord-Versand';
    else if (entry.type === 'scheduled_event') text = { pending: 'Wartet auf Erstellung', sending: 'Event wird erstellt', sent: 'Event in Discord erstellt', failed: 'Event-Erstellung fehlgeschlagen', uncertain: 'Event-Erstellung unklar', skipped: 'Lokal erledigt' }[entry.status] || text;
    else if (splitPost(entry)) {
      if (confirmedImage(entry)) text = { pending: 'Bild bestätigt · Umfrage wartet', sending: 'Bild bestätigt · Umfrage wird gesendet', sent: 'Bild und Umfrage bestätigt', failed: 'Bild bestätigt · Umfrage fehlgeschlagen', uncertain: 'Bild bestätigt · Umfrage unklar', skipped: 'Bild bestätigt · Umfrage lokal erledigt' }[entry.status] || text;
      else text = { pending: 'Bild wartet auf Versand', sending: 'Bild wird gesendet', failed: 'Bildversand fehlgeschlagen', uncertain: 'Bildzustellung unklar' }[entry.status] || text;
    }
    const node = element('div', 'delivery-label' + (entry.status === 'sent' && !entry.legacyLocal ? ' is-sent' : entry.status === 'failed' ? ' is-error' : entry.status === 'uncertain' ? ' is-warning' : ''));
    node.append(icon(entry.status === 'sent' ? 'check' : ['failed', 'uncertain'].includes(entry.status) ? 'warning' : 'clock'), element('span', '', text));
    return node;
  }

  function deliverySteps(entry) {
    if (!splitPost(entry)) return null;
    const list = element('dl', 'request-delivery-steps');
    const short = { pending: 'Wartet auf Versand', sending: 'Wird gesendet', sent: 'Bestätigt', failed: 'Fehlgeschlagen', uncertain: 'Zustellung unklar', skipped: 'Lokal erledigt' };
    const image = confirmedImage(entry);
    [['Bild und Details', image ? 'Bestätigt' : short[entry.status] || 'Noch nicht bestätigt'], ['Umfrage', image ? short[entry.status] || 'Noch nicht bestätigt' : 'Noch nicht gesendet']].forEach(([label, value]) => {
      const row = element('div', 'request-delivery-step');
      row.append(element('dt', '', label), element('dd', value === 'Bestätigt' ? 'is-confirmed' : ['Fehlgeschlagen', 'Zustellung unklar'].includes(value) ? 'is-warning' : '', value));
      list.append(row);
    });
    return list;
  }

  function pollResults(entry) {
    if (!operationData(entry).poll || entry.status !== 'sent') return null;
    const section = element('section', 'request-results');
    section.append(element('h5', 'request-results-title', 'Antworten in Discord'));
    const poll = entry.poll || entry.result && entry.result.poll;
    if (poll && poll.stale === true) section.append(element('p', 'poll-stale', 'Gespeicherte Ergebnisse · Die Aktualisierung ist fehlgeschlagen. Die Zahlen können inzwischen abweichen.'));
    if (poll && date(poll.updatedAt)) section.append(element('p', 'field-help', 'Ergebnisstand: ' + dateTime(poll.updatedAt)));
    else if (date(entry.pollCheckedAt)) section.append(element('p', 'field-help', 'Zuletzt abgefragt: ' + dateTime(entry.pollCheckedAt)));
    if (!poll || !Array.isArray(poll.answers) || !poll.answers.length) {
      section.append(element('p', 'request-no-results', 'Noch keine Ergebnisse geladen. Unbekannte Zahlen werden nicht als 0 angezeigt.'));
      return section;
    }
    const counts = poll.results && Array.isArray(poll.results.answer_counts) ? poll.results.answer_counts : [];
    const list = element('dl', 'request-results-list');
    poll.answers.forEach(answer => {
      const id = answer.answer_id !== undefined ? answer.answer_id : answer.id;
      const count = counts.find(item => String(item.id !== undefined ? item.id : item.answer_id) === String(id));
      const known = count && Number.isFinite(count.count) && count.count >= 0;
      const title = answer.poll_media && answer.poll_media.text || answer.text || 'Antwort';
      const row = element('div', 'request-result-row');
      row.append(element('dt', '', title), element('dd', '', known ? String(count.count) : '–'));
      list.append(row);
    });
    section.append(list, element('p', 'field-help', '„–“ bedeutet: Anzahl noch nicht bekannt. Namen und Antworten kannst du in Discord ansehen.'));
    return section;
  }

  function operationControls(entry) {
    const controls = element('div', 'request-controls');
    if (entry.legacyLocal || !entry.operation) return controls;
    const canRemote = canContact() && !remoteLocked();
    if (confirmedImage(entry)) controls.append(control('Bild in Discord öffnen', 'open-operation', entry.id, 'external', 'image'));
    const finalId = entry.type === 'scheduled_event' ? entry.eventId || entry.result && entry.result.eventId : entry.messageId || entry.result && entry.result.messageId;
    if (entry.status === 'sent' && finalId) controls.append(control(entry.type === 'scheduled_event' ? 'Event in Discord öffnen' : 'In Discord öffnen', 'open-operation', entry.id, 'external'));
    if (entry.status === 'sent' && operationData(entry).poll) controls.append(control('Ergebnis aktualisieren', 'refresh-poll', entry.id, 'refresh'));
    if (entry.submitted && ['pending', 'sending', 'uncertain', 'failed'].includes(entry.status)) controls.append(control('Status prüfen', 'check-operation', entry.id, 'refresh'));
    if (['failed', 'uncertain'].includes(entry.status)) {
      controls.append(control(confirmedImage(entry) && splitPost(entry) ? 'Umfrage erneut senden' : entry.type === 'scheduled_event' ? 'Erneut erstellen' : 'Erneut senden', 'retry-operation', entry.id, 'refresh'));
      controls.append(control('Lokal erledigen', 'handle-operation', entry.id, 'check'));
    }
    controls.querySelectorAll('button').forEach(button => { button.disabled = button.dataset.action === 'handle-operation' ? localLocked() : button.dataset.action === 'open-operation' ? localLocked() || !native() : !canRemote; });
    return controls;
  }

  function operationCard(entry) {
    const card = element('li', 'request-card');
    card.dataset.operationId = entry.id;
    card.tabIndex = -1;
    const kind = entry.type === 'scheduled_event' ? 'Discord-Event' : entry.type === 'stamp' ? 'Modstempel' : categories[entry.category] || 'Beitrag';
    const heading = element('div', 'operation-title-row');
    const title = element('div');
    title.append(element('span', 'category-tag', kind), element('h4', '', operationTitle(entry)));
    heading.append(icon(entry.type === 'scheduled_event' ? 'calendar' : entry.type === 'stamp' ? 'clock' : categoryIcons[entry.category] || 'megaphone'), title);
    card.append(heading, statusLabel(entry));
    const target = entry.target || {};
    if (target.guildId) card.append(element('p', 'operation-target', (target.guildName || 'Discord-Server') + (entry.type !== 'scheduled_event' && target.channelName ? ' · #' + target.channelName : '') + (entry.type === 'scheduled_event' ? ' · Server-Event' : '\nErwähnung: ' + (entry.category === 'modstempel' || entry.type === 'stamp' ? roleLabel(target) : '@everyone'))));
    const steps = deliverySteps(entry);
    if (steps) card.append(steps);
    const data = operationData(entry);
    if (data.startsAt) card.append(element('p', 'request-meta', 'Beginn: ' + dateTime(data.startsAt)));
    if (data.endsAt) card.append(element('p', 'request-meta', 'Ende: ' + dateTime(data.endsAt)));
    if (data.location) card.append(element('p', 'request-meta', 'Ort oder Link: ' + data.location));
    if (data.text || data.description || data.note) card.append(element('p', 'operation-body', data.text || data.description || data.note));
    if (operationImage(entry)) {
      const imageNote = element('p', 'request-image-tag');
      imageNote.append(icon('image'), document.createTextNode('Mit Bild · ' + imageDescription(operationImage(entry))));
      card.append(imageNote);
    }
    if (entry.error && entry.status !== 'sent') card.append(element('p', 'event-error', cleanError(entry.error)));
    if (entry.waitingReason) card.append(element('p', 'delivery-waiting', cleanError(entry.waitingReason)));
    if (entry.status === 'uncertain') card.append(element('p', 'request-local-hint', entry.type === 'scheduled_event' ? 'Das Event könnte bereits erstellt worden sein. Prüfe den Server vor einem erneuten Versuch.' : 'Die Nachricht könnte bereits in Discord sein. Prüfe den ursprünglichen Kanal vor einem erneuten Versuch.'));
    if (entry.status === 'skipped') card.append(element('p', 'request-local-hint', confirmedImage(entry) ? 'Die bestätigte Bildnachricht bleibt in Discord. Nur die lokale Nachverfolgung der Umfrage wurde beendet.' : 'Nur die lokale Nachverfolgung ist beendet. Das löscht nichts in Discord und ist keine Zustellbestätigung.'));
    if (entry.legacyLocal) card.append(element('p', 'request-local-hint', 'Zeitänderung für einen Dienst aus Version 1. Es wurde nichts nach Discord gesendet.'));
    const results = pollResults(entry);
    if (results) card.append(results);
    const controls = operationControls(entry);
    if (controls.childNodes.length) card.append(controls);
    card.append(element('p', 'field-help', 'Auf diesem Gerät erstellt: ' + dateTime(entry.createdAt || entry.at)));
    return card;
  }

  function preserveList(id, signature, create) {
    const list = $(id);
    const key = JSON.stringify(signature);
    if (signatures[id] === key) return;
    signatures[id] = key;
    const focused = document.activeElement;
    const oldFocus = focused && list.contains(focused) ? { action: focused.dataset.action, id: focused.dataset.id, part: focused.dataset.part, operationId: focused.dataset.operationId } : null;
    list.replaceChildren(...create());
    if (oldFocus) {
      const next = Array.from(list.querySelectorAll('[data-action], [data-operation-id]')).find(node => oldFocus.action ? node.dataset.action === oldFocus.action && node.dataset.id === oldFocus.id && node.dataset.part === oldFocus.part : oldFocus.operationId && node.dataset.operationId === oldFocus.operationId);
      if (next) next.focus({ preventScroll: true });
    }
  }

  function recentRow(entry) {
    const row = element('li', 'event-item');
    const badge = element('span', 'event-icon');
    badge.append(icon(entry.type === 'scheduled_event' ? 'calendar' : entry.type === 'post' ? 'megaphone' : 'clock'));
    const body = element('div', 'event-content');
    const heading = element('div', 'event-topline');
    heading.append(element('strong', '', operationTitle(entry)), element('time', '', time(entry.createdAt || entry.at)));
    body.append(heading, statusLabel(entry));
    const open = control('Ansehen', 'show-operation', entry.id);
    open.className = 'text-button';
    body.append(open);
    row.append(badge, body);
    return row;
  }

  function sessionRow(session) {
    const row = element('li', 'session-row');
    const button = control('', 'show-session', session.id);
    button.className = 'session-button';
    const main = element('span', 'session-main');
    main.append(element('strong', '', day(session.startedAt)), element('span', '', time(session.startedAt) + ' – ' + time(session.endedAt) + (session.name ? ' · ' + session.name : '') + (session.legacy ? ' · Version 1' : '')));
    const value = element('span', 'session-value');
    value.append(element('strong', '', shortDuration(session.activeMs)), element('span', '', 'Pause ' + shortDuration(session.pauseMs)));
    button.append(main, value, icon('chevron'));
    row.append(button);
    return row;
  }

  function archiveCard(entry) {
    const card = element('li', 'request-card');
    const request = entry.request || {};
    card.append(element('span', 'legacy-badge', 'Archiv · Version 1 · nur lesen'), element('h4', '', request.title || entry.title || stampNames[entry.type] || 'Frühere Meldung'));
    if (entry.name || request.streamer) card.append(element('p', 'request-meta', entry.name || request.streamer));
    card.append(element('p', 'request-meta', dateTime(entry.at || entry.createdAt)), element('p', 'archive-note', entry.legacyNotice || 'Frühere Meldung. Es wird nichts erneut gesendet.'));
    if (entry.status) card.append(element('p', 'request-meta', 'Damals gespeicherter Status: ' + (statusNames[entry.status] || entry.status)));
    if (request.note || entry.note) card.append(element('p', 'operation-body', request.note || entry.note));
    if (request.image) card.append(element('p', 'request-image-tag', 'Bild aus dem ursprünglichen Eintrag bleibt erhalten.'));
    if (entry.error && !['sent', 'skipped'].includes(entry.status)) card.append(element('p', 'archive-note', cleanError(entry.error)));
    return card;
  }

  function scheduledCard(event) {
    const card = element('li', 'request-card');
    card.append(element('span', 'category-tag', 'Discord-Event'), element('h4', '', event.name || 'Discord-Event'));
    const names = { 1: 'Geplant', 2: 'Läuft', 3: 'Beendet', 4: 'Abgesagt', scheduled: 'Geplant', active: 'Läuft', completed: 'Beendet', canceled: 'Abgesagt' };
    if (names[event.status]) card.append(element('p', 'request-meta', names[event.status]));
    card.append(element('p', 'request-meta', 'Beginn: ' + dateTime(event.startsAt)), element('p', 'request-meta', 'Ende: ' + dateTime(event.endsAt)));
    if (event.location) card.append(element('p', 'request-meta', 'Ort oder Link: ' + event.location));
    if (event.description) card.append(element('p', 'operation-body', event.description));
    const actions = element('div', 'request-controls');
    const open = control('Event in Discord öffnen', 'open-scheduled', event.id, 'external');
    open.disabled = localLocked() || !native();
    actions.append(open);
    card.append(actions);
    return card;
  }

  function renderLists() {
    const events = snapshot.events || [];
    const posts = snapshot.posts || events.filter(entry => entry.type === 'post');
    const eventOperations = snapshot.eventOperations || events.filter(entry => entry.type === 'scheduled_event');
    const controlsState = [localLocked(), remoteLocked(), native(), canContact()];
    setText('post-count', posts.length);
    setText('event-operation-count', eventOperations.length);
    show('posts-empty', !posts.length);
    show('event-operations-empty', !eventOperations.length);
    show('recent-empty', !events.length);
    preserveList('post-list', [posts, controlsState], () => posts.map(operationCard));
    preserveList('event-operation-list', [eventOperations, controlsState], () => eventOperations.map(operationCard));
    preserveList('delivery-events', [events, controlsState], () => events.map(operationCard));
    preserveList('recent-events', events.slice(0, 3), () => events.slice(0, 3).map(recentRow));
    const sessions = (snapshot.sessions || []).filter(session => session.endedAt || session.status === 'finished');
    setText('session-count', sessions.length);
    setText('week-time', shortDuration(snapshot.totals && snapshot.totals.weekMs));
    show('sessions-empty', !sessions.length);
    preserveList('session-list', sessions, () => sessions.map(sessionRow));
    $('export-csv').disabled = localLocked() || !sessions.length;
    $('export-json').disabled = busy || snapshot.jsonExportAvailable === false;
    const summary = [];
    const counts = events.reduce((result, entry) => { result[entry.status] = (result[entry.status] || 0) + 1; return result; }, {});
    if (counts.pending || counts.sending) summary.push((counts.pending || 0) + (counts.sending || 0) + ' in Bearbeitung');
    if (counts.uncertain) summary.push(counts.uncertain + ' unklar');
    if (counts.failed) summary.push(counts.failed + ' fehlgeschlagen');
    setText('delivery-summary', summary.join(' · ') || (events.length ? 'Alle bisherigen Aufträge sind bearbeitet.' : 'Noch keine Discord-Aktivitäten auf diesem Gerät.'));
    $('sync-operations').disabled = remoteLocked() || !native() || !auth().configured || !auth().authenticated || !events.some(entry => ['pending', 'sending', 'uncertain'].includes(entry.status));
    setText('sync-operations', accessGranted() ? 'Abgleichen' : 'Zugang prüfen');
    const legacy = snapshot.legacyEvents || [];
    show('legacy-section', Boolean(legacy.length));
    setText('legacy-count', legacy.length);
    preserveList('legacy-events', legacy, () => legacy.map(archiveCard));
    preserveList('scheduled-list', [snapshot.scheduledEvents || [], selection().guildId, controlsState], () => (snapshot.scheduledEvents || []).map(scheduledCard));
  }

  function render(state) {
    if (!state) return;
    snapshot = state;
    show('preview-mode', !native());
    show('storage-alert', Boolean(state.storageError));
    if (state.storageError) setText('storage-alert', cleanError(state.storageError));
    if (!appearanceDirty) applyAppearance(state.profile && state.profile.accent, state.profile && state.profile.theme);
    renderAccess();
    renderSettings();
    renderClock();
    renderComposer();
    renderEventForm();
    renderLists();
  }

  async function task(operation, options) {
    if (busy) return false;
    busy = true;
    const settings = options || {};
    if (settings.errorId) show(settings.errorId, false);
    if (snapshot) render(snapshot);
    try {
      await operation();
      if (settings.after) settings.after();
      if (settings.success) toast(typeof settings.success === 'function' ? settings.success() : settings.success);
      return true;
    } catch (error) {
      if (settings.errorId) errorAt(settings.errorId, error);
      else toast(cleanError(error), true);
      return false;
    } finally {
      busy = false;
      if (app && snapshot) render(app.getSnapshot());
    }
  }

  function closeDialog() { if (!dialogBusy && $('action-dialog').open) $('action-dialog').close(); }

  function openDialog(options) {
    if ($('action-dialog').open) return;
    dialogAction = options.action || null;
    dialogReturnFocus = document.activeElement;
    setText('dialog-title', options.title);
    setText('dialog-copy', options.copy || '');
    setText('dialog-confirm', options.confirm || 'Bestätigen');
    setText('dialog-cancel', options.action ? 'Abbrechen' : 'Schließen');
    $('dialog-details').replaceChildren();
    if (options.details) $('dialog-details').append(options.details);
    show('dialog-note-group', Boolean(options.note));
    $('dialog-note').value = '';
    show('dialog-error', false);
    show('dialog-confirm', Boolean(options.action));
    $('dialog-confirm').disabled = false;
    $('dialog-cancel').disabled = false;
    $('dialog-close').disabled = false;
    $('action-dialog').classList.toggle('has-image', Boolean(options.image));
    $('action-dialog').showModal();
    $('action-dialog').scrollTop = 0;
    $('dialog-title').focus({ preventScroll: true });
  }

  function addDetail(list, label, text) {
    const row = element('div');
    row.append(element('dt', '', label), element('dd', '', text));
    list.append(row);
  }

  function preparedDetails(prepared) {
    const fragment = document.createDocumentFragment();
    const target = prepared.target || {};
    const operation = prepared.operation;
    const data = operation.data;
    const isEvent = operation.type === 'scheduled_event';
    const targetBox = element('div', 'request-confirm-target');
    targetBox.append(element('strong', '', target.guildName || 'Discord-Server'));
    if (!isEvent) targetBox.append(element('span', '', '#' + (target.channelName || 'Discord-Kanal')));
    targetBox.append(element('span', 'confirm-mention', isEvent ? 'Server-Event · keine zusätzliche Erwähnung' : 'Erwähnung: ' + prepared.mentionLabel));
    if (!isEvent) targetBox.append(element('span', '', 'Sichtbarkeit entsprechend den Kanalrechten.'));
    fragment.append(targetBox, element('h3', 'request-confirm-title', prepared.title || data.title));
    const currentUser = auth().user;
    if (currentUser) fragment.append(element('p', 'request-confirm-meta', 'Absender: ' + (currentUser.displayName || currentUser.username)));
    fragment.append(element('p', 'request-confirm-meta', isEvent ? 'Externes Discord-Event' : 'Kategorie: ' + categories[operation.category]));
    if (data.startsAt) fragment.append(element('p', 'request-confirm-meta', 'Beginn: ' + dateTime(data.startsAt)));
    if (data.endsAt) fragment.append(element('p', 'request-confirm-meta', 'Ende: ' + dateTime(data.endsAt)));
    if (data.startsAt || data.endsAt) fragment.append(element('p', 'request-confirm-meta', 'Zeitzone: ' + timezone()));
    if (data.location) fragment.append(element('p', 'request-confirm-meta', 'Ort oder Link: ' + data.location));
    if (data.text || data.description) fragment.append(element('p', 'request-confirm-note', data.text || data.description));
    const image = prepared.image || operation.image;
    if (image) {
      const figure = element('figure', 'request-confirm-image');
      const img = element('img');
      img.src = app.requestImageUrl(image);
      img.alt = 'Ausgewähltes Bild für den bestätigten Discord-Beitrag';
      figure.append(img, element('figcaption', '', (prepared.messageCount === 2 ? '1. Nachricht · Bild und Details · ' : 'Bild · ') + imageDescription(image)));
      fragment.append(figure);
    }
    if (data.poll) {
      const poll = element('div', 'request-confirm-answers');
      poll.append(element('p', '', prepared.messageCount === 2 ? '2. Nachricht · Umfrage' : 'Umfrage'));
      if (data.poll.question) poll.append(element('p', 'request-confirm-note', data.poll.question));
      const answers = element('ul', 'request-answer-options');
      data.poll.answers.forEach(answer => { const row = element('li'); row.append(element('span', 'answer-dot'), document.createTextNode(answer)); answers.append(row); });
      poll.append(answers, element('p', 'field-help', 'Antworten möglich für ' + data.poll.durationHours + (data.poll.durationHours === 1 ? ' Stunde.' : ' Stunden.')));
      fragment.append(poll);
    }
    fragment.append(element('p', 'confirmation-count', isEvent ? 'Ein Event im ausgewählten Server. Es wird keine zusätzliche Kanalnachricht erstellt.' : prepared.messageCount === 2 ? 'Zwei zusammengehörige Nachrichten. Nur die erste enthält die vereinbarte Erwähnung.' : 'Eine Nachricht im ausgewählten Kanal.'));
    return fragment;
  }

  function readDateInput(id, required) {
    const value = $(id).value;
    if (!value && !required) return null;
    const result = value ? new Date(value).getTime() : NaN;
    if (!Number.isFinite(result)) throw new Error('Bitte gib ein gültiges Datum und eine Uhrzeit ein.');
    return result;
  }

  function postInput() {
    const kind = category();
    const input = { category: kind, title: $('post-title').value.trim(), text: $('post-text').value.trim(), image: requestImage };
    if (kind === 'stream' || kind === 'big_match') input.startsAt = readDateInput('post-start', false);
    if (usesPoll(kind)) {
      input.poll = { durationHours: Number($('poll-duration').value) };
      if (kind === 'poll') {
        input.poll.question = $('poll-question').value.trim();
        input.poll.answers = Array.from($('poll-answers').querySelectorAll('input')).map(input => input.value.trim());
      }
    }
    return input;
  }

  function publishPost(event) {
    event.preventDefault();
    if (localLocked() || postCreating || imageBusy || snapshot.imageBusy || $('action-dialog').open) return;
    show('post-form-error', false);
    let prepared;
    try { prepared = app.preparePost(postInput()); }
    catch (error) { errorAt('post-form-error', error); return; }
    const split = prepared.messageCount === 2;
    openDialog({
      title: split ? 'Bild und Umfrage senden?' : 'Beitrag an Discord senden?',
      copy: split ? 'Du veröffentlichst 2 zusammengehörige Nachrichten: zuerst das Bild mit den Details, danach die Umfrage. Prüfe das Ziel und die Erwähnung.' : 'Prüfe deinen Beitrag, den Discord-Kanal und die Erwähnung vor dem Senden.',
      confirm: split ? '2 Nachrichten senden' : 'Jetzt senden',
      image: Boolean(prepared.image || prepared.operation.image),
      details: preparedDetails(prepared),
      action: async () => {
        postCreating = true;
        render(snapshot);
        try {
          // This exact prepared object owns its original target and operation ID.
          await app.submit(prepared);
          $('post-form').reset();
          requestImage = null;
          resetPollAnswers();
          show('request-image-error', false);
          show('post-form-error', false);
          toast('Beitrag gespeichert. Den bestätigten Sendestatus siehst du unter „Deine Beiträge“.');
        } finally { postCreating = false; render(app.getSnapshot()); }
      }
    });
  }

  function publishEvent(event) {
    event.preventDefault();
    if (localLocked() || eventCreating || $('action-dialog').open) return;
    show('event-form-error', false);
    let prepared;
    try { prepared = app.prepareEvent({ title: $('event-title').value.trim(), description: $('event-description').value.trim(), startsAt: readDateInput('event-start', true), endsAt: readDateInput('event-end', true), location: $('event-location').value.trim() }); }
    catch (error) { errorAt('event-form-error', error); return; }
    openDialog({ title: 'Discord-Event erstellen?', copy: 'Du erstellst ein echtes externes Event auf diesem Discord-Server. Es entsteht keine zusätzliche Kanalnachricht und kein @everyone-Ping.', confirm: 'Event erstellen', details: preparedDetails(prepared), action: async () => {
      eventCreating = true;
      render(snapshot);
      try {
        await app.submit(prepared);
        $('event-form').reset();
        show('event-form-error', false);
        toast('Event-Auftrag gespeichert. Die bestätigte Erstellung siehst du unter „Deine Event-Aufträge“.');
      } finally { eventCreating = false; render(app.getSnapshot()); }
    } });
  }

  function addPollAnswer(value) {
    if ($('poll-answers').children.length >= 10) return;
    const row = element('div', 'poll-answer-row');
    const inputId = 'poll-answer-' + (++pollAnswerSequence);
    const label = element('label', '', 'Antwort');
    label.htmlFor = inputId;
    const controls = element('div');
    const input = element('input');
    input.id = inputId;
    input.type = 'text';
    input.maxLength = 55;
    input.value = value || '';
    input.placeholder = 'Antwortmöglichkeit';
    const remove = element('button', 'icon-button');
    remove.type = 'button';
    remove.dataset.removeAnswer = inputId;
    remove.append(icon('close'));
    controls.append(input, remove);
    row.append(label, controls);
    $('poll-answers').append(row);
    numberPollAnswers();
    return input;
  }

  function numberPollAnswers() {
    Array.from($('poll-answers').children).forEach((row, index) => {
      setText(row.querySelector('label'), 'Antwort ' + (index + 1));
      row.querySelector('button').setAttribute('aria-label', 'Antwort ' + (index + 1) + ' entfernen');
      row.querySelector('button').disabled = $('poll-answers').children.length <= 2;
    });
  }

  function resetPollAnswers() { $('poll-answers').replaceChildren(); addPollAnswer(''); addPollAnswer(''); }

  async function chooseImage() {
    if (localLocked() || !native() || imageBusy || snapshot.imageBusy || postCreating || $('action-dialog').open) return;
    imageBusy = true;
    show('request-image-error', false);
    renderComposer();
    let changed = false;
    try {
      const next = await app.pickRequestImage();
      if (!next) return;
      app.requestImageUrl(next);
      const previous = requestImage;
      requestImage = next;
      changed = true;
      if (previous && previous.ref !== next.ref) {
        try { await app.discardRequestImage(previous.ref); }
        catch (_) { /* The new usable selection must survive draft cleanup failure. */ }
      }
    } catch (error) { errorAt('request-image-error', error); }
    finally {
      imageBusy = false;
      render(app.getSnapshot());
      if (changed) $('request-image-replace').focus({ preventScroll: true });
    }
  }

  async function removeImage() {
    if (!requestImage || localLocked() || imageBusy || snapshot.imageBusy || postCreating || $('action-dialog').open) return;
    imageBusy = true;
    show('request-image-error', false);
    renderComposer();
    try { await app.discardRequestImage(requestImage.ref); requestImage = null; }
    catch (error) { errorAt('request-image-error', error); }
    finally { imageBusy = false; render(app.getSnapshot()); if (!requestImage) $('request-image-choose').focus({ preventScroll: true }); }
  }

  function findOperation(id) { return (snapshot.events || []).find(entry => entry.id === id); }

  function retryOperation(id) {
    const entry = findOperation(id);
    if (!entry || entry.legacyLocal || !entry.operation || !['failed', 'uncertain'].includes(entry.status)) return;
    const isEvent = entry.type === 'scheduled_event';
    const split = splitPost(entry);
    const image = confirmedImage(entry);
    if (entry.status === 'uncertain') {
      const copy = isEvent ? 'Dieses Event könnte bereits auf dem Server existieren. Prüfe zuerst die Discord-Events. Ein erneuter Versuch kann ein zweites Event erstellen.' : split && image ? 'Die Bildnachricht ist bestätigt und wird nicht erneut gesendet. Die Umfrage könnte bereits im Kanal existieren. Prüfe Discord, bevor du nur die Umfrage erneut sendest.' : split ? 'Die Bildnachricht könnte bereits in Discord sein. Prüfe zuerst den Kanal, um ein doppeltes Bild zu vermeiden. Der erneute Versuch verwendet denselben Auftrag.' : 'Die Nachricht könnte bereits in Discord sein. Prüfe zuerst den ursprünglichen Kanal. Ein erneuter Versuch kann eine doppelte Nachricht erzeugen.';
      openDialog({ title: isEvent ? 'Event erneut erstellen?' : image && split ? 'Umfrage erneut senden?' : 'Erneut an Discord senden?', copy, confirm: isEvent ? 'Bewusst erneut erstellen' : 'Bewusst erneut senden', action: async () => { await app.retry(id, true); toast('Erneuter Versuch für denselben Auftrag angefordert.'); } });
    } else task(() => app.retry(id, false), { success: image && split ? 'Erneuter Umfrageversand angefordert.' : 'Erneuter Versuch angefordert.' });
  }

  function markHandled(id) {
    const entry = findOperation(id);
    if (!entry || entry.legacyLocal || !entry.operation || !['failed', 'uncertain'].includes(entry.status)) return;
    openDialog({ title: 'Lokal als erledigt markieren?', copy: confirmedImage(entry) ? 'Die bestätigte Bildnachricht bleibt in Discord. Du beendest nur die lokale Nachverfolgung der Umfrage. Das löscht nichts in Discord. Ein unklarer Umfrageversand könnte bereits erfolgt sein.' : entry.type === 'scheduled_event' ? 'Du beendest nur die lokale Nachverfolgung. Ein möglicherweise bereits erstelltes Discord-Event bleibt bestehen. Prüfe zuerst deinen Server.' : 'Du beendest nur die lokale Nachverfolgung. Eine möglicherweise bereits gesendete Nachricht bleibt in Discord. Prüfe zuerst den ursprünglichen Kanal.', confirm: 'Lokal erledigen', action: async () => { await app.markHandled(id); toast('Lokale Nachverfolgung beendet.'); } });
  }

  function showOperation(id) {
    const entry = findOperation(id);
    if (!entry) return;
    setView(entry.type === 'post' ? 'posts' : entry.type === 'scheduled_event' ? 'events' : 'history');
    const list = $(entry.type === 'post' ? 'post-list' : entry.type === 'scheduled_event' ? 'event-operation-list' : 'delivery-events');
    const card = Array.from(list.querySelectorAll('[data-operation-id]')).find(node => node.dataset.operationId === id);
    if (card) { card.scrollIntoView({ block: 'start', behavior: 'auto' }); card.focus({ preventScroll: true }); }
  }

  function showSession(id) {
    const session = (snapshot.sessions || []).find(item => item.id === id) || snapshot.activeSession && snapshot.activeSession.id === id && snapshot.activeSession;
    if (!session) return;
    const details = document.createDocumentFragment();
    const grid = element('dl', 'detail-grid');
    addDetail(grid, 'Beginn', dateTime(session.startedAt));
    addDetail(grid, 'Ende', session.endedAt ? dateTime(session.endedAt) : 'Dienst läuft noch');
    addDetail(grid, 'Nettozeit', duration(session.activeMs));
    addDetail(grid, 'Pause', duration(session.pauseMs));
    details.append(grid);
    if (session.target) {
      const target = element('p', 'detail-note', (session.target.guildName || 'Discord-Server') + ' · #' + (session.target.channelName || 'Kanal') + '\nErwähnung: ' + roleLabel(session.target));
      details.append(target);
    }
    if (session.legacy) details.append(element('p', 'archive-note', 'Dienst aus Version 1. Neue lokale Zeitänderungen werden nicht nach Discord gesendet.'));
    const related = (snapshot.events || []).filter(entry => operationData(entry).sessionId === id || entry.legacyLocal && entry.sessionId === id);
    if (related.length) { const list = element('ol', 'request-list'); list.append(...related.map(operationCard)); details.append(list); }
    openDialog({ title: session.name || 'Dienstübersicht', copy: session.team || 'Deine Dienstzeit', details });
  }

  function startDuty() { if (!localLocked()) task(() => app.start(), { success: 'Dein Dienst läuft. Der Discord-Status steht im Verlauf.' }); }

  function finishDuty() {
    if (!snapshot.activeSession || localLocked()) return;
    const legacy = snapshot.activeSession.legacy;
    openDialog({ title: 'Dienst beenden?', copy: legacy ? 'Deine Zeit wird lokal im Verlauf gespeichert. Für diesen Dienst aus Version 1 wird keine Discord-Meldung gesendet.' : 'Deine Zeit wird im Verlauf gespeichert. Die Stempelmeldung behält das ursprüngliche Ziel dieses Diensts.', confirm: 'Dienst beenden', note: true, action: async note => { await app.finish(note); toast('Dienst beendet und im Verlauf gespeichert.'); } });
  }

  async function configureBackend(event) {
    event.preventDefault();
    if (localLocked() || !native()) return;
    const url = $('backend-url').value.trim();
    const run = async () => { await app.configureBackend(url); backendDirty = false; roleDirty = false; guildsLoaded = false; resetScheduledView(); };
    if (auth().configured && auth().origin && url.replace(/\/$/, '') !== auth().origin.replace(/\/$/, '')) {
      openDialog({ title: 'App-Verbindung ändern?', copy: 'Für eine andere App-Verbindung musst du dich neu bei Discord anmelden. Vorhandene Dienste und Aufträge behalten ihr ursprüngliches Ziel.', confirm: 'Verbindung ändern', action: run });
    } else await task(run, { errorId: 'backend-error' });
  }

  function login() { task(() => app.login(), { errorId: 'auth-error', success: 'Anmeldeseite geöffnet. Schließe die Anmeldung bei Discord im Browser ab.' }); }
  function pollLogin() { return task(() => app.pollLogin(), { errorId: 'auth-error' }); }

  function logout() {
    openDialog({ title: 'Von Discord abmelden?', copy: 'Deine lokalen Dienste und dein Verlauf bleiben erhalten. Neue Discord-Aktionen sind nach einer erneuten Anmeldung möglich.', confirm: 'Abmelden', action: async () => { await app.logout(); roleDirty = false; guildsLoaded = false; resetScheduledView(); toast('Von Discord abgemeldet.'); } });
  }

  async function loadGuilds() { await task(() => app.loadGuilds(), { errorId: 'selection-error', after: () => { guildsLoaded = true; } }); }

  async function selectGuild() {
    const id = $('guild-select').value;
    if (!id || localLocked()) return;
    await task(() => app.selectGuild(id), { errorId: 'selection-error', after: () => { roleDirty = false; resetScheduledView(); } });
  }

  function saveRole() {
    const id = $('role-select').value;
    const s = setup();
    if (!id || !s || !s.canConfigure || localLocked()) return;
    const role = (s.roles || []).find(item => item.id === id);
    if (!role) return;
    openDialog({ title: 'Moderatorrolle speichern?', copy: 'Modstempel erwähnt auf „' + s.guild.name + '“ künftig @' + role.name + '. Die Einstellung gilt für dein Team. Vorhandene Aufträge behalten ihre bestätigte Rolle.', confirm: 'Rolle speichern', action: async () => { await app.setModeratorRole(id); roleDirty = false; resetScheduledView(); toast('Moderatorrolle gespeichert.'); } });
  }

  function markSettingsDirty() { settingsDirty = true; setText('save-state', 'Nicht gespeicherte Änderungen'); show('settings-error', false); }

  async function saveSettings(event) {
    event.preventDefault();
    await task(() => app.saveSettings({ team: $('setting-team').value.trim(), accent: formAccent, theme: formTheme }), { errorId: 'settings-error', after: () => { fillSettings(app.getSnapshot()); setText('save-state', 'Einstellungen gespeichert'); }, success: 'Darstellung gespeichert.' });
  }

  function dispatchControl(button) {
    const id = button.dataset.id;
    switch (button.dataset.action) {
      case 'show-operation': showOperation(id); break;
      case 'show-session': showSession(id); break;
      case 'open-operation': task(() => app.openOperation(id, button.dataset.part || undefined)); break;
      case 'check-operation': task(() => app.checkOperation(id), { success: 'Auftragsstatus abgefragt.' }); break;
      case 'refresh-poll': task(() => app.refreshPoll(id), { success: 'Umfrageergebnisse abgefragt.' }); break;
      case 'retry-operation': retryOperation(id); break;
      case 'handle-operation': markHandled(id); break;
      case 'open-scheduled': task(() => app.openScheduledEvent(id)); break;
    }
  }

  function bindEvents() {
    document.querySelectorAll('[data-open-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.openView, { focus: true })));
    document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
    document.querySelector('.bottom-nav').addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = tabs.indexOf(currentView === 'settings' ? previousMainView : currentView);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      setView(tabs[next]); $('nav-' + tabs[next]).focus();
    });
    $('start-duty').addEventListener('click', startDuty);
    $('pause-duty').addEventListener('click', () => { if (snapshot.activeSession) task(() => snapshot.activeSession.status === 'paused' ? app.resume() : app.pause(), { success: 'Dienstzeit aktualisiert.' }); });
    $('finish-duty').addEventListener('click', finishDuty);
    $('post-form').addEventListener('submit', publishPost);
    $('post-form').addEventListener('input', () => show('post-form-error', false));
    $('post-category').addEventListener('change', () => renderComposer());
    $('event-form').addEventListener('submit', publishEvent);
    $('event-form').addEventListener('input', () => show('event-form-error', false));
    $('add-poll-answer').addEventListener('click', () => { const input = addPollAnswer(''); renderComposer(); if (input) input.focus(); });
    $('poll-answers').addEventListener('click', event => { const button = event.target.closest('[data-remove-answer]'); if (!button || $('poll-answers').children.length <= 2) return; const row = button.closest('.poll-answer-row'); const next = row.previousElementSibling || row.nextElementSibling; row.remove(); numberPollAnswers(); renderComposer(); if (next) next.querySelector('input').focus(); });
    $('request-image-choose').addEventListener('click', chooseImage);
    $('request-image-replace').addEventListener('click', chooseImage);
    $('request-image-remove').addEventListener('click', removeImage);
    $('backend-form').addEventListener('submit', configureBackend);
    $('backend-url').addEventListener('input', () => { backendDirty = true; show('backend-error', false); });
    $('login-discord').addEventListener('click', login);
    $('poll-login').addEventListener('click', pollLogin);
    $('cancel-login').addEventListener('click', () => task(() => app.cancelLogin(), { errorId: 'auth-error', success: 'Anmeldeversuch abgebrochen.' }));
    $('logout-discord').addEventListener('click', logout);
    $('refresh-access').addEventListener('click', () => task(() => app.refreshAccess(), { errorId: 'access-error' }));
    $('open-access-portal').addEventListener('click', () => task(() => app.openPortal(), { errorId: 'access-error' }));
    $('reload-guilds').addEventListener('click', loadGuilds);
    $('guild-select').addEventListener('change', selectGuild);
    $('channel-select').addEventListener('change', () => { const id = $('channel-select').value; if (id) task(() => app.selectChannel(id), { errorId: 'selection-error', success: 'Kanal für neue Beiträge und Dienste gespeichert.' }); });
    $('role-select').addEventListener('change', () => { roleDirty = true; renderSettings(); });
    $('save-role').addEventListener('click', saveRole);
    $('reload-setup').addEventListener('click', () => { const id = selection().guildId; if (id) task(() => app.selectGuild(id), { errorId: 'selection-error', after: () => { roleDirty = false; resetScheduledView(); } }); });
    $('install-bot').addEventListener('click', () => task(() => app.installBot(), { errorId: 'selection-error', success: 'Discord-Installationsseite geöffnet. Prüfe danach die Einrichtung erneut.' }));
    $('load-scheduled-events').addEventListener('click', () => { const guildId = selection().guildId; task(() => app.loadScheduledEvents(), { errorId: 'scheduled-error', after: () => { scheduledLoadedGuild = guildId; } }); });
    $('settings-form').addEventListener('submit', saveSettings);
    $('settings-form').addEventListener('input', markSettingsDirty);
    document.querySelectorAll('[name="accent-choice"]').forEach(input => input.addEventListener('change', () => { formAccent = input.value; $('setting-custom-color').value = formAccent; appearanceDirty = true; markSettingsDirty(); applyAppearance(formAccent, formTheme); }));
    $('setting-custom-color').addEventListener('input', () => { formAccent = $('setting-custom-color').value; document.querySelectorAll('[name="accent-choice"]').forEach(input => { input.checked = input.value.toLowerCase() === formAccent.toLowerCase(); }); appearanceDirty = true; applyAppearance(formAccent, formTheme); });
    document.querySelectorAll('[name="theme"]').forEach(input => input.addEventListener('change', () => { formTheme = input.value; appearanceDirty = true; markSettingsDirty(); applyAppearance(formAccent, formTheme); }));
    const themeChange = () => { if (snapshot) applyAppearance(appearanceDirty ? formAccent : snapshot.profile.accent, appearanceDirty ? formTheme : snapshot.profile.theme); };
    if (systemTheme.addEventListener) systemTheme.addEventListener('change', themeChange); else systemTheme.addListener(themeChange);
    $('sync-operations').addEventListener('click', () => task(() => app.sync(), { success: () => accessGranted() ? 'Aufträge abgeglichen. Den Status siehst du im Verlauf.' : accessCopy()[1] }));
    $('export-csv').addEventListener('click', () => task(() => app.exportData('csv'), { success: 'Export geöffnet.' }));
    $('export-json').addEventListener('click', () => task(() => app.exportData('json'), { success: 'Export geöffnet.' }));
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-action]');
      if (!button || button.disabled) return;
      if ($('dialog-details').contains(button) && $('action-dialog').open) {
        if (dialogBusy) return;
        $('action-dialog').addEventListener('close', () => dispatchControl(button), { once: true });
        closeDialog();
      } else dispatchControl(button);
    });
    $('dialog-close').addEventListener('click', closeDialog);
    $('dialog-cancel').addEventListener('click', closeDialog);
    $('action-dialog').addEventListener('cancel', event => { if (dialogBusy) event.preventDefault(); });
    $('action-dialog').addEventListener('close', () => {
      dialogAction = null;
      $('dialog-note').value = '';
      if (dialogReturnFocus && document.contains(dialogReturnFocus)) dialogReturnFocus.focus({ preventScroll: true });
      dialogReturnFocus = null;
      if (snapshot) render(app.getSnapshot());
    });
    $('dialog-form').addEventListener('submit', async event => {
      event.preventDefault();
      if (!dialogAction || dialogBusy) return;
      dialogBusy = true;
      ['dialog-confirm', 'dialog-cancel', 'dialog-close'].forEach(id => { $(id).disabled = true; });
      show('dialog-error', false);
      try {
        await dialogAction($('dialog-note').value.trim());
        dialogBusy = false;
        closeDialog();
      } catch (error) { errorAt('dialog-error', error); }
      finally {
        dialogBusy = false;
        ['dialog-confirm', 'dialog-cancel', 'dialog-close'].forEach(id => { $(id).disabled = false; });
        if (snapshot) render(app.getSnapshot());
      }
    });
    const onResume = () => {
      if (!app || !snapshot) return;
      render(app.getSnapshot());
      if (auth().pendingLogin && !busy && !dialogBusy && !snapshot.networkBusy) pollLogin();
    };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) onResume(); });
    window.addEventListener('modstempel-resume', onResume);
  }

  window.ModstempelUI = {
    handleBack: function () {
      if ($('action-dialog').open) { closeDialog(); return true; }
      if (currentView === 'settings') { setView(previousMainView); return true; }
      if (currentView !== 'clock') { setView('clock'); return true; }
      return false;
    }
  };

  async function init() {
    resetPollAnswers();
    document.querySelectorAll('.timezone-help').forEach(node => setText(node, 'Lokale Gerätezeit · ' + timezone()));
    bindEvents();
    app = window.Modstempel;
    if (!app) { errorAt('storage-alert', 'Crazy_Batto Discord App konnte nicht geladen werden. Bitte starte die App erneut.'); return; }
    try {
      snapshot = await app.init() || app.getSnapshot();
      fillSettings(snapshot);
      render(snapshot);
      app.subscribe(render);
      if (native() && !snapshot.activeSession && (!auth().authenticated || accessGranted() && !selection().guildId)) setView('settings');
    } catch (error) { errorAt('storage-alert', error); }
  }
  init();
}());
