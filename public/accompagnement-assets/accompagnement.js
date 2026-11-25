// Page « Accompagnement » : quelques questions, les coordonnées, puis l'agenda iClosed intégré dans la page.
// Les réponses restent dans la page (rien n'est enregistré). Les coordonnées servent uniquement à préremplir
// le formulaire de l'agenda iClosed, pour que la personne n'ait plus qu'à choisir son créneau.
(() => {
  'use strict';

  const AGENDA = 'https://app.iclosed.io/e/bectanse/strategy-call';
  const WIDGET_ICLOSED = 'https://app.iclosed.io/assets/widget.js';
  const TELEGRAM = 'https://t.me/+mAcBYu895IxiMTdk';

  const etapes = [
    { cle: 'niveau', nom: 'Ton niveau', titre: 'Où en es-tu en trading ?', aide: 'Il n’y a pas de mauvais point de départ.', choix: [
      { valeur: 'debutant', label: 'Je débute', detail: 'Je découvre encore les bases.' },
      { valeur: 'commence', label: 'J’ai déjà commencé', detail: 'J’ai quelques notions ou premières expériences.' },
      { valeur: 'pratique', label: 'Je pratique déjà', detail: 'Je veux structurer et faire progresser ma pratique.' }
    ] },
    { cle: 'objectif', nom: 'Ton objectif', titre: 'Que veux-tu améliorer en priorité ?', aide: 'Choisis ce qui compte le plus pour toi aujourd’hui.', choix: [
      { valeur: 'bases', label: 'Comprendre les bases', detail: 'Poser des repères solides.' },
      { valeur: 'methode', label: 'Structurer ma méthode', detail: 'Mieux organiser mon approche.' },
      { valeur: 'regularite', label: 'Gagner en régularité', detail: 'Tenir ma gestion du risque et ma discipline.' },
      { valeur: 'autonomie', label: 'Devenir autonome', detail: 'Prendre mes propres décisions, en confiance.' }
    ] },
    { cle: 'temps', nom: 'Ton temps', titre: 'Combien de temps peux-tu y consacrer chaque semaine ?', aide: 'Une estimation suffit.', choix: [
      { valeur: 'moins-3h', label: 'Moins de 3 heures' },
      { valeur: '3-6h', label: 'Entre 3 et 6 heures' },
      { valeur: 'plus-6h', label: 'Plus de 6 heures' }
    ] },
    { cle: 'engagement', nom: 'Ta motivation', titre: 'Es-tu prêt à t’investir sérieusement ?', aide: 'L’accompagnement demande de l’implication, du temps et de la constance.', choix: [
      { valeur: 'pret', label: 'Oui, je suis prêt', detail: 'Je veux avancer avec sérieux et régularité.' },
      { valeur: 'pas-encore', label: 'Pas pour le moment', detail: 'Je préfère continuer à suivre le canal.', pause: true }
    ] },
    { cle: 'coordonnees', nom: 'Tes coordonnées', titre: 'Où peut-on te joindre ?', aide: 'Ces informations servent uniquement à organiser ton appel.', formulaire: true },
    { cle: 'agenda', nom: 'Ton appel', titre: 'Choisis ton créneau', aide: 'Tes coordonnées sont déjà remplies : il ne te reste qu’à choisir le jour et l’heure qui t’arrangent.', agenda: true }
  ];

  // Indicatifs proposés. « zero » : le 0 du début d'un numéro national disparaît dans le format international.
  // « chiffres » : longueur exacte du numéro national (sans le 0), quand elle est connue.
  const pays = [
    ['FR', 'France', '33', '🇫🇷', { zero: true, chiffres: 9 }],
    ['BE', 'Belgique', '32', '🇧🇪', { zero: true }],
    ['CH', 'Suisse', '41', '🇨🇭', { zero: true }],
    ['LU', 'Luxembourg', '352', '🇱🇺'],
    ['CA', 'Canada', '1', '🇨🇦'],
    ['RE', 'La Réunion', '262', '🇷🇪', { zero: true, chiffres: 9 }],
    ['YT', 'Mayotte', '262', '🇾🇹', { zero: true, chiffres: 9 }],
    ['GP', 'Guadeloupe', '590', '🇬🇵', { zero: true, chiffres: 9 }],
    ['MQ', 'Martinique', '596', '🇲🇶', { zero: true, chiffres: 9 }],
    ['GF', 'Guyane', '594', '🇬🇫', { zero: true, chiffres: 9 }],
    ['PF', 'Polynésie française', '689', '🇵🇫'],
    ['NC', 'Nouvelle-Calédonie', '687', '🇳🇨'],
    ['MA', 'Maroc', '212', '🇲🇦', { zero: true }],
    ['DZ', 'Algérie', '213', '🇩🇿', { zero: true }],
    ['TN', 'Tunisie', '216', '🇹🇳'],
    ['SN', 'Sénégal', '221', '🇸🇳'],
    ['CI', 'Côte d’Ivoire', '225', '🇨🇮'],
    ['CM', 'Cameroun', '237', '🇨🇲'],
    ['CD', 'RD Congo', '243', '🇨🇩', { zero: true }],
    ['ES', 'Espagne', '34', '🇪🇸'],
    ['PT', 'Portugal', '351', '🇵🇹'],
    ['IT', 'Italie', '39', '🇮🇹'],
    ['DE', 'Allemagne', '49', '🇩🇪', { zero: true }],
    ['GB', 'Royaume-Uni', '44', '🇬🇧', { zero: true }],
    ['NL', 'Pays-Bas', '31', '🇳🇱', { zero: true }],
    ['US', 'États-Unis', '1', '🇺🇸'],
    ['AE', 'Émirats arabes unis', '971', '🇦🇪', { zero: true }],
    ['ID', 'Indonésie', '62', '🇮🇩', { zero: true }]
  ].map(([code, nom, indicatif, drapeau, regles]) => ({ code, nom, indicatif, drapeau, ...(regles || {}) }));
  const paysParCode = new Map(pays.map(p => [p.code, p]));

  const carte = document.querySelector('.apply');
  const ecran = carte && carte.querySelector('[data-screen]');
  if (!carte || !ecran) return;
  const compteur = carte.querySelector('[data-count]');
  const nomEtape = carte.querySelector('[data-step-name]');
  const bougies = Array.from(carte.querySelectorAll('.candles i'));
  const mouvementReduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const reponses = {};
  const contact = { prenom: '', nom: '', pays: 'FR', telephone: '', majeur: false };
  let courante = 0;
  let plusLoin = 0;
  let enPause = false;
  let verrou = false;
  let minuterieSecours = 0;

  const fleche = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
  const flecheSortie = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 16 16 8M9 8h7v7"/></svg>';
  const telegramIcone = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12"/><path d="m19.2 5.1-2.4 13.1c-.18.93-.73 1.16-1.48.72l-4.1-3.02-1.98 1.9c-.22.22-.4.4-.82.4l.3-4.23 7.72-6.98c.34-.3-.07-.47-.53-.17l-9.54 6.01-4.1-1.28c-.9-.28-.92-.9.19-1.31l16.03-6.18c.75-.28 1.4.18 1.15 1.03Z"/></svg>';

  function echapper(texte) {
    return String(texte).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  // ---------- Numéro de téléphone au format international (+33612345678), celui qu'attend l'agenda.
  function numeroInternational(codePays, saisie) {
    const texte = String(saisie || '').trim();
    const avecIndicatif = /^(\+|00)/.test(texte);
    let chiffres = texte.replace(/\D/g, '');
    if (avecIndicatif) {
      if (texte.startsWith('00')) chiffres = chiffres.slice(2);
      if (/^330/.test(chiffres)) chiffres = '33' + chiffres.slice(3);
      if (/^33/.test(chiffres) && chiffres.length !== 11) return null;
    } else {
      const p = paysParCode.get(codePays);
      if (!p) return null;
      if (p.zero) chiffres = chiffres.replace(/^0/, '');
      if (p.chiffres && chiffres.length !== p.chiffres) return null;
      if (chiffres.length < 4) return null;
      chiffres = p.indicatif + chiffres;
    }
    if (chiffres.length < 8 || chiffres.length > 15 || /^0/.test(chiffres)) return null;
    return '+' + chiffres;
  }

  // Prénom et nom pour l'agenda : il coupe au premier espace, donc les espaces d'un prénom composé deviennent insécables.
  function nomPourAgenda() {
    const prenom = contact.prenom.trim().replace(/\s+/g, '\u00A0');
    const nom = contact.nom.trim().replace(/\s+/g, ' ');
    return prenom + ' ' + nom;
  }

  function adresseAgenda() {
    const telephone = numeroInternational(contact.pays, contact.telephone);
    let adresse = AGENDA + '?iclosedName=' + encodeURIComponent(nomPourAgenda());
    if (telephone) adresse += '&iclosedPhone=' + encodeURIComponent(telephone);
    return adresse;
  }

  // ---------- Affichage des étapes
  function mettreAJourEntete(index) {
    const etape = etapes[index];
    compteur.textContent = 'Étape ' + (index + 1) + ' sur ' + etapes.length;
    nomEtape.textContent = etape.nom;
    bougies.forEach((bougie, i) => {
      bougie.classList.toggle('is-done', i < index);
      bougie.classList.toggle('is-current', i === index);
    });
  }

  function titreEtAide(titre, aide) {
    return '<h2 class="step-title" id="question" tabindex="-1">' + echapper(titre) + '</h2>' +
      (aide ? '<p class="step-hint" id="question-aide">' + echapper(aide) + '</p>' : '');
  }

  function rendreChoix(etape) {
    const options = etape.choix.map(option => {
      const choisi = reponses[etape.cle] === option.valeur;
      return '<button class="choice' + (choisi ? ' is-selected' : '') + '" type="button" data-valeur="' + echapper(option.valeur) + '" aria-pressed="' + choisi + '">' +
        '<span class="choice-text"><strong>' + echapper(option.label) + '</strong>' + (option.detail ? '<small>' + echapper(option.detail) + '</small>' : '') + '</span>' +
        '<span class="choice-mark" aria-hidden="true"></span></button>';
    }).join('');
    const pied = courante === 0
      ? '<p class="step-foot-note">Aucune information financière n’est demandée.</p>'
      : '<button class="back" type="button" data-retour>Retour</button>';
    return titreEtAide(etape.titre, etape.aide) +
      '<div class="choices" role="group" aria-labelledby="question"' + (etape.aide ? ' aria-describedby="question-aide"' : '') + '>' + options + '</div>' +
      '<div class="step-foot">' + pied + '</div>';
  }

  function optionsPays() {
    return pays.map(p => '<option value="' + p.code + '"' + (p.code === contact.pays ? ' selected' : '') + '>' + p.drapeau + ' ' + echapper(p.nom) + ' (+' + p.indicatif + ')</option>').join('') +
      '<option value="autre"' + (contact.pays === 'autre' ? ' selected' : '') + '>Autre pays (avec indicatif)</option>';
  }

  function rendreFormulaire(etape) {
    return titreEtAide(etape.titre, etape.aide) +
      '<form class="contact" novalidate>' +
        '<div class="field-row">' +
          champ('prenom', 'Prénom', 'text', 'given-name') +
          champ('nom', 'Nom', 'text', 'family-name') +
        '</div>' +
        '<div class="field">' +
          '<label for="telephone">Téléphone</label>' +
          '<div class="phone">' +
            '<span class="phone-country"><span class="phone-country-view" aria-hidden="true" data-pays-vue></span>' +
              '<select id="pays" name="pays" aria-label="Indicatif du pays">' + optionsPays() + '</select>' +
              '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></span>' +
            '<input id="telephone" name="telephone" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="24" required aria-describedby="telephone-erreur">' +
          '</div>' +
          '<p class="field-error" id="telephone-erreur" hidden></p>' +
        '</div>' +
        '<label class="check"><input type="checkbox" id="majeur" name="majeur" required aria-describedby="majeur-erreur"><span class="check-box" aria-hidden="true"></span><span>J’ai 18 ans ou plus</span></label>' +
        '<p class="field-error" id="majeur-erreur" hidden></p>' +
        '<button class="cta" type="submit"><span>Voir les créneaux</span><i class="cta-icon">' + fleche + '</i></button>' +
      '</form>' +
      '<div class="step-foot"><button class="back" type="button" data-retour>Retour</button></div>';
  }

  function champ(id, label, type, autocomplete) {
    return '<div class="field"><label for="' + id + '">' + label + '</label>' +
      '<input id="' + id + '" name="' + id + '" type="' + type + '" autocomplete="' + autocomplete + '" autocapitalize="words" maxlength="60" required aria-describedby="' + id + '-erreur">' +
      '<p class="field-error" id="' + id + '-erreur" hidden></p></div>';
  }

  function rendreAgenda(etape) {
    return titreEtAide(etape.titre, etape.aide) +
      '<div class="agenda-sheet" data-agenda></div>' +
      '<p class="agenda-help" data-agenda-aide>L’agenda ne s’affiche pas&nbsp;? <a href="' + AGENDA + '" target="_blank" rel="noopener">Ouvre-le dans un nouvel onglet</a></p>' +
      '<div class="step-foot"><button class="back" type="button" data-retour>Modifier mes coordonnées</button></div>';
  }

  function rendrePause() {
    return titreEtAide('Pas de souci, prends ton temps.', 'L’accompagnement demande de l’implication. Quand tu seras prêt, reviens sur cette page pour réserver ton appel. En attendant, continue de suivre mes analyses sur le canal.') +
      '<a class="cta cta-telegram" href="' + TELEGRAM + '" target="_blank" rel="noopener"><i class="cta-logo">' + telegramIcone + '</i><span>Retourner sur le canal Telegram</span><i class="cta-icon">' + flecheSortie + '</i></a>' +
      '<div class="step-foot"><button class="back" type="button" data-retour>Modifier ma réponse</button></div>';
  }

  function afficher(index, { historique = 'pousser', defiler = true } = {}) {
    clearTimeout(minuterieSecours);
    enPause = false;
    courante = index;
    plusLoin = Math.max(plusLoin, index);
    const etape = etapes[index];
    mettreAJourEntete(index);
    carte.dataset.step = etape.cle;
    ecran.innerHTML = etape.formulaire ? rendreFormulaire(etape) : etape.agenda ? rendreAgenda(etape) : rendreChoix(etape);
    if (etape.formulaire) preparerFormulaire();
    if (etape.agenda) installerAgenda();
    noterHistorique({ etape: index }, '#etape-' + (index + 1), historique);
    animerEtFocaliser(defiler);
  }

  function afficherPause({ historique = 'pousser', defiler = true } = {}) {
    clearTimeout(minuterieSecours);
    enPause = true;
    mettreAJourEntete(3);
    carte.dataset.step = 'pause';
    ecran.innerHTML = rendrePause();
    noterHistorique({ vue: 'pause' }, '#plus-tard', historique);
    animerEtFocaliser(defiler);
  }

  function noterHistorique(etat, ancre, mode) {
    try {
      if (mode === 'pousser') history.pushState(etat, '', ancre);
      else if (mode === 'remplacer') history.replaceState(etat, '', ancre);
    } catch (_) { /* Historique indisponible : la page fonctionne quand même. */ }
  }

  function animerEtFocaliser(defiler) {
    ecran.classList.remove('is-entering');
    void ecran.offsetWidth;
    ecran.classList.add('is-entering');
    if (!defiler) return;
    const haut = carte.getBoundingClientRect().top;
    if (haut < 0 || haut > window.innerHeight * 0.55) carte.scrollIntoView({ block: 'start', behavior: mouvementReduit ? 'auto' : 'smooth' });
    const titre = ecran.querySelector('.step-title');
    if (titre) titre.focus({ preventScroll: true });
  }

  // ---------- Formulaire des coordonnées
  function preparerFormulaire() {
    const formulaire = ecran.querySelector('form.contact');
    const prenom = formulaire.querySelector('#prenom');
    const nom = formulaire.querySelector('#nom');
    const choixPays = formulaire.querySelector('#pays');
    const telephone = formulaire.querySelector('#telephone');
    const majeur = formulaire.querySelector('#majeur');
    prenom.value = contact.prenom;
    nom.value = contact.nom;
    telephone.value = contact.telephone;
    majeur.checked = contact.majeur;
    afficherPays(choixPays.value);

    choixPays.addEventListener('change', () => { contact.pays = choixPays.value; afficherPays(choixPays.value); effacerErreur('telephone'); });
    prenom.addEventListener('input', () => { contact.prenom = prenom.value; effacerErreur('prenom'); });
    nom.addEventListener('input', () => { contact.nom = nom.value; effacerErreur('nom'); });
    telephone.addEventListener('input', () => { contact.telephone = telephone.value; effacerErreur('telephone'); });
    majeur.addEventListener('change', () => { contact.majeur = majeur.checked; effacerErreur('majeur'); });

    formulaire.addEventListener('submit', event => {
      event.preventDefault();
      const erreurs = [];
      if (!contact.prenom.trim()) erreurs.push(['prenom', 'Indique ton prénom.']);
      if (!contact.nom.trim()) erreurs.push(['nom', 'Indique ton nom.']);
      if (!contact.telephone.trim()) erreurs.push(['telephone', 'Indique ton numéro de téléphone.']);
      else if (!numeroInternational(contact.pays, contact.telephone)) {
        erreurs.push(['telephone', contact.pays === 'autre' && !/^\s*(\+|00)/.test(contact.telephone)
          ? 'Ajoute l’indicatif du pays au début du numéro, par exemple +44 7911 123456.'
          : 'Vérifie ton numéro : il semble incomplet ou contient une erreur.']);
      }
      if (!contact.majeur) erreurs.push(['majeur', 'L’appel est réservé aux personnes majeures.']);
      erreurs.forEach(([id, message]) => montrerErreur(id, message));
      if (erreurs.length) {
        const premier = ecran.querySelector('#' + erreurs[0][0]);
        if (premier) premier.focus();
        return;
      }
      afficher(etapes.findIndex(e => e.agenda));
    });
  }

  function afficherPays(code) {
    const vue = ecran.querySelector('[data-pays-vue]');
    const telephone = ecran.querySelector('#telephone');
    const p = paysParCode.get(code);
    if (vue) vue.textContent = p ? p.drapeau + ' +' + p.indicatif : '+ …';
    if (telephone) telephone.placeholder = code === 'FR' ? '06 12 34 56 78' : p ? 'Ton numéro' : '+44 7911 123456';
  }

  function montrerErreur(id, message) {
    const champSaisie = ecran.querySelector('#' + id);
    const zone = ecran.querySelector('#' + id + '-erreur');
    if (champSaisie) champSaisie.setAttribute('aria-invalid', 'true');
    if (zone) { zone.textContent = message; zone.hidden = false; }
  }

  function effacerErreur(id) {
    const champSaisie = ecran.querySelector('#' + id);
    const zone = ecran.querySelector('#' + id + '-erreur');
    if (champSaisie) champSaisie.removeAttribute('aria-invalid');
    if (zone) { zone.hidden = true; zone.textContent = ''; }
  }

  // ---------- Agenda iClosed intégré
  function installerAgenda() {
    const support = ecran.querySelector('[data-agenda]');
    const widget = document.createElement('div');
    widget.className = 'iclosed-widget';
    widget.setAttribute('data-url', adresseAgenda());
    widget.setAttribute('title', 'Agenda de réservation de ton appel');
    support.appendChild(widget);
    // Le script d'iClosed repère seul les nouveaux agendas ajoutés à la page ; il n'est chargé qu'une fois.
    if (!document.querySelector('script[data-agenda-iclosed]')) {
      const script = document.createElement('script');
      script.src = WIDGET_ICLOSED;
      script.async = true;
      script.setAttribute('data-agenda-iclosed', '');
      script.addEventListener('error', () => secoursAgenda());
      document.head.appendChild(script);
    }
    minuterieSecours = window.setTimeout(() => { if (!support.querySelector('iframe')) secoursAgenda(); }, 9000);
  }

  function secoursAgenda() {
    const support = ecran.querySelector('[data-agenda]');
    const aide = ecran.querySelector('[data-agenda-aide]');
    if (!support || support.querySelector('iframe')) return;
    support.classList.add('is-fallback');
    support.innerHTML = '<div class="agenda-fallback"><p>L’agenda n’a pas pu s’afficher ici.</p>' +
      '<a class="cta" href="' + AGENDA + '" target="_blank" rel="noopener"><span>Ouvrir l’agenda</span><i class="cta-icon">' + flecheSortie + '</i></a></div>';
    if (aide) aide.hidden = true;
  }

  // ---------- Interactions
  ecran.addEventListener('click', event => {
    const option = event.target.closest('.choice');
    if (option && !verrou) {
      const etape = etapes[courante];
      const choix = etape.choix.find(c => c.valeur === option.dataset.valeur);
      reponses[etape.cle] = choix.valeur;
      ecran.querySelectorAll('.choice').forEach(bouton => {
        const actif = bouton === option;
        bouton.classList.toggle('is-selected', actif);
        bouton.setAttribute('aria-pressed', String(actif));
      });
      verrou = true;
      window.setTimeout(() => {
        verrou = false;
        if (choix.pause) afficherPause();
        else afficher(courante + 1);
      }, mouvementReduit ? 60 : 280);
      return;
    }
    if (event.target.closest('[data-retour]')) {
      if (enPause) afficher(3);
      else if (courante > 0) afficher(courante - 1);
    }
  });

  window.addEventListener('popstate', event => {
    const etat = event.state;
    if (etat && etat.vue === 'pause' && reponses.engagement) { afficherPause({ historique: 'aucun' }); return; }
    const index = etat && Number.isInteger(etat.etape) ? etat.etape : 0;
    afficher(index <= plusLoin ? index : 0, { historique: 'aucun' });
  });

  // Au chargement : toujours la première question (les réponses ne sont pas gardées d'une visite à l'autre).
  afficher(0, { historique: 'aucun', defiler: false });
  noterHistorique({ etape: 0 }, location.pathname + location.search, 'remplacer');
})();
