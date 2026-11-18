(() => {
  'use strict';
  const dialog = document.getElementById('business-conference');
  const reminder = document.querySelector('[data-conference-open]');
  if (!dialog || !reminder) return;

  // Set data-enabled="false" or remove this module to retire the announcement.
  // Midnight is the announcement cutoff, not a claimed conference end time.
  const start = Date.parse(dialog.dataset.start);
  const expires = Date.parse(dialog.dataset.expires);
  const seenKey = 'enrick-conference-2026-11-18-21h';
  const status = dialog.querySelector('[data-conference-status]');
  let interval, autoOpen, restoreFocus;
  const active = () => dialog.dataset.enabled === 'true' && Number.isFinite(start) && Number.isFinite(expires) && Date.now() < expires;

  function close() {
    if (dialog.open) dialog.close();
  }

  function refresh() {
    if (!active()) {
      reminder.hidden = true;
      close();
      clearInterval(interval);
      clearTimeout(autoOpen);
      return false;
    }
    reminder.hidden = false;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    status.textContent = Date.now() >= start ? 'LA CONFÉRENCE A COMMENCÉ' : today === '2026-11-18' ? 'CE SOIR, ON SE RETROUVE' : 'RENDEZ-VOUS LE 18 NOVEMBRE';
    return true;
  }

  function open() {
    if (!refresh() || dialog.open) return;
    if (typeof dialog.showModal !== 'function') {
      location.assign(dialog.querySelector('.biz-conference-register').href);
      return;
    }
    restoreFocus = document.activeElement;
    dialog.showModal();
    document.documentElement.classList.add('biz-conference-open');
    try { sessionStorage.setItem(seenKey, '1'); } catch (_) { /* Storage can be unavailable in private browsers. */ }
  }

  reminder.addEventListener('click', open);
  dialog.querySelectorAll('[data-conference-close]').forEach(button => button.addEventListener('click', close));
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  });
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('biz-conference-open');
    const target = restoreFocus && restoreFocus !== document.body && restoreFocus.isConnected ? restoreFocus : reminder;
    if (active()) target.focus({ preventScroll: true });
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('pageshow', refresh);
  if (!refresh()) return;
  interval = setInterval(refresh, 30000);
  let seen = false;
  try { seen = sessionStorage.getItem(seenKey) === '1'; } catch (_) { /* Show once per page if storage is unavailable. */ }
  if (!seen) autoOpen = setTimeout(() => {
    // Never interrupt a visitor who already opened the quiz or an image.
    if (!document.hidden && !document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]') && !document.activeElement?.matches('input,textarea,select')) open();
  }, 1100);
})();
