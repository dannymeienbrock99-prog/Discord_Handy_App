/* Offline export only: original image bytes become local, document-owned URLs. */
(() => {
  'use strict';
  const root = document.getElementById('cb-website');
  const payload = document.getElementById('cb-offline-assets');
  const assets = JSON.parse(payload.textContent);
  const urls = new Map();

  function assetUrl(name) {
    if (urls.has(name)) return urls.get(name);
    const asset = assets[name];
    if (!asset) throw new Error('Eingebettete Datei fehlt: ' + name);
    const binary = atob(asset.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: asset.mime }));
    urls.set(name, url);
    return url;
  }

  document.querySelectorAll('[data-offline-src]').forEach(element => {
    element.setAttribute('src', assetUrl(element.dataset.offlineSrc));
  });
  document.querySelectorAll('[data-offline-href]').forEach(element => {
    element.setAttribute('href', assetUrl(element.dataset.offlineHref));
  });
  document.querySelectorAll('[data-offline-full-src]').forEach(element => {
    element.setAttribute('data-full-src', assetUrl(element.dataset.offlineFullSrc));
  });
  root.style.setProperty('--cb-marble', 'url("' + assetUrl('assets/marble-gold.webp') + '")');
  payload.remove();
})();
