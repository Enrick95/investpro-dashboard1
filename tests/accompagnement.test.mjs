import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";

// investprotrading.fr/accompagnement (version de test) : quelques questions, les coordonnées, puis l'agenda iClosed
// intégré à la page, prérempli avec le prénom, le nom et le téléphone.
const root = path.resolve(import.meta.dirname, "..");
const html = fs.readFileSync(path.join(root, "public/accompagnement.html"), "utf8");
const script = fs.readFileSync(path.join(root, "public/accompagnement-assets/accompagnement.js"), "utf8");
const css = fs.readFileSync(path.join(root, "public/accompagnement-assets/accompagnement.css"), "utf8");
const config = fs.readFileSync(path.join(root, "next.config.ts"), "utf8");

// Fonctions de mise en forme du numéro, extraites du script de la page.
function outilsTelephone() {
  const debut = script.indexOf("const pays = [");
  const fin = script.indexOf("const carte = ");
  const fonction = script.slice(script.indexOf("function numeroInternational"), script.indexOf("// Prénom et nom pour l'agenda"));
  const contexte = {};
  vm.runInNewContext(script.slice(debut, fin) + fonction + "this.numeroInternational = numeroInternational;", contexte);
  return contexte.numeroInternational;
}

test("la page est servie sur /accompagnement avec ses styles, son script et l'aperçu des liens", () => {
  assert.match(config, /\{source:"\/accompagnement",destination:"\/accompagnement\.html"\}/);
  assert.match(html, /<link rel="stylesheet" href="\/accompagnement-assets\/accompagnement\.css\?v=[\w-]+">/);
  assert.match(html, /<script defer src="\/accompagnement-assets\/accompagnement\.js\?v=[\w-]+"><\/script>/);
  assert.match(html, /<meta property="og:image" content="https:\/\/investprotrading\.fr\/business-assets\/enrick-portrait-vert\.jpg">/);
  assert.match(html, /Le trading comporte un risque de perte en capital\./);
  assert.match(css, /src:url\("\/business-assets\/biotif-700\.woff2"\)/, "la police de /business");
});

test("l'agenda est celui de l'appel stratégique, intégré par le script officiel d'iClosed, avec un lien de secours", () => {
  assert.match(script, /const AGENDA = 'https:\/\/app\.iclosed\.io\/e\/bectanse\/strategy-call';/);
  assert.match(script, /const WIDGET_ICLOSED = 'https:\/\/app\.iclosed\.io\/assets\/widget\.js';/);
  assert.match(script, /widget\.className = 'iclosed-widget';/);
  assert.match(script, /widget\.setAttribute\('data-url', adresseAgenda\(\)\);/);
  assert.match(script, /script\.addEventListener\('error', \(\) => secoursAgenda\(\)\);/);
  assert.match(script, /'<p class="agenda-help" data-agenda-aide>L’agenda ne s’affiche pas&nbsp;\? <a href="' \+ AGENDA \+ '"/, "lien direct toujours visible");
  assert.match(html, /<noscript>[\s\S]*https:\/\/app\.iclosed\.io\/e\/bectanse\/strategy-call[\s\S]*<\/noscript>/);
});

test("le préremplissage passe uniquement par l'adresse de l'agenda, jamais par l'adresse de la page", () => {
  assert.match(script, /AGENDA \+ '\?iclosedName=' \+ encodeURIComponent\(nomPourAgenda\(\)\)/);
  assert.match(script, /'&iclosedEmail=' \+ encodeURIComponent\(contact\.email\.trim\(\)\)/);
  assert.match(script, /'&iclosedPhone=' \+ encodeURIComponent\(telephone\)/);
  assert.doesNotMatch(script, /URLSearchParams/, "espaces encodés en %20 et non en +");
  // L'agenda coupe au premier espace : un prénom composé garde des espaces insécables.
  assert.match(script, /contact\.prenom\.trim\(\)\.replace\(\/\\s\+\/g, '\\u00A0'\)/);
  // L'historique du navigateur ne contient que le numéro de l'étape.
  const appels = script.match(/noterHistorique\(\{[^;]+;/g);
  assert.equal(appels.length, 3);
  for (const appel of appels) {
    assert.match(appel, /noterHistorique\(\{ (etape: (index|0)|vue: 'refus') \}, ('#etape-' \+ \(index \+ 1\)|'#non-eligible'|location\.pathname \+ location\.search), ('remplacer'|historique)\);/, appel);
  }
  assert.doesNotMatch(script, /localStorage|sessionStorage|document\.cookie|fetch\(/, "rien n'est enregistré ni envoyé par la page");
});

test("le numéro est mis au format international attendu par l'agenda", () => {
  const numero = outilsTelephone();
  const cas = [
    ["FR", "06 12 34 56 78", "+33612345678"],
    ["FR", "6.12.34.56.78", "+33612345678"],
    ["FR", "+33 (0)6 12 34 56 78", "+33612345678"],
    ["FR", "0033 6 12 34 56 78", "+33612345678"],
    ["FR", "06 12 34", null],
    ["FR", "06 12 34 56 78 9", null],
    ["RE", "0692 12 34 56", "+262692123456"],
    ["BE", "0470 12 34 56", "+32470123456"],
    ["CH", "079 123 45 67", "+41791234567"],
    ["CI", "07 07 12 34 56", "+2250707123456"],
    ["MA", "06 12 34 56 78", "+212612345678"],
    ["autre", "+44 7911 123456", "+447911123456"],
    ["autre", "7911 123456", null],
    ["FR", "", null],
  ];
  for (const [pays, saisie, attendu] of cas) assert.equal(numero(pays, saisie), attendu, `${pays} ${saisie}`);
});

test("les questions et la règle d'éligibilité sont celles de l'agenda iClosed", () => {
  // Questions et réponses de l'événement iClosed « Appel stratégique accompagnement Enrick » (bectanse/strategy-call),
  // et sa règle de non-éligibilité : « Non » OU « Non, pas pour le moment » OU « Moins de 500 € ».
  const iclosed = [
    ["Avant d’aller plus loin, confirmes-tu avoir 18 ans ou plus ?", ["Oui", "Non"], ["Non"]],
    ["Pour passer de l’envie à l’action, es-tu prêt(e) à suivre une méthode et à t’investir dans un accompagnement régulier ?", ["Oui, je suis prêt(e) à suivre un cadre", "Non, pas pour le moment"], ["Non, pas pour le moment"]],
    ["Quel budget es-tu prêt(e) à consacrer aujourd’hui pour progresser vers plus d’autonomie en trading, avec une méthode et un accompagnement ?", ["Moins de 500 €", "500 € à 999 €", "1 000 € ou plus"], ["Moins de 500 €"]],
  ];
  const debut = script.indexOf("const etapes = [");
  const fin = script.indexOf("];", debut) + 2;
  const contexte = {};
  vm.runInNewContext(script.slice(debut, fin) + "this.etapes = JSON.stringify(etapes);", contexte);
  const etapes = JSON.parse(contexte.etapes);
  const questions = etapes.filter(e => e.choix);
  assert.equal(questions.length, iclosed.length);
  questions.forEach((etape, i) => {
    const [titre, reponses, refus] = iclosed[i];
    assert.equal(etape.titre, titre);
    assert.deepEqual(etape.choix.map(c => c.label), reponses);
    assert.deepEqual(etape.choix.filter(c => c.refus).map(c => c.label), refus);
  });
  assert.deepEqual(etapes.slice(-2).map(e => e.cle), ["coordonnees", "agenda"], "l'agenda n'arrive qu'après les questions");
  // Non éligible : message sans agenda, et la visite reste sur ce message.
  assert.match(script, /if \(choix\.refus\) afficherRefus\(\);/);
  assert.match(script, /if \(nonEligible\) \{ afficherRefus\(\{ historique: 'remplacer', defiler \}\); return; \}/);
  const refus = script.slice(script.indexOf("function rendreRefus"), script.indexOf("function afficher("));
  assert.doesNotMatch(refus, /data-retour|AGENDA|iclosed/, "pas de retour arrière ni d'agenda pour une personne non éligible");
  assert.match(script, /if \(event\.target\.closest\('\[data-retour\]'\) && !nonEligible && courante > 0\)/);
});

test("les coordonnées demandées sont celles de l'agenda : prénom, nom, e-mail et téléphone", () => {
  for (const id of ["prenom", "nom", "email", "telephone"]) assert.match(script, new RegExp(`id="${id}"|champ\\('${id}'`), id);
  assert.match(script, /if \(!contact\.email\.trim\(\)\) erreurs\.push\(\['email', 'Indique ton adresse e-mail\.'\]\);/);
  assert.match(script, /else if \(!emailValide\(contact\.email\)\)/);
  assert.match(script, /if \(erreurs\.length\) \{/);
});

test("la carte reste visible à côté du texte sur ordinateur, sans recouvrir la suite de la page", () => {
  assert.match(html, /<div class="hero">[\s\S]*<section class="apply"[\s\S]*<\/section>\s*<\/div>\s*<section class="pillars"/, "la carte collante est limitée au haut de page");
  assert.match(css, /\.apply\{position:sticky;top:20px;/);
  assert.match(css, /\.apply\[data-step="agenda"\]\{position:relative;top:auto\}/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)/);
});
