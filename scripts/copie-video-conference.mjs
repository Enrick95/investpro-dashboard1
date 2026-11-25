// Copie de la vidéo de présentation de lekacademy.com/enrick, faite au moment de la construction du site.
// Sur lekacademy.com, la vidéo passe par un serveur qui démarre et s'arrête à la demande : sur iPhone, elle reste
// souvent bloquée (triangle barré). Servie ici, elle part du réseau de diffusion de Vercel, comme une image du site.
// Le chargeur de la page (public/conference-assets/lek-enrick-apercu.js) utilise cette copie et revient à la vidéo
// d'origine si la copie manque. La vidéo n'est pas dans Git (84 Mo) : elle est téléchargée et vérifiée à chaque construction.
// Ce script n'arrête jamais la construction : en cas de problème, il prévient et laisse la page sur la vidéo d'origine.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = 'https://lekacademy.com/enrick-presentation-hd.mp4';
const attendu = { octets: 83_655_813, sha256: '11c0b44040d1dc8ccb0ae32c7d7f1a04f7033465f0679a92b69be8215a60b4ab' };
const destination = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'conference-assets', 'enrick-presentation-hd.mp4');

const empreinte = donnees => createHash('sha256').update(donnees).digest('hex');
const conforme = donnees => donnees.length === attendu.octets && empreinte(donnees) === attendu.sha256;

async function copier() {
  if (existsSync(destination) && conforme(readFileSync(destination))) return 'déjà à jour';
  mkdirSync(dirname(destination), { recursive: true });
  for (let essai = 1; essai <= 3; essai += 1) {
    try {
      const reponse = await fetch(source, { signal: AbortSignal.timeout(120_000) });
      if (!reponse.ok) throw new Error(`réponse ${reponse.status}`);
      const donnees = Buffer.from(await reponse.arrayBuffer());
      if (!conforme(donnees)) throw new Error(`fichier différent de celui attendu (${donnees.length} octets)`);
      writeFileSync(destination + '.partiel', donnees);
      renameSync(destination + '.partiel', destination);
      return `copiée (${donnees.length} octets)`;
    } catch (erreur) {
      console.warn(`[vidéo conférence] essai ${essai} : ${erreur.message}`);
      await new Promise(resolve => setTimeout(resolve, 2000 * essai));
    }
  }
  rmSync(destination, { force: true });
  return 'non copiée : la page gardera la vidéo de lekacademy.com';
}

try {
  console.log(`[vidéo conférence] ${await copier()}`);
} catch (erreur) {
  console.warn(`[vidéo conférence] copie impossible (${erreur.message}) : la page gardera la vidéo de lekacademy.com`);
}
