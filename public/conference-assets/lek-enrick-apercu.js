// Aperçu de la vidéo de lekacademy.com/enrick (l'image affichée avant la lecture).
// Une règle Vercel du projet lekacademy-enrick sert ce fichier à la place de /enrick/assets/index-Cswpr9qg.js,
// pour cette version exacte de la page uniquement : si la page est republiée, la règle ne s'applique plus d'elle-même.
// Le fichier d'origine est chargé tel quel (le paramètre ?orig=1 passe à côté de la règle), puis l'aperçu est ajouté.
import '/enrick/assets/index-Cswpr9qg.js?orig=1';

const apercu = 'https://investprotrading.fr/conference-assets/apercu-video-enrick.jpg';

function ajouterApercu() {
  for (const video of document.querySelectorAll('.conf-video video:not([poster])')) video.setAttribute('poster', apercu);
}

ajouterApercu();
new MutationObserver(ajouterApercu).observe(document.documentElement, { childList: true, subtree: true });
