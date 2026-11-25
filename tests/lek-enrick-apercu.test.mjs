import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Chargeur servi à la place du fichier de la page lekacademy.com/enrick (règle Vercel du projet lekacademy-enrick) :
// image d'aperçu de la vidéo, et nouveaux essais quand le serveur de lekacademy.com redémarre pendant une visite.
const loader = readFileSync(new URL('../public/conference-assets/lek-enrick-apercu.js', import.meta.url), 'utf8');
const jpg = readFileSync(new URL('../public/conference-assets/apercu-video-enrick.jpg', import.meta.url));

function jpegSize(buffer) {
  for (let i = 2; i < buffer.length;) {
    if (buffer[i] !== 0xff) return null;
    const marker = buffer[i + 1], length = buffer.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { height: buffer.readUInt16BE(i + 5), width: buffer.readUInt16BE(i + 7) };
    i += 2 + length;
  }
  return null;
}

test("le chargeur exécute le fichier d'origine de la page, sans repasser par la règle Vercel", () => {
  assert.match(loader, /^const pageOrigine = '\/enrick\/assets\/index-Cswpr9qg\.js\?orig=1';$/m);
  assert.match(loader, /^import\(pageOrigine\)\.catch\(/m, 'chargé après la mise en place des nouveaux essais');
  assert.doesNotMatch(loader, /import\s*\(?\s*'\/enrick\/assets\/index-Cswpr9qg\.js'/, 'sans ?orig=1 le fichier se chargerait lui-même');
  assert.ok(loader.indexOf('window.fetch = ') < loader.indexOf('import(pageOrigine)'), 'les appels de la page passent déjà par les nouveaux essais');
});

test("seules les lectures des informations de la conférence sont réessayées, jamais une inscription", () => {
  assert.match(loader, /if \(methode !== 'GET' \|\| typeof adresse !== 'string' \|\| !lecturesConference\.test\(adresse\)\) return fetchOrigine\(ressource, options\);/);
  const lectures = new RegExp(loader.match(/const lecturesConference = \/(.+)\/;/)[1]);
  for (const adresse of ['/api/conference', '/api/conference?test=1', '/api/conference/registration/abc123']) assert.ok(lectures.test(adresse), adresse);
  for (const adresse of ['/api/conference/register', '/api/conference/registration/abc/verify', '/api/auth/session', '/api/member/dashboard']) assert.ok(!lectures.test(adresse), adresse);
  assert.match(loader, /if \(reponse\.status < 500 \|\| essai >= 4\) return reponse;/, 'quatre essais au plus');
});

test("la vidéo reçoit l'aperçu et se relance seule après une coupure, sans boucle sans fin", () => {
  assert.match(loader, /querySelectorAll\('\.conf-video video'\)/);
  assert.match(loader, /if \(!video\.hasAttribute\('poster'\)\) video\.setAttribute\('poster', apercu\);/, 'jamais par-dessus un aperçu existant');
  assert.match(loader, /'https:\/\/investprotrading\.fr\/conference-assets\/apercu-video-enrick\.jpg'/);
  assert.match(loader, /video\.addEventListener\('error', relancer\);/);
  assert.match(loader, /if \(!surCopie && \(essais >= 5 \|\| relancesVideo >= 15\)\) return;/, 'cinq nouveaux essais au plus');
  assert.match(loader, /video\.currentTime = instant/, 'reprise là où la personne en était');
  assert.match(loader, /new MutationObserver\(preparerVideos\)/, 'la vidéo apparaît après le chargement des données de la page');
});

test("la vidéo est servie par la copie d'investprotrading.fr, et repasse sur l'origine si la copie ne répond pas", () => {
  assert.match(loader, /^const videoOrigine = 'https:\/\/lekacademy\.com\/enrick-presentation-hd\.mp4';$/m);
  assert.match(loader, /^const videoCopie = 'https:\/\/investprotrading\.fr\/conference-assets\/enrick-presentation-hd\.mp4';$/m);
  assert.match(loader, /if \(video\.getAttribute\('src'\) === videoOrigine\) video\.setAttribute\('src', videoCopie\);/, 'seule la vidéo de la conférence est remplacée');
  assert.match(loader, /if \(surCopie\) video\.setAttribute\('src', videoOrigine\);/, "retour à l'origine si la copie manque");
});

test("la copie est téléchargée et vérifiée à chaque construction, sans jamais bloquer la mise en ligne", () => {
  const paquet = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(paquet.scripts.build, 'node scripts/copie-video-conference.mjs && next build');
  const script = readFileSync(new URL('../scripts/copie-video-conference.mjs', import.meta.url), 'utf8');
  assert.match(script, /const source = 'https:\/\/lekacademy\.com\/enrick-presentation-hd\.mp4';/);
  assert.match(script, /octets: 83_655_813, sha256: '11c0b44040d1dc8ccb0ae32c7d7f1a04f7033465f0679a92b69be8215a60b4ab'/, 'fichier vérifié avant publication');
  assert.match(script, /public', 'conference-assets', 'enrick-presentation-hd\.mp4'/);
  assert.doesNotMatch(script, /process\.exit\(|throw erreur/, 'la construction continue même si la copie échoue');
  const ignores = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.match(ignores, /^\/public\/conference-assets\/enrick-presentation-hd\.mp4$/m, 'la vidéo (84 Mo) reste hors de Git');
});

test("l'image d'aperçu est la première image de la vidéo : un JPEG 16:9 léger", () => {
  assert.deepEqual([jpg[0], jpg[1]], [0xff, 0xd8]);
  const { width, height } = jpegSize(jpg);
  assert.equal(width * 9, height * 16, `${width}x${height} n'est pas au format 16:9 de la vidéo`);
  assert.ok(width >= 1280, `${width} px de large`);
  assert.ok(jpg.length < 250_000, `${jpg.length} octets`);
});
