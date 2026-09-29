"use strict";
(() => {
  const $ = (selector) => document.querySelector(selector);
  const menus = [...document.querySelectorAll('[data-articles-menu]')];
  function closeArticleMenus(restoreFocus = false) {
    menus.filter(menu => menu.open).forEach(menu => {
      menu.querySelectorAll('details').forEach(item => { item.open = false; });
      menu.open = false;
      if (restoreFocus && menu.offsetParent !== null) menu.querySelector('summary').focus();
    });
  }
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-articles-menu]')) closeArticleMenus();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeArticleMenus(true);
  });
  if (!document.body.classList.contains('article-page')) return;

  // Match the main site's footer contacts on both article pages.
  document.querySelectorAll('[data-messengers]').forEach(host => {
    const labelled = host.dataset.messengers === 'labelled';
    host.classList.toggle('labelled', labelled);
    for (const [key, name] of [['telegram', 'Telegram'], ['max', 'MAX']]) {
      const link = document.createElement('a');
      link.href = window.ARTNAHODKA_CONFIG.contacts[key];
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', `Написать в ${name}`);
      const icon = document.createElement('img');
      icon.src = `../assets/images/brand/${key}.png`;
      icon.alt = '';
      icon.width = icon.height = 32;
      link.append(icon);
      if (labelled) {
        const label = document.createElement('span');
        label.textContent = name;
        link.append(label);
      }
      host.append(link);
    }
  });

  const menuButton = $('.menu-button');
  const mobileMenu = $('#mobile-nav');
  const closeMobileMenu = () => {
    mobileMenu.hidden = true;
    menuButton.setAttribute('aria-expanded', 'false');
  };
  menuButton.addEventListener('click', () => {
    mobileMenu.hidden = !mobileMenu.hidden;
    menuButton.setAttribute('aria-expanded', String(!mobileMenu.hidden));
  });
  mobileMenu.addEventListener('click', event => {
    if (event.target.closest('a')) closeMobileMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !mobileMenu.hidden) {
      closeMobileMenu();
      menuButton.focus();
    }
  });
  if ($('#year')) $('#year').textContent = new Date().getFullYear();
  const banner = $('#cookie-banner');
  if (banner) {
    let dismissed = false;
    try { dismissed = localStorage.getItem('artnahodka-essential-notice') === 'dismissed'; } catch {}
    banner.hidden = dismissed;
    $('#cookie-accept').addEventListener('click', () => {
      banner.hidden = true;
      try { localStorage.setItem('artnahodka-essential-notice', 'dismissed'); } catch {}
    });
    $('#cookie-settings').addEventListener('click', () => {
      banner.hidden = false;
      $('#cookie-accept').focus();
    });
  }

  // Progressive display keeps large topic galleries manageable; without JS all cards remain visible.
  document.querySelectorAll('[data-project-gallery]').forEach(gallery => {
    const cards = [...gallery.querySelectorAll('.article-project')];
    const filters = [...gallery.querySelectorAll('[data-project-filter]')];
    const more = gallery.querySelector('[data-project-more]');
    const count = gallery.querySelector('[data-project-count]');
    const batch = window.matchMedia('(max-width: 700px)').matches ? 10 : 9;
    let active = 'all', limit = batch;
    function render(focusNew = false) {
      const matching = cards.filter(card => active === 'all' || card.dataset.tags.split(' ').includes(active));
      const previouslyVisible = cards.filter(card => !card.hidden).length;
      const visible = new Set(matching.slice(0, limit));
      cards.forEach(card => { card.hidden = !visible.has(card); });
      filters.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.projectFilter === active)));
      more.hidden = matching.length <= limit;
      count.textContent = `Показано ${Math.min(limit, matching.length)} из ${matching.length}`;
      if (focusNew) matching[previouslyVisible]?.querySelector('.article-project__main').focus({ preventScroll: true });
    }
    filters.forEach(button => button.addEventListener('click', () => {
      active = button.dataset.projectFilter; limit = batch; render();
    }));
    more.addEventListener('click', () => { limit += batch; render(true); });
    render();
  });

  const dialog = $('#article-viewer');
  if (!dialog) return;
  const photo = $('#article-viewer-image');
  const caption = $('#article-viewer-caption');
  const position = $('#article-viewer-position');
  let group = [];
  let index = 0;
  let trigger = null;
  function display() {
    const item = group[index];
    photo.src = item.dataset.full;
    photo.alt = item.dataset.caption;
    caption.textContent = item.dataset.caption;
    position.textContent = `Изображение ${index + 1} / ${group.length}`;
  }
  function open(groupName, at, origin) {
    group = [...document.querySelectorAll('[data-photo-group]')].filter(item => item.dataset.photoGroup === groupName);
    if (!group.length) return;
    index = Math.min(at, group.length - 1);
    trigger = origin;
    display();
    dialog.showModal();
    document.body.classList.add('dialog-open');
  }
  document.addEventListener('click', event => {
    const item = event.target.closest('[data-photo-group], [data-open-project]');
    if (!item) return;
    if (item.dataset.openProject) open(item.dataset.openProject, Number(item.dataset.openIndex || 0), item);
    else {
      const items = [...document.querySelectorAll('[data-photo-group]')].filter(other => other.dataset.photoGroup === item.dataset.photoGroup);
      open(item.dataset.photoGroup, items.indexOf(item), item);
    }
  });
  function step(delta) {
    index = (index + delta + group.length) % group.length;
    display();
  }
  $('#article-viewer-prev').addEventListener('click', () => step(-1));
  $('#article-viewer-next').addEventListener('click', () => step(1));
  $('#article-viewer-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    if (!document.querySelector('dialog[open]')) document.body.classList.remove('dialog-open');
    trigger?.focus();
  });
})();
