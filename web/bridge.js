(function (root) {
  'use strict';
  const native = typeof root.NativeBridge === 'object' && typeof root.NativeBridge.loadState === 'function';
  const pending = new Map();
  let sequence = 0;
  function legacyDisabled() {
    return { ok: false, kind: 'permanent', message: 'Der frühere Webhook-Versand ist deaktiviert. Bitte mit Discord anmelden und ein neues Ziel auswählen.' };
  }
  function parse(value, fallback) {
    if (value && typeof value === 'object') return value;
    return value ? JSON.parse(value) : fallback;
  }
  root.__modstempelNativeResolve = function (id, result) {
    const waiter = pending.get(id);
    if (!waiter) return;
    pending.delete(id);
    clearTimeout(waiter.timeout);
    try { waiter.resolve(parse(result, { ok: false, message: 'Leere Antwort der App.' })); }
    catch (_) { waiter.resolve({ ok: false, kind: 'uncertain', message: 'Die Antwort konnte nicht gelesen werden.' }); }
  };
  function call(action, body) {
    if (!native) return Promise.resolve({ ok: false, kind: 'unconfigured', message: 'Die Verbindung zum App-Server steht in der installierten Android-App zur Verfügung.' });
    return new Promise(resolve => {
      const id = 'request-' + (++sequence) + '-' + Date.now();
      const mutation = action === 'operation_send' || action === 'operation_retry';
      // Native disconnects at 200/45 seconds; leave time for the bridge callback.
      const timeoutMs = action === 'operation_send' && body && body.imageRef ? 215000 : 50000;
      const timeout = action === 'export' || action === 'pick_image' ? null : setTimeout(() => {
        pending.delete(id);
        resolve({ ok: false, kind: mutation ? 'uncertain' : 'network', message: mutation ? 'Bestätigung fehlt. Bitte den Status dieses Auftrags aktualisieren; er wird nicht mit einer neuen ID gesendet.' : 'Zeitüberschreitung. Bitte erneut versuchen.' });
      }, timeoutMs);
      pending.set(id, { resolve, timeout });
      try { root.NativeBridge.call(id, action, JSON.stringify(body || {})); }
      catch (_) {
        clearTimeout(timeout); pending.delete(id);
        resolve({ ok: false, kind: mutation ? 'uncertain' : 'network', message: 'Die Anfrage konnte nicht abgeschlossen werden.' });
      }
    });
  }
  root.ModstempelBridge = {
    native,
    loadState() { return native ? root.NativeBridge.loadState() : (localStorage.getItem('modstempel-v2') || localStorage.getItem('modstempel-v1') || ''); },
    saveState(content) {
      if (native) {
        const result = parse(root.NativeBridge.saveState(content), { ok: false });
        if (!result.ok) throw new Error(result.message || 'Speichern auf dem Gerät fehlgeschlagen.');
      } else {
        const legacy = localStorage.getItem('modstempel-v1');
        if (legacy && !localStorage.getItem('modstempel-v1-archive')) localStorage.setItem('modstempel-v1-archive', legacy);
        localStorage.setItem('modstempel-v2', content);
      }
    },
    getConnection() { return { configured: false, ref: '', mask: '', legacyDisabled: true }; },
    storeWebhook() { throw new Error(legacyDisabled().message); },
    backendStatus() { return call('backend_status', {}); },
    configureBackend(url) { return call('configure_backend', { url }); },
    authBegin() { return call('auth_begin', {}); },
    authPoll() { return call('auth_poll', {}); },
    authCancel() { return call('auth_cancel', {}); },
    authLogout() { return call('auth_logout', {}); },
    openPortal() { return call('open_portal', {}); },
    guilds() { return call('guilds', {}); },
    guildSetup(guildId) { return call('guild_setup', { guildId }); },
    moderatorRole(guildId, roleId) { return call('moderator_role', { guildId, roleId }); },
    botInstall(guildId) { return call('bot_install', { guildId }); },
    scheduledEvents(guildId) { return call('scheduled_events', { guildId }); },
    operationSend(operation, imageRef) {
      const body = { operation };
      if (imageRef != null) body.imageRef = imageRef;
      return call('operation_send', body);
    },
    operationStatus(operationId) { return call('operation_status', { operationId }); },
    operationRetry(operationId, acknowledgeUncertain = false) { return call('operation_retry', { operationId, acknowledgeUncertain }); },
    pollResults(operationId) { return call('poll_results', { operationId }); },
    clock() {
      if (native && typeof root.NativeBridge.clock === 'function') return parse(root.NativeBridge.clock());
      return { wallMs: Date.now() };
    },
    send() { return Promise.resolve(legacyDisabled()); },
    pickImage() { return call('pick_image', {}); },
    discardImage(ref) { return call('remove_image', { ref }); },
    check() { return Promise.resolve(legacyDisabled()); },
    readPoll() { return Promise.resolve(legacyDisabled()); },
    openDiscord(target) { return call('open_discord', target); },
    async clipboard() {
      if (native) {
        const result = parse(root.NativeBridge.clipboard(), { ok: false });
        if (!result.ok) throw new Error(result.message || 'Bitte die Serveradresse über das Eingabefeld einfügen.');
        return result.text || '';
      }
      if (navigator.clipboard && navigator.clipboard.readText) return navigator.clipboard.readText();
      throw new Error('Bitte das Eingabefeld gedrückt halten und „Einfügen“ wählen.');
    },
    async exportFile(filename, mime, content) {
      if (native) {
        const result = await call('export', { filename, mime, content });
        if (!result.ok) throw new Error(result.message || 'Export abgebrochen.');
        return result;
      }
      const url = URL.createObjectURL(new Blob([content], { type: mime }));
      const link = document.createElement('a');
      link.href = url; link.download = filename; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return { ok: true };
    }
  };
}(window));
