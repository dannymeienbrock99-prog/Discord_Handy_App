(() => {
  'use strict';
  const root = document.getElementById('cb-website');
  const main = document.getElementById('portal-main');
  if (!root || !main) return;
  const $ = id => document.getElementById(id);
  const show = (id, visible) => { $(id).hidden = !visible; };
  const text = (id, value) => { (typeof id === 'string' ? $(id) : id).textContent = String(value == null ? '' : value); };
  const states = ['unregistered', 'pending', 'approved', 'rejected', 'revoked'];
  const live = root.dataset.portalMode === 'live' && /^https?:$/.test(location.protocol);
  const messages = {
    pending: ['Deine Anfrage wird geprüft', 'Deine Anfrage ist eingegangen. Crazy_Batto prüft sie persönlich. Hier siehst du, sobald über deinen Zugang entschieden wurde.', 'Wartet auf Freigabe'],
    approved: ['Dein Zugang ist freigegeben', 'Crazy_Batto hat deinen Zugang freigegeben. Du kannst die App mit diesem Discord-Konto nutzen.', 'Freigegeben'],
    rejected: ['Deine Anfrage wurde abgelehnt', 'Für dieses Discord-Konto wurde kein Zugang zur Crazy_Batto Discord App freigegeben. Bei Rückfragen wende dich an Crazy_Batto.', 'Abgelehnt'],
    revoked: ['Dein Zugang wurde gesperrt', 'Die Freigabe für dieses Discord-Konto wurde zurückgenommen. Neue Downloads und die App-Verbindung sind gesperrt.', 'Gesperrt']
  };
  function setView(name) {
    show('welcome-view', name === 'welcome');
    show('registration-view', name === 'unregistered');
    show('status-view', name !== 'welcome' && name !== 'unregistered');
    $('status-view').dataset.accessState = name;
  }
  function clearDownload() {
    show('download-section', false);
    show('download-unavailable', false);
    $('download-link').removeAttribute('href');
    $('download-link').setAttribute('aria-disabled', 'true');
    $('server-address').value = '';
    $('copy-server').disabled = true;
  }
  function account(name, handle) {
    main.querySelectorAll('[data-account-name]').forEach(node => text(node, name));
    main.querySelectorAll('[data-account-handle]').forEach(node => text(node, handle));
  }
  function statusCopy(state, example) {
    const copy = messages[state];
    text('status-title', (example ? 'Beispiel: ' : '') + copy[0]);
    text('status-copy', example ? 'So sieht diese Ansicht nach einer entsprechenden Entscheidung auf dem Server aus. Diese Vorschau verändert keinen echten Zugang.' : copy[1]);
    text('access-label', (example ? 'Beispiel · ' : '') + copy[2]);
    text('status-symbol', state === 'approved' ? '04' : '03');
  }

  // Offline previews are an isolated branch: no session, requests, timers or storage.
  if (!live) {
    show('portal-preview-controls', true);
    show('portal-example-label', true);
    clearDownload();
    $('login-link').removeAttribute('href');
    $('login-link').setAttribute('aria-disabled', 'true');
    $('registration-form').addEventListener('submit', event => event.preventDefault());
    $('login-link').addEventListener('click', event => event.preventDefault());
    $('download-link').addEventListener('click', event => event.preventDefault());
    const choices = Array.from(root.querySelectorAll('[data-portal-preview]'));
    function preview(state) {
      if (state !== 'welcome' && !states.includes(state)) return;
      setView(state);
      account('Beispiel-Konto', '@dein-discord-name · Nur Vorschau');
      show('requested-row', false);
      show('reviewed-row', false);
      show('review-note', false);
      show('offline-download-preview', state === 'approved');
      show('portal-error', false);
      show('retry-button', false);
      text('registration-title', 'Beispiel: Zugang anfragen');
      text('registration-copy', 'Nach der Discord-Anmeldung würdest du hier deine Anfrage an Crazy_Batto senden. Das angezeigte Konto ist ein Beispiel.');
      const selected = choices.find(button => button.dataset.portalPreview === state);
      text('portal-status', 'Beispielansicht: ' + (selected ? selected.textContent : '') + '. Es wird nichts angemeldet, abgesendet oder freigegeben.');
      if (messages[state]) statusCopy(state, true);
      choices.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.portalPreview === state)));
    }
    choices.forEach(button => button.addEventListener('click', () => preview(button.dataset.portalPreview)));
    preview('welcome');
    return;
  }

  // Only the server-rendered page explicitly marked "live" reaches the real portal.
  show('portal-preview-controls', false);
  show('portal-example-label', false);
  show('offline-download-preview', false);
  let session = null;
  let verified = false;
  let busy = false;
  let pollTimer = null;
  const dateTime = value => Number.isFinite(value) ? new Date(value).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const signedIn = () => !!(session && session.authenticated && session.user);
  const canDownload = () => !!(verified && session && session.configured === true && signedIn() && session.access && session.access.status === 'approved' && session.access.canUseApp === true && session.download && session.download.available === true);
  function statusMessage(value) { text('portal-status', value); }
  function errorMessage(error) {
    text('portal-error', String(error && error.message || 'Der Server ist gerade nicht erreichbar. Bitte erneut prüfen.').slice(0, 1000));
    show('portal-error', true);
  }
  function lock(value) {
    busy = value;
    main.setAttribute('aria-busy', String(value));
    ['refresh-button', 'retry-button'].forEach(id => { $(id).disabled = value; });
    $('register-button').disabled = value || !verified || !signedIn() || session.configured !== true || !session.access || session.access.status !== 'unregistered';
    main.querySelectorAll('.logout-button').forEach(button => { button.disabled = value || !verified || !signedIn(); });
  }
  function schedule() {
    clearTimeout(pollTimer);
    if (document.hidden || !signedIn()) return;
    pollTimer = setTimeout(() => refresh(false), verified && session.access && session.access.status === 'pending' ? 15000 : 60000);
  }
  async function api(path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const options = { credentials: 'same-origin', cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } };
      if (body !== undefined) {
        if (!session || typeof session.csrfToken !== 'string' || !session.csrfToken) throw new Error('Bitte melde dich erneut mit Discord an.');
        options.method = 'POST';
        options.headers['Content-Type'] = 'application/json';
        options.headers['X-CSRF-Token'] = session.csrfToken;
        options.body = JSON.stringify(body);
      }
      const response = await fetch(path, options);
      let result;
      try { result = await response.json(); } catch (_) { throw new Error('Der Server hat keine lesbare Antwort geliefert. Bitte erneut prüfen.'); }
      if (!response.ok || !result || !result.ok) {
        if (response.status === 401) session = null;
        const error = new Error(result && result.message || 'Die Anfrage konnte nicht abgeschlossen werden.');
        error.kind = result && result.kind;
        error.status = response.status;
        throw error;
      }
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Die Antwort dauert zu lange. Bitte prüfe deinen Status erneut.');
      if (error instanceof TypeError) throw new Error('Der Server ist gerade nicht erreichbar. Bitte prüfe deine Verbindung.');
      throw error;
    } finally { clearTimeout(timer); }
  }
  function render() {
    const authenticated = signedIn();
    const access = authenticated && session.access;
    const state = verified && session.configured === true && access && states.includes(access.status) ? access.status : null;
    setView(!authenticated ? 'welcome' : state || 'unknown');
    const configured = verified && session && session.configured === true;
    $('login-link').setAttribute('aria-disabled', String(!configured));
    if (configured) $('login-link').setAttribute('href', '/portal/login');
    else $('login-link').removeAttribute('href');
    account(authenticated ? session.user.displayName || session.user.username || 'Discord-Konto' : '', authenticated && session.user.username ? '@' + session.user.username : '');
    clearDownload();
    show('review-note', false);
    show('requested-row', false);
    show('reviewed-row', false);
    if (!authenticated || state === 'unregistered') return;
    if (!state || (state === 'approved' && access.canUseApp !== true)) {
      $('status-view').dataset.accessState = 'unknown';
      text('status-title', 'Zugang wird geprüft');
      text('status-copy', 'Der aktuelle Freigabestatus konnte noch nicht bestätigt werden. Bitte prüfe die Verbindung erneut.');
      text('access-label', 'Nicht bestätigt');
      text('status-symbol', '03');
      return;
    }
    statusCopy(state, false);
    show('requested-row', Number.isFinite(access.requestedAt));
    text('requested-at', dateTime(access.requestedAt));
    show('reviewed-row', Number.isFinite(access.reviewedAt));
    text('reviewed-at', dateTime(access.reviewedAt));
    if (typeof access.reason === 'string' && access.reason) { show('review-note', true); text('review-reason', access.reason); }
    const ready = canDownload();
    show('download-section', ready);
    show('download-unavailable', state === 'approved' && access.canUseApp === true && !ready);
    if (ready) {
      // The route validates approval again and chooses the private APK on the server.
      $('download-link').setAttribute('href', '/portal/download');
      $('download-link').setAttribute('aria-disabled', 'false');
      const version = typeof session.download.version === 'string' && /^[\w.+-]{1,40}$/.test(session.download.version) ? session.download.version : '';
      text('download-meta', version ? 'Version ' + version + ' · APK für Android' : 'APK für Android');
      $('server-address').value = location.origin;
      $('copy-server').disabled = false;
    }
  }
  async function refresh(manual) {
    if (busy) return;
    clearTimeout(pollTimer);
    lock(true);
    clearDownload();
    show('portal-error', false);
    show('retry-button', false);
    if (manual || !session) statusMessage('Dein Zugang wird geprüft …');
    try {
      const result = await api('/portal/api/session');
      if (typeof result.configured !== 'boolean' || typeof result.authenticated !== 'boolean') throw new Error('Der Serverstatus konnte nicht bestätigt werden. Bitte erneut prüfen.');
      if (result.authenticated && (!result.user || typeof result.user.id !== 'string' || !/^\d{17,20}$/.test(result.user.id))) throw new Error('Die bestätigte Kontoidentität fehlt. Bitte melde dich erneut an.');
      session = result;
      verified = true;
      render();
      if (!result.configured) {
        errorMessage(new Error('Die Discord-Anmeldung wird auf diesem Server noch eingerichtet. Die Registrierung ist noch nicht verfügbar.'));
        show('retry-button', true);
        statusMessage('');
      } else statusMessage(manual ? 'Status aktualisiert · ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr' : '');
    } catch (error) {
      // A stale approval never keeps a download or login active after a failed check.
      verified = false;
      render();
      errorMessage(error);
      show('retry-button', true);
      statusMessage('Der aktuelle Freigabestatus konnte nicht bestätigt werden.');
    } finally { lock(false); schedule(); }
  }
  async function register(event) {
    event.preventDefault();
    if (busy || !verified || !signedIn() || session.configured !== true || !session.access || session.access.status !== 'unregistered') return;
    const note = $('registration-note').value.trim();
    if (note.length > 500) { errorMessage(new Error('Deine Nachricht darf höchstens 500 Zeichen haben.')); return; }
    lock(true);
    clearTimeout(pollTimer);
    show('portal-error', false);
    statusMessage('Deine Anfrage wird gesendet …');
    try {
      const result = await api('/portal/api/register', { note });
      if (!result.access || !states.includes(result.access.status)) throw new Error('Die Bestätigung fehlt. Bitte prüfe deinen Status, bevor du erneut sendest.');
      session.access = result.access;
      session.download = { available: false };
      $('registration-note').value = '';
      render();
      statusMessage(result.access.status === 'pending' ? 'Deine Anfrage ist eingegangen und wartet auf die persönliche Freigabe.' : 'Dein aktueller Zugangsstatus wurde übernommen.');
      $('status-title').tabIndex = -1;
      $('status-title').focus({ preventScroll: true });
    } catch (error) {
      verified = false;
      render();
      errorMessage(error);
      statusMessage('Bitte prüfe den Status, wenn eine Bestätigung fehlt.');
      show('retry-button', true);
    } finally { lock(false); schedule(); }
  }
  async function logout() {
    if (busy || !verified || !signedIn()) return;
    lock(true);
    clearTimeout(pollTimer);
    clearDownload();
    show('portal-error', false);
    try {
      await api('/portal/api/logout', {});
      session = { ok: true, configured: true, authenticated: false };
      verified = true;
      render();
      statusMessage('Du bist abgemeldet.');
    } catch (error) {
      verified = false;
      render();
      errorMessage(error);
      show('retry-button', true);
      statusMessage('Die Abmeldung konnte nicht bestätigt werden. Bitte erneut prüfen.');
    } finally { lock(false); schedule(); }
  }
  $('login-link').addEventListener('click', event => {
    if (busy || !verified || !session || session.configured !== true) event.preventDefault();
  });
  $('download-link').addEventListener('click', event => { if (busy || !canDownload()) event.preventDefault(); });
  $('registration-form').addEventListener('submit', register);
  $('refresh-button').addEventListener('click', () => refresh(true));
  $('retry-button').addEventListener('click', () => refresh(true));
  main.querySelectorAll('.logout-button').forEach(button => button.addEventListener('click', logout));
  $('copy-server').addEventListener('click', async () => {
    if (busy || !canDownload()) return;
    const address = $('server-address');
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(address.value);
      statusMessage('Serveradresse kopiert. Du kannst sie in der App einfügen.');
    } catch (_) { address.focus(); address.select(); statusMessage('Die Serveradresse ist markiert. Kopiere sie über das Auswahlmenü.'); }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(false); else clearTimeout(pollTimer); });
  window.addEventListener('pageshow', event => { if (event.persisted) refresh(false); });
  render();
  refresh(false);
})();
