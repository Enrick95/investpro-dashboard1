(() => {
  'use strict';
  // Invitation à la prochaine conférence, sans date : elle s'ouvre à l'arrivée sur la page, une fois par visite.
  // Pour la retirer : data-enabled="false" sur <dialog id="business-conference">.
  const dialog = document.getElementById('business-conference');
  if (!dialog || dialog.dataset.enabled !== 'true' || typeof dialog.showModal !== 'function') return;

  const seenKey = 'enrick-prochaine-conference';
  let restoreFocus;

  function close() {
    if (dialog.open) dialog.close();
  }

  function open() {
    if (dialog.open) return;
    restoreFocus = document.activeElement;
    dialog.showModal();
    document.documentElement.classList.add('biz-conference-open');
    try { sessionStorage.setItem(seenKey, '1'); } catch (_) { /* Stockage indisponible en navigation privée. */ }
  }

  dialog.querySelectorAll('[data-conference-close]').forEach(button => button.addEventListener('click', close));
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  });
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('biz-conference-open');
    if (restoreFocus && restoreFocus !== document.body && restoreFocus.isConnected) restoreFocus.focus({ preventScroll: true });
  });

  let seen = false;
  try { seen = sessionStorage.getItem(seenKey) === '1'; } catch (_) { /* Sans stockage, l'invitation s'affiche à chaque chargement. */ }
  if (seen) return;

  function openOnArrival() {
    // Page ouverte en arrière-plan : on attend que la personne la regarde.
    if (document.hidden) {
      document.addEventListener('visibilitychange', openOnArrival, { once: true });
      return;
    }
    // Jamais par-dessus une image agrandie, le formulaire d'accompagnement ou un champ en cours de saisie.
    if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]') || document.activeElement?.matches('input,textarea,select')) return;
    open();
  }

  setTimeout(openOnArrival, 800);
})();
