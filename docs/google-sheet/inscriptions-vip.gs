/**
 * Inscriptions VIP : le Google Sheet d'Enrick, mis à jour tout seul depuis investprotrading.fr.
 *
 * Installation, ou mise à jour de ce code :
 *   1. Dans le Google Sheet : Extensions › Apps Script.
 *   2. Cmd + A dans la page, colle ce code, puis Cmd + S.
 *   3. En haut, choisis la fonction « installer » et clique sur « Exécuter » (autorise si Google le demande).
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

// Mise en forme aux couleurs du VIP (noir, cuivre, champagne). Changer le numéro la fait réappliquer.
var VERSION_FORME = "3";
var ENTETE = { fond: "#1d1916", texte: "#f2dfc7", trait: "#cf865f" };
var LIGNE_PAIRE = "#faf6f1";
var TEXTE = "#1d1916";
var TEXTE_DOUX = "#7a716a";

// Pastilles de couleur selon la valeur de la cellule : [fond, texte].
var PASTILLES = {
  "Validé": ["#dcf2e3", "#17703a"],
  "À vérifier": ["#fdeccc", "#8f5400"],
  "Refusé": ["#fbdedb", "#a8231b"],
  "Paiement en échec": ["#fbdedb", "#a8231b"],
  "Annulé": ["#efedeb", "#8a847e"],
  "Affiliation": ["#f6e3d5", "#8a4524"],
  "Rattachement": ["#e2ebfb", "#21509e"],
  "Abonnement": ["#ece2fa", "#6338ad"],
  "Nouveau": ["#e2ebfb", "#21509e"],
  "Contacté": ["#fdeccc", "#8f5400"],
  "Démo branchée": ["#d9f1ee", "#0d6b63"],
  "Essai terminé": ["#ecebe9", "#57524d"],
  "Converti en VIP": ["#dcf2e3", "#17703a"],
  "Clos": ["#efedeb", "#8a847e"],
  "Oui": ["#dcf2e3", "#17703a"],
  "Non": ["#efedeb", "#8a847e"]
};

// [champ envoyé par le site, titre de la colonne, format, largeur, style]
// Styles : « pastille » (couleur selon la valeur), « fort » (gras), « doux » (gris), « centre ».
var ONGLETS = [
  {
    cle: "inscriptions", nom: "Inscriptions VIP", couleur: "#cf865f", colonnes: [
      ["date_inscription", "Date d’inscription", "date", 140, "doux"],
      ["type", "Type", "", 120, "pastille"],
      ["prenom", "Prénom", "", 120, "fort"],
      ["nom", "Nom", "", 140, "fort"],
      ["email", "E-mail", "", 230, ""],
      ["telephone", "Téléphone", "texte", 140, ""],
      ["telegram", "Telegram", "", 140, "doux"],
      ["broker", "Broker", "", 110, "centre"],
      ["depot_declare", "Dépôt déclaré", "", 130, "doux centre"],
      ["depot_verifie", "Dépôt vérifié", "dollars", 120, "centre"],
      ["statut", "Statut", "", 110, "pastille"],
      ["date_validation", "Date de validation", "date", 140, "doux"],
      ["id", "ID", "", 80, ""]
    ]
  },
  {
    cle: "essais", nom: "Essais VIP", couleur: "#0d6b63", colonnes: [
      ["date_demande", "Date de la demande", "date", 140, "doux"],
      ["prenom", "Prénom", "", 120, "fort"],
      ["nom", "Nom", "", 140, "fort"],
      ["email", "E-mail", "", 230, ""],
      ["telephone", "Téléphone", "texte", 140, ""],
      ["telegram", "Telegram", "", 140, "doux"],
      ["broker", "Broker", "", 110, "centre"],
      ["statut", "Statut", "", 130, "pastille"],
      ["canal_rejoint", "Canal Essai rejoint", "", 130, "pastille"],
      ["dernier_contact", "Dernier contact", "date", 140, "doux"],
      ["prochaine_relance", "Prochaine relance", "jour", 130, "centre"],
      ["id", "ID", "", 80, ""]
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
  var feuille = classeur.getSheetByName(onglet.nom) || classeur.insertSheet(onglet.nom, position);
  var n = onglet.colonnes.length;
  feuille.getRange(1, 1, 1, n).setValues([onglet.colonnes.map(function (c) { return c[1]; })]);

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

  if (tableau.length) {
    // Assez de lignes pour tout écrire (une feuille neuve en a 1 000).
    var manque = tableau.length + 1 - feuille.getMaxRows();
    if (manque > 0) feuille.insertRowsAfter(feuille.getMaxRows(), manque + 200);
    // Un texte qui commence par = + - @ (ou un numéro de téléphone) reste du texte : jamais une formule ni un nombre.
    var propre = tableau.map(function (ligne) {
      return ligne.map(function (cellule, j) {
        if (typeof cellule !== "string" || cellule === "") return cellule;
        return /^[=+\-@]/.test(cellule) || onglet.colonnes[j][2] === "texte" ? "'" + cellule : cellule;
      });
    });
    feuille.getRange(2, 1, propre.length, n).setValues(propre);
  }
  feuille.hideColumns(n);

  // La mise en forme est refaite quand le nombre de lignes change, ou quand VERSION_FORME change.
  var proprietes = PropertiesService.getDocumentProperties();
  var marque = VERSION_FORME + "/" + tableau.length + "/" + feuille.getMaxRows();
  if (proprietes.getProperty("forme_" + onglet.cle) !== marque) {
    mettreEnForme(feuille, onglet, tableau.length);
    proprietes.setProperty("forme_" + onglet.cle, marque);
  }
}

function mettreEnForme(feuille, onglet, nombre) {
  var n = onglet.colonnes.length;
  var max = feuille.getMaxRows();
  feuille.setHiddenGridlines(true);
  feuille.setTabColor(onglet.couleur);
  feuille.setFrozenRows(1);
  feuille.getRange(1, 1, max, n).setFontFamily("Inter").setFontSize(10).setVerticalAlignment("middle").setFontColor(TEXTE).setFontWeight("normal");
  feuille.setRowHeight(1, 40);
  if (max > 1) feuille.setRowHeights(2, max - 1, 28);

  // Une ligne sur deux en champagne très clair, en-tête noir avec un trait cuivre.
  feuille.getBandings().forEach(function (bande) { bande.remove(); });
  feuille.getRange(1, 1, Math.max(nombre + 1, 2), n).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false)
    .setHeaderRowColor(ENTETE.fond).setFirstRowColor("#ffffff").setSecondRowColor(LIGNE_PAIRE);
  feuille.getRange(1, 1, 1, n).setFontColor(ENTETE.texte).setFontWeight("bold").setWrap(true)
    .setBorder(null, null, true, null, null, null, ENTETE.trait, SpreadsheetApp.BorderStyle.SOLID_THICK);

  var regles = [];
  onglet.colonnes.forEach(function (c, j) {
    var style = c[4] || "";
    var colonne = feuille.getRange(2, j + 1, max - 1, 1);
    var centre = style.indexOf("centre") >= 0 || style.indexOf("pastille") >= 0;
    feuille.setColumnWidth(j + 1, c[3]);
    feuille.getRange(1, j + 1, max, 1).setHorizontalAlignment(centre ? "center" : "left");
    if (style.indexOf("doux") >= 0) colonne.setFontColor(TEXTE_DOUX);
    if (style.indexOf("fort") >= 0) colonne.setFontWeight("bold");
    if (c[2] === "date") colonne.setNumberFormat("dd/MM/yyyy HH:mm");
    if (c[2] === "jour") colonne.setNumberFormat("dd/MM/yyyy");
    if (c[2] === "dollars") {
      colonne.setNumberFormat("#,##0 \"$\"");
      regles.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0)
        .setFontColor("#17703a").setBold(true).setRanges([colonne]).build());
    }
    if (style.indexOf("pastille") >= 0) {
      Object.keys(PASTILLES).forEach(function (texte) {
        regles.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(texte)
          .setBackground(PASTILLES[texte][0]).setFontColor(PASTILLES[texte][1]).setBold(true)
          .setRanges([colonne]).build());
      });
    }
  });
  feuille.setConditionalFormatRules(regles);
  // Les flèches de tri et de filtre dans l'en-tête.
  if (!feuille.getFilter()) feuille.getRange(1, 1, max, n - 1).createFilter();
}

function valeur(v, format) {
  if (v === null || v === undefined || v === "") return "";
  if (format === "date") return new Date(v);
  if (format === "dollars") return Number(v);
  // Une date sans heure (AAAA-MM-JJ) : posée à midi, pour ne jamais glisser d'un jour selon le fuseau.
  if (format === "jour") { var p = String(v).split("-"); return p.length === 3 ? new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12) : String(v); }
  return String(v);
}
