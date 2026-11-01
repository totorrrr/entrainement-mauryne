/* =====================================================================
   FICHE COACH — Synchronisation téléphone / ordinateur
   À coller dans : Google Sheets > Extensions > Apps Script
   ---------------------------------------------------------------------
   1. Change le code secret ci-dessous (un mot de passe à toi, sans espace).
   2. Déployer > Nouveau déploiement > Application Web
      - Exécuter en tant que : Moi
      - Qui a accès : Tout le monde
   3. Copie l'URL obtenue (elle finit par /exec) dans le site (nuage « Synchro »).
   ===================================================================== */

const CODE_SECRET = "change-moi";

const FICHES_ENTETE = ["Id", "Titre", "Cours", "Description", "Exercices", "Durée", "Modifiée le", "_data", "_maj"];
const MORCEAU = 40000; // une case Google Sheets accepte 50 000 caractères max : on découpe au-delà

const HEURES_ENTETE = ["Date", "Jour", "Statut", "Début 1", "Fin 1", "Début 2", "Fin 2",
  "Total (h)", "Cours co (h)", "Plateau (h)", "Autres (h)", "Formation (h)", "Note", "_data", "_maj"];

function doGet(e) {
  const p = (e && e.parameter) || {};
  // Ouvert dans un navigateur sans code : simple page de test
  if (!p.code) return ContentService.createTextOutput("OK : le script Fiche Coach fonctionne (version 3). Tu peux coller cette adresse dans le site.");
  return repondre(traiter(p));
}

function doPost(e) {
  let p = {};
  try { p = JSON.parse(e.postData.contents); } catch (err) { return repondre({ ok: false, error: "json" }); }
  return repondre(traiter(p));
}

function repondre(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function feuille(nom, entete) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(nom);
  if (!sh) {
    sh = ss.insertSheet(nom);
    sh.getRange(1, 1, 1, entete.length).setValues([entete])
      .setFontWeight("bold").setBackground("#ff4f8b").setFontColor("#ffffff");
    sh.setFrozenRows(1);
  }
  return sh;
}

function traiter(p) {
  if (String(p.code || "").trim() !== String(CODE_SECRET).trim()) return { ok: false, error: "code" };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const shR = feuille("Réglages", ["Clé", "Valeur", "_maj"]);
    const shH = feuille("Heures", HEURES_ENTETE);
    const shF = feuille("Fiches", FICHES_ENTETE);
    if (p.action === "set") {
      ecrireReglages(shR, p.kv || {});
      ecrireHeures(shH, p.days || {});
      ecrireFiches(shF, p.fiches || {});
    }
    return { ok: true, kv: lireReglages(shR), days: lireHeures(shH), fiches: lireFiches(shF), now: Date.now() };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Réglages (exercices perso, remarques, fiche en cours…) ---------- */
/* Une valeur trop longue est rangée sur plusieurs lignes : « clé », « clé#2 », « clé#3 »… */
function lireReglages(sh) {
  const out = {}, morceaux = {};
  const n = sh.getLastRow();
  if (n < 2) return out;
  sh.getRange(2, 1, n - 1, 3).getDisplayValues().forEach(function (r) {
    if (!r[0]) return;
    const m = r[0].match(/^(.*)#(\d+)$/);
    if (m) { (morceaux[m[1]] = morceaux[m[1]] || [])[Number(m[2])] = r[1]; return; }
    out[r[0]] = { v: r[1], u: Number(r[2]) || 0 };
  });
  Object.keys(out).forEach(function (cle) {
    const suite = morceaux[cle];
    if (suite) for (let i = 2; i < suite.length; i++) out[cle].v += (suite[i] || "");
  });
  return out;
}

function ecrireReglages(sh, kv) {
  Object.keys(kv).forEach(function (cle) {
    const item = kv[cle];
    const n = sh.getLastRow();
    const lignes = n > 1 ? sh.getRange(2, 1, n - 1, 3).getDisplayValues() : [];
    const idx = lignes.findIndex(function (r) { return r[0] === cle; });
    if (idx > -1 && Number(item.u) < (Number(lignes[idx][2]) || 0)) return; // version enregistrée plus récente
    const v = String(item.v), parts = [];
    for (let i = 0; i < v.length || i === 0; i += MORCEAU) parts.push(v.slice(i, i + MORCEAU));
    parts.forEach(function (txt, i) {
      const nom = i === 0 ? cle : cle + "#" + (i + 1);
      const j = lignes.findIndex(function (r) { return r[0] === nom; });
      const num = j > -1 ? j + 2 : sh.getLastRow() + 1;
      const rg = sh.getRange(num, 1, 1, 3);
      rg.setNumberFormat("@");
      rg.setValues([[nom, txt, String(item.u)]]);
      if (j === -1) lignes.push([nom, txt, String(item.u)]);
    });
    // vider les anciens morceaux en trop
    lignes.forEach(function (r, i) {
      const m = r[0].match(/^(.*)#(\d+)$/);
      if (m && m[1] === cle && Number(m[2]) > parts.length) sh.getRange(i + 2, 2).setValue("");
    });
  });
}

/* ---------- Heures : une ligne par jour, lisible dans le tableur ---------- */
function lireHeures(sh) {
  const out = {};
  const n = sh.getLastRow();
  if (n < 2) return out;
  sh.getRange(2, 1, n - 1, HEURES_ENTETE.length).getDisplayValues().forEach(function (r) {
    if (r[0]) out[r[0]] = { v: r[13], u: Number(r[14]) || 0 };
  });
  return out;
}

function ecrireHeures(sh, days) {
  const isos = Object.keys(days);
  if (!isos.length) return;
  const n = sh.getLastRow();
  const existant = n > 1 ? sh.getRange(2, 1, n - 1, HEURES_ENTETE.length).getDisplayValues() : [];
  const index = {};
  existant.forEach(function (r, i) { if (r[0]) index[r[0]] = i; });

  isos.forEach(function (iso) {
    const d = days[iso];
    const lisible = (d.row && d.row.length === 12) ? d.row : ["", "", "", "", "", "", "", "", "", "", "", ""];
    const ligne = [iso].concat(lisible).concat([String(d.v), String(d.u)]);
    let num;
    if (index[iso] !== undefined) {
      if (Number(d.u) < (Number(existant[index[iso]][14]) || 0)) return; // déjà plus récent
      num = index[iso] + 2;
    } else {
      num = sh.getLastRow() + 1;
      index[iso] = num - 2;
      existant[num - 2] = ligne;
    }
    const rg = sh.getRange(num, 1, 1, HEURES_ENTETE.length);
    rg.setNumberFormat("@");
    sh.getRange(num, 8, 1, 5).setNumberFormat("0.00");
    rg.setValues([ligne]);
    existant[num - 2] = ligne.map(String);
  });

  // tri par date + colonnes techniques discrètes
  const total = sh.getLastRow();
  if (total > 2) sh.getRange(2, 1, total - 1, HEURES_ENTETE.length).sort(1);
  sh.getRange(1, 14, Math.max(total, 1), 2).setFontColor("#bbbbbb");
}

/* ---------- Fiches enregistrées : une ligne par fiche ---------- */
function lireFiches(sh) {
  const out = {};
  const n = sh.getLastRow();
  if (n < 2) return out;
  sh.getRange(2, 1, n - 1, FICHES_ENTETE.length).getDisplayValues().forEach(function (r) {
    if (r[0]) out[r[0]] = { v: r[7], u: Number(r[8]) || 0 };
  });
  return out;
}

function ecrireFiches(sh, fiches) {
  const ids = Object.keys(fiches);
  if (!ids.length) return;
  const n = sh.getLastRow();
  const existant = n > 1 ? sh.getRange(2, 1, n - 1, FICHES_ENTETE.length).getDisplayValues() : [];
  const index = {};
  existant.forEach(function (r, i) { if (r[0]) index[r[0]] = i; });
  ids.forEach(function (id) {
    const f = fiches[id];
    const lisible = (f.row && f.row.length === 6) ? f.row : ["", "", "", "", "", ""];
    const ligne = [id].concat(lisible).concat([String(f.v), String(f.u)]).map(String);
    let num;
    if (index[id] !== undefined) {
      if (Number(f.u) < (Number(existant[index[id]][8]) || 0)) return;
      num = index[id] + 2;
    } else {
      num = sh.getLastRow() + 1;
      index[id] = num - 2;
    }
    const rg = sh.getRange(num, 1, 1, FICHES_ENTETE.length);
    rg.setNumberFormat("@");
    rg.setValues([ligne]);
    existant[num - 2] = ligne;
  });
  sh.getRange(1, 8, Math.max(sh.getLastRow(), 1), 2).setFontColor("#bbbbbb");
}

/* Pour tester dans l'éditeur : sélectionne « test » puis Exécuter. */
function test() {
  Logger.log(JSON.stringify(traiter({ code: CODE_SECRET, action: "get" })).slice(0, 500));
}
