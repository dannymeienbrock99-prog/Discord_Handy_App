(() => {
  const root = document.getElementById('cb-website');
  if (!root) return;
  const assetData = root.querySelector('[data-cb-assets]');
  if (assetData) {
    const assets = JSON.parse(assetData.textContent);
    root.querySelectorAll('[data-asset]').forEach(el => {
      if (assets[el.dataset.asset]) el.src = assets[el.dataset.asset];
    });
  }

  const motion = root.querySelector('[data-header-motion]');
  const still = root.querySelector('[data-header-still]');
  const toggle = root.querySelector('.cb-motion-toggle');
  if (motion && still && toggle) {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let paused = false;
    function setPaused(value) {
      paused = value;
      motion.hidden = value;
      still.hidden = !value;
      toggle.textContent = value ? 'Animation abspielen' : 'Animation pausieren';
      toggle.setAttribute('aria-pressed', String(value));
      if (motion.tagName === 'VIDEO') {
        if (value) motion.pause();
        else motion.play().catch(() => setPaused(true));
      }
    }
    toggle.addEventListener('click', () => setPaused(!paused));
    preference.addEventListener('change', event => setPaused(event.matches));
    setPaused(preference.matches);
  }

  root.querySelectorAll('[data-gallery]').forEach(gallery => {
    const picks = Array.from(gallery.querySelectorAll('[data-gallery-pick]'));
    const mainPhoto = gallery.querySelector('.cb-gallery-main');
    const caption = gallery.querySelector('[data-gallery-caption]');
    const counter = gallery.querySelector('.cb-gallery-count');
    const originalLink = gallery.querySelector('[data-gallery-original]');
    if (!mainPhoto || !caption || !counter) return;
    picks.forEach((button, index) => {
      button.addEventListener('click', () => {
        const source = button.querySelector('img');
        if (!source) return;
        mainPhoto.src = source.currentSrc || source.src;
        mainPhoto.alt = source.alt;
        mainPhoto.width = Number(source.getAttribute('width'));
        mainPhoto.height = Number(source.getAttribute('height'));
        caption.textContent = button.dataset.caption;
        counter.textContent = `${index + 1} / ${picks.length}`;
        counter.setAttribute('aria-label', `Bild ${index + 1} von ${picks.length}`);
        if (originalLink && button.dataset.fullSrc) originalLink.href = button.dataset.fullSrc;
        picks.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      });
    });
  });

  if (root.dataset.preview === 'true') {
    const pages = Array.from(root.querySelectorAll('[data-page]'));
    const banner = root.querySelector('[data-home-banner]');
    function showPage(name, hash, scroll) {
      const page = pages.find(item => item.dataset.page === name);
      if (!page) return;
      pages.forEach(item => { item.hidden = item !== page; });
      if (banner) banner.hidden = name !== 'home';
      root.querySelectorAll('[data-nav]').forEach(link => {
        if (link.dataset.nav === name) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
      if (scroll) {
        const target = hash ? root.querySelector(`[id="${hash}"]`) : root.querySelector('.cb-header-row');
        if (target) target.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
    }
    root.querySelectorAll('a[data-page-link]').forEach(link => {
      link.addEventListener('click', event => {
        event.preventDefault();
        const hash = (link.getAttribute('href').split('#')[1] || '');
        showPage(link.dataset.pageLink, hash, true);
      });
    });
    showPage(root.dataset.startPage || 'home', '', false);
  }
})();
