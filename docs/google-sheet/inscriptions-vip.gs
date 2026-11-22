/**
 * Inscriptions VIP : le Google Sheet d'Enrick, mis à jour tout seul depuis investprotrading.fr.
 *
 * Installation, une seule fois :
 *   1. Dans le Google Sheet : Extensions › Apps Script.
 *   2. Efface tout ce qu'il y a dans la page, colle ce code, puis clique sur l'icône Enregistrer.
 *   3. En haut, choisis la fonction « installer » et clique sur « Exécuter ».
 *   4. Google demande l'autorisation : choisis ton compte, puis « Autoriser ».
 *
 * Ensuite, toutes les 5 minutes :
 *   - chaque nouvelle inscription s'ajoute en bas de l'onglet « Inscriptions VIP » (affiliation, rattachement ou abonnement) ;
 *   - chaque demande d'essai s'ajoute dans l'onglet « Essais VIP » ;
 *   - les lignes déjà là se mettent à jour : statut, dépôt vérifié, date de validation, suivi de l'essai.
 * Aucune ligne n'est supprimée. Pour tes notes à toi, ajoute des colonnes à droite : elles ne sont jamais touchées.
 * Le menu « Inscriptions VIP › Mettre à jour maintenant » lance la mise à jour tout de suite.
 */

var SITE = "https://investprotrading.fr/api/integrations/google-sheet";
var CLE = "COLLE_LA_CLE_ICI"; // Clé secrète de ton Sheet : ne partage pas ce code.

// [champ envoyé par le site, titre de la colonne, format]
var ONGLETS = [
  {
    cle: "inscriptions", nom: "Inscriptions VIP", colonnes: [
      ["date_inscription", "Date d’inscription", "date"],
      ["type", "Type"],
      ["prenom", "Prénom"],
      ["nom", "Nom"],
      ["email", "E-mail"],
      ["telephone", "Téléphone", "texte"],
      ["telegram", "Telegram"],
      ["broker", "Broker"],
      ["depot_declare", "Dépôt déclaré"],
      ["depot_verifie", "Dépôt vérifié", "dollars"],
      ["statut", "Statut"],
      ["date_validation", "Date de validation", "date"],
      ["id", "ID"]
    ]
  },
  {
    cle: "essais", nom: "Essais VIP", colonnes: [
      ["date_demande", "Date de la demande", "date"],
      ["prenom", "Prénom"],
      ["nom", "Nom"],
      ["email", "E-mail"],
      ["telephone", "Téléphone", "texte"],
      ["telegram", "Telegram"],
      ["broker", "Broker"],
      ["statut", "Statut"],
      ["canal_rejoint", "Canal Essai rejoint"],
      ["dernier_contact", "Dernier contact", "date"],
      ["prochaine_relance", "Prochaine relance", "jour"],
      ["id", "ID"]
    ]
  }
];

function installer() {
  synchroniser();
  ScriptApp.getProjectTriggers().forEach(function (declencheur) {
    if (declencheur.getHandlerFunction() === "synchroniser") ScriptApp.deleteTrigger(declencheur);
  });
  ScriptApp.newTrigger("synchroniser").timeBased().everyMinutes(5).create();
  var classeur = SpreadsheetApp.getActive();
  // La feuille vide créée avec le Sheet ne sert plus.
  classeur.getSheets().forEach(function (feuille) {
    var nom = feuille.getName();
    if ((nom === "Feuille 1" || nom === "Sheet1") && feuille.getLastRow() === 0 && classeur.getSheets().length > 1) classeur.deleteSheet(feuille);
  });
  classeur.toast("C’est installé : le Sheet se met à jour tout seul toutes les 5 minutes.", "Inscriptions VIP", 10);
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Inscriptions VIP").addItem("Mettre à jour maintenant", "synchroniser").addToUi();
}

function synchroniser() {
  var verrou = LockService.getScriptLock();
  if (!verrou.tryLock(30000)) return;
  try {
    var reponse = UrlFetchApp.fetch(SITE, { headers: { Authorization: "Bearer " + CLE }, muteHttpExceptions: true });
    var code = reponse.getResponseCode();
    if (code === 401) throw new Error("Le site refuse la clé : vérifie la ligne « var CLE » en haut du code.");
    if (code !== 200) throw new Error("Le site n’a pas répondu correctement (" + code + "). Nouvel essai dans 5 minutes.");
    var donnees = JSON.parse(reponse.getContentText());
    var classeur = SpreadsheetApp.getActive();
    ONGLETS.forEach(function (onglet, position) { ecrire(classeur, onglet, donnees[onglet.cle] || [], position); });
  } finally {
    verrou.releaseLock();
  }
}

function ecrire(classeur, onglet, lignes, position) {
  var feuille = classeur.getSheetByName(onglet.nom);
  var nouvelle = !feuille;
  if (nouvelle) feuille = classeur.insertSheet(onglet.nom, position);
  var n = onglet.colonnes.length;
  feuille.getRange(1, 1, 1, n).setValues([onglet.colonnes.map(function (c) { return c[1]; })]).setFontWeight("bold");
  feuille.setFrozenRows(1);

  // Les lignes déjà là, repérées par leur ID (dernière colonne, masquée).
  var derniere = feuille.getLastRow();
  var tableau = derniere > 1 ? feuille.getRange(2, 1, derniere - 1, n).getValues() : [];
  var index = {};
  tableau.forEach(function (ligne, i) { if (ligne[n - 1]) index[ligne[n - 1]] = i; });
  lignes.forEach(function (donnee) {
    if (!donnee.id) return;
    var valeurs = onglet.colonnes.map(function (c) { return valeur(donnee[c[0]], c[2]); });
    if (index.hasOwnProperty(donnee.id)) tableau[index[donnee.id]] = valeurs;
    else { index[donnee.id] = tableau.length; tableau.push(valeurs); }
  });
  if (!tableau.length) return;

  onglet.colonnes.forEach(function (c, j) {
    if (c[2] === "date") feuille.getRange(2, j + 1, tableau.length, 1).setNumberFormat("dd/MM/yyyy HH:mm");
    if (c[2] === "dollars") feuille.getRange(2, j + 1, tableau.length, 1).setNumberFormat("#,##0 \"$\"");
    if (c[2] === "jour") feuille.getRange(2, j + 1, tableau.length, 1).setNumberFormat("dd/MM/yyyy");
  });
  // Un texte qui commence par = + - @ (ou un numéro de téléphone) reste du texte : jamais une formule ni un nombre.
  var propre = tableau.map(function (ligne) {
    return ligne.map(function (cellule, j) {
      if (typeof cellule !== "string" || cellule === "") return cellule;
      return /^[=+\-@]/.test(cellule) || onglet.colonnes[j][2] === "texte" ? "'" + cellule : cellule;
    });
  });
  feuille.getRange(2, 1, propre.length, n).setValues(propre);
  feuille.hideColumns(n);
  if (nouvelle) feuille.autoResizeColumns(1, n - 1);
}

function valeur(v, format) {
  if (v === null || v === undefined || v === "") return "";
  if (format === "date") return new Date(v);
  if (format === "dollars") return Number(v);
  // Une date sans heure (AAAA-MM-JJ) : posée à midi, pour ne jamais glisser d'un jour selon le fuseau.
  if (format === "jour") { var p = String(v).split("-"); return p.length === 3 ? new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12) : String(v); }
  return String(v);
}
