import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

test("le chargeur exécute le fichier d'origine de lekacademy.com/enrick, sans repasser par la règle Vercel", () => {
  assert.match(loader, /^import '\/enrick\/assets\/index-Cswpr9qg\.js\?orig=1';$/m);
  assert.doesNotMatch(loader, /^import '\/enrick\/assets\/index-Cswpr9qg\.js';$/m, 'sans ?orig=1 le fichier se chargerait lui-même');
});

test("l'aperçu ne s'ajoute qu'à la vidéo de la page conférence, et jamais par-dessus un aperçu existant", () => {
  assert.match(loader, /querySelectorAll\('\.conf-video video:not\(\[poster\]\)'\)/);
  assert.match(loader, /'https:\/\/investprotrading\.fr\/conference-assets\/apercu-video-enrick\.jpg'/);
  assert.match(loader, /new MutationObserver\(ajouterApercu\)/, 'la vidéo apparaît après le chargement des données de la page');
});

test("l'image d'aperçu est la première image de la vidéo : un JPEG 16:9 léger", () => {
  assert.deepEqual([jpg[0], jpg[1]], [0xff, 0xd8]);
  const { width, height } = jpegSize(jpg);
  assert.equal(width * 9, height * 16, `${width}x${height} n'est pas au format 16:9 de la vidéo`);
  assert.ok(width >= 1280, `${width} px de large`);
  assert.ok(jpg.length < 250_000, `${jpg.length} octets`);
});
