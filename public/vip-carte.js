/* Carte membre InvestPro Trading : rendu, nom en direct, états verrouillée / en vérification / active, ouverture animée. */
(function () {
  var STATUS = { locked: 'Verrouillée', pending: 'En vérification', unlocking: 'Ouverture', active: 'Active' };
  var SPOKEN = { locked: 'verrouillée, elle se débloque après validation', pending: 'en vérification par l’équipe', unlocking: 'en cours d’ouverture', active: 'active' };
  var FOOT = { locked: 'À débloquer', pending: 'Validation en cours', unlocking: 'Validation en cours' };

  function chart() {
    var out = '<svg class="ipcard-chart" viewBox="0 0 200 120" aria-hidden="true" focusable="false">';
    for (var i = 0; i < 9; i++) {
      var x = 10 + i * 22, mid = 92 - i * 8.5 + (i % 3 === 1 ? 7 : 0), h = 14 + (i % 2) * 7, up = i % 3 !== 1;
      out += '<line x1="' + (x + 4) + '" x2="' + (x + 4) + '" y1="' + (mid - h / 2 - 8) + '" y2="' + (mid + h / 2 + 8) + '" stroke="#F0C575" stroke-width="1.6"/>';
      out += '<rect x="' + x + '" y="' + (mid - h / 2) + '" width="8" height="' + h + '" rx="1.5" fill="' + (up ? '#F0C575' : 'none') + '" stroke="#F0C575" stroke-width="1.6"/>';
    }
    return out + '<polyline points="4,104 40,88 66,96 104,66 130,74 170,38 194,22" fill="none" stroke="#F6D48C" stroke-width="2.4" stroke-linejoin="round"/></svg>';
  }

  var TEMPLATE =
    '<div class="ipcard-face">' + chart() +
    '<div class="ipcard-top"><img class="ipcard-mark" src="/brand/investpro-mark.webp" alt="" width="282" height="284" decoding="async"><img class="ipcard-word" src="/brand/investpro-wordmark.webp" alt="" width="846" height="201" decoding="async">' +
    '<span class="ipcard-status"><svg class="ic-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path class="shackle" d="M8 11V8a4 4 0 0 1 8 0v3"/></svg><svg class="ic-ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg><span data-card-status></span></span></div>' +
    '<span class="ipcard-chip" aria-hidden="true"></span>' +
    '<div class="ipcard-mid"><span class="ipcard-label">Membre VIP</span><span class="ipcard-name is-empty" data-card-name>Ton nom ici</span></div>' +
    '<div class="ipcard-bot"><span data-card-foot></span><span data-card-no>N° ••••</span></div>' +
    '<span class="ipcard-burst" aria-hidden="true"></span></div>';

  function q(card, sel) { return card.querySelector(sel); }

  function fit(card) {
    var name = q(card, '[data-card-name]');
    if (!name) return;
    var width = card.clientWidth;
    if (!width) return;
    // Une ligne tant que le nom reste grand ; sinon deux lignes, toujours en entier.
    name.classList.remove('two');
    var size = width * 0.07, min = width * 0.05;
    name.style.fontSize = size + 'px';
    while (name.scrollWidth > name.clientWidth + 1 && size > min) {
      size -= 0.5;
      name.style.fontSize = size + 'px';
    }
    if (name.scrollWidth <= name.clientWidth + 1) return;
    name.classList.add('two');
    size = width * 0.056;
    name.style.fontSize = size + 'px';
    while ((name.scrollHeight > name.clientHeight + 1 || name.scrollWidth > name.clientWidth + 1) && size > width * 0.034) {
      size -= 0.5;
      name.style.fontSize = size + 'px';
    }
  }

  function speak(card) {
    var name = card._name || '';
    card.setAttribute('aria-label', 'Carte membre InvestPro Trading' + (name ? ' de ' + name : '') + ', ' + SPOKEN[card.dataset.state || 'locked'] +
      (card._number && card.dataset.state === 'active' ? ', numéro ' + card._number : ''));
  }

  function paint(card) {
    var state = card.dataset.state || 'locked';
    q(card, '[data-card-status]').textContent = STATUS[state];
    q(card, '[data-card-foot]').textContent = state === 'active' ? (card._since || 'Membre VIP') : FOOT[state];
    q(card, '[data-card-no]').textContent = state === 'active' && card._number ? 'N° ' + String(card._number).padStart(4, '0') : 'N° ••••';
    speak(card);
  }

  var observer = 'ResizeObserver' in window ? new ResizeObserver(function (entries) { entries.forEach(function (e) { fit(e.target); }); }) : null;

  var IPCard = {
    mount: function (card, state) {
      if (!card || card._mounted) return card;
      card._mounted = true;
      card.classList.add('ipcard');
      card.setAttribute('role', 'img');
      card.innerHTML = TEMPLATE;
      card.dataset.state = state || card.dataset.state || 'locked';
      paint(card);
      if (observer) observer.observe(card);
      return card;
    },
    name: function (card, first, last) {
      var full = ((first || '').trim() + ' ' + (last || '').trim()).trim().replace(/\s+/g, ' ');
      var el = q(card, '[data-card-name]');
      card._name = full;
      el.textContent = full || 'Ton nom ici';
      el.classList.toggle('is-empty', !full);
      fit(card);
      speak(card);
    },
    meta: function (card, info) {
      info = info || {};
      if (info.since) {
        var date = new Date(info.since);
        card._since = isNaN(date) ? '' : 'Membre depuis ' + date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric', timeZone: 'Europe/Paris' });
      }
      if (info.number) card._number = info.number;
      paint(card);
    },
    state: function (card, state) {
      card.dataset.state = state;
      paint(card);
    },
    /** Verrouillée → ouverture (cadenas qui s'ouvre, éclat, reflet) → active. */
    unlock: function (card) {
      return new Promise(function (resolve) {
        var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) { IPCard.state(card, 'active'); resolve(); return; }
        IPCard.state(card, 'unlocking');
        setTimeout(function () {
          IPCard.state(card, 'active');
          card.classList.add('just-opened');
          setTimeout(function () { card.classList.remove('just-opened'); resolve(); }, 900);
        }, 750);
      });
    },
    refit: function () { document.querySelectorAll('.ipcard').forEach(fit); }
  };

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(IPCard.refit);
  window.addEventListener('load', IPCard.refit);
  window.IPCard = IPCard;
})();
