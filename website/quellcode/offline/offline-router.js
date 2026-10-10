/* Offline export only: all six pages share one local HTML file. */
(() => {
  'use strict';
  const root = document.getElementById('cb-website');
  const pages = Array.from(root.querySelectorAll('[data-page]'));
  const banner = root.querySelector('[data-home-banner]');
  const titles = {
    home: 'Crazy_Batto – Hardware, Gaming & Team TABH',
    old: 'Mein altes Setup – Crazy_Batto',
    gaming: 'Mein Gaming-Setup – Crazy_Batto',
    software: 'Software – Batto OBS Tool | Crazy_Batto',
    discord: 'Crazy_Batto Discord App – Crazy_Batto',
    registration: 'Registrierung & Zugang – Crazy_Batto Discord App'
  };

  function readRoute() {
    let route;
    try { route = decodeURIComponent(window.location.hash.slice(1)); }
    catch (_) { route = ''; }
    const [name, anchor = ''] = route.split('/', 2);
    return Object.prototype.hasOwnProperty.call(titles, name)
      ? { name, anchor }
      : { name: 'home', anchor: '' };
  }

  function renderRoute(scroll) {
    const route = readRoute();
    pages.forEach(page => { page.hidden = page.dataset.page !== route.name; });
    if (banner) banner.hidden = route.name !== 'home';
    root.querySelectorAll('[data-nav]').forEach(link => {
      if (link.dataset.nav === route.name) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.title = titles[route.name];
    if (scroll) {
      const target = route.anchor ? document.getElementById(route.anchor) : document.getElementById('cb-top');
      if (target) target.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }

  root.querySelectorAll('a[data-page-link]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const route = link.getAttribute('href');
      if (window.location.hash === route) renderRoute(true);
      else window.location.hash = route;
    });
  });
  window.addEventListener('hashchange', () => renderRoute(true));
  renderRoute(Boolean(window.location.hash));
})();
