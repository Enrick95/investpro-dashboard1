// Page lekacademy.com/enrick : l'image d'aperçu de la vidéo, et une page qui tient bon quand le serveur redémarre.
// Une règle Vercel du projet lekacademy-enrick sert ce fichier à la place de /enrick/assets/index-Cswpr9qg.js,
// pour cette version exacte de la page uniquement : si la page est republiée, la règle ne s'applique plus d'elle-même.
// Le fichier d'origine est chargé tel quel juste après (le paramètre ?orig=1 passe à côté de la règle).
//
// Pourquoi les relances : le serveur de lekacademy.com démarre et s'arrête à la demande. Quand une visite tombe à ce
// moment-là, le chargement de la vidéo échoue (sur iPhone : triangle barré, la vidéo ne se lance plus), ou bien les
// informations de la conférence n'arrivent pas et la page reste sur un message d'erreur. Le navigateur ne réessaie
// pas de lui-même : ce fichier le fait, quelques fois, uniquement pour ces lectures.

const pageOrigine = '/enrick/assets/index-Cswpr9qg.js?orig=1';
const apercu = 'https://investprotrading.fr/conference-assets/apercu-video-enrick.jpg';
const attendre = ms => new Promise(resolve => setTimeout(resolve, ms));

// 1. Les informations de la conférence (lecture seule) : on réessaie si le serveur ne répond pas ou répond en erreur.
//    Les envois (inscription, code e-mail) ne sont jamais renvoyés automatiquement.
const lecturesConference = /^\/api\/conference(?:\?[^/#]*)?$|^\/api\/conference\/registration\/[^/?#]+$/;
const fetchOrigine = window.fetch.bind(window);
window.fetch = async function fetchConference(ressource, options) {
  const adresse = typeof ressource === 'string' ? ressource : ressource instanceof URL ? ressource.href : ressource && ressource.url;
  const methode = String((options && options.method) || (ressource instanceof Request && ressource.method) || 'GET').toUpperCase();
  if (methode !== 'GET' || typeof adresse !== 'string' || !lecturesConference.test(adresse)) return fetchOrigine(ressource, options);
  for (let essai = 1; ; essai += 1) {
    try {
      const reponse = await fetchOrigine(ressource, options);
      if (reponse.status < 500 || essai >= 4) return reponse;
    } catch (erreur) {
      if (essai >= 4) throw erreur;
    }
    await attendre(800 * essai);
  }
};

// 2. La vidéo : l'image d'aperçu, la copie servie par investprotrading.fr (réseau de diffusion de Vercel, sans le
//    serveur de lekacademy.com), puis de nouveaux essais si son chargement échoue, en reprenant là où la personne en était.
//    Si la copie ne répond pas, la vidéo repasse sur l'adresse d'origine.
const videoOrigine = 'https://lekacademy.com/enrick-presentation-hd.mp4';
const videoCopie = 'https://investprotrading.fr/conference-assets/enrick-presentation-hd.mp4';
const videosSuivies = new WeakSet();
let relancesVideo = 0;

function fiabiliserVideo(video) {
  const adresse = video.currentSrc || video.src || '';
  const lisible = !/\.mp4(?:[?#]|$)/i.test(adresse) || video.canPlayType('video/mp4; codecs="avc1.640028"') !== '';
  let essais = 0, position = 0, enLecture = false, reprise = null;
  video.addEventListener('timeupdate', () => { if (!video.seeking && video.currentTime > 0) position = video.currentTime; });
  video.addEventListener('play', () => { enLecture = true; });
  video.addEventListener('pause', () => { if (!video.error) enLecture = false; });
  video.addEventListener('ended', () => { enLecture = false; position = 0; });
  video.addEventListener('playing', () => { essais = 0; });

  function relancer() {
    if (!lisible) return;
    const surCopie = video.getAttribute('src') === videoCopie;
    if (!surCopie && (essais >= 5 || relancesVideo >= 15)) return;
    if (!surCopie) { essais += 1; relancesVideo += 1; }
    const instant = position, relire = enLecture;
    setTimeout(() => {
      if (reprise) video.removeEventListener('loadedmetadata', reprise);
      reprise = null;
      if (instant > 0 || relire) {
        reprise = () => {
          reprise = null;
          if (instant > 0) { try { video.currentTime = instant; } catch (_) { /* La vidéo repartira du début. */ } }
          if (relire) { const lecture = video.play(); if (lecture && lecture.catch) lecture.catch(() => {}); }
        };
        video.addEventListener('loadedmetadata', reprise, { once: true });
      }
      if (surCopie) video.setAttribute('src', videoOrigine);
      else video.load();
    }, surCopie ? 0 : 700 * essais);
  }

  video.addEventListener('error', relancer);
  if (video.error) relancer();
}

function preparerVideos() {
  for (const video of document.querySelectorAll('.conf-video video')) {
    if (videosSuivies.has(video)) continue;
    videosSuivies.add(video);
    if (!video.hasAttribute('poster')) video.setAttribute('poster', apercu);
    if (video.getAttribute('src') === videoOrigine) video.setAttribute('src', videoCopie);
    fiabiliserVideo(video);
  }
}

new MutationObserver(preparerVideos).observe(document.documentElement, { childList: true, subtree: true });

// 3. Enfin, la page elle-même (servie par le réseau de diffusion de Vercel, donc fiable ; un second essai au cas où).
import(pageOrigine).catch(() => attendre(1000).then(() => import(pageOrigine + '&essai=2')));
