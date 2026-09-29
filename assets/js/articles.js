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
    if (item.dataset.openProject) open(item.dataset.openProject, 1, item);
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
    document.body.classList.remove('dialog-open');
    trigger?.focus();
  });
})();
