// utils/tableur.js
// Lecture directe des tableaux (Excel, CSV, tableaux Word) envoyes en texte par l'application :
// emplois du temps, cahiers d'appel, frais, sanctions. Aucune lecture automatique (IA) n'est
// necessaire quand le tableau a des colonnes reconnaissables ; sinon la fonction renvoie null
// et la route passe a la lecture automatique (PDF scannes, photos, documents libres).

const sansAccent = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").toLowerCase().trim();

// CSV (avec guillemets et retours a la ligne dans les cellules)
function lireCsv(texte) {
  const lignes = [];
  let ligne = [];
  let cellule = "";
  let guillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (guillemets) {
      if (c === '"' && texte[i + 1] === '"') {
        cellule += '"';
        i++;
      } else if (c === '"') guillemets = false;
      else cellule += c;
    } else if (c === '"') guillemets = true;
    else if (c === ",") {
      ligne.push(cellule);
      cellule = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texte[i + 1] === "\n") i++;
      ligne.push(cellule);
      lignes.push(ligne);
      ligne = [];
      cellule = "";
    } else cellule += c;
  }
  if (cellule || ligne.length) {
    ligne.push(cellule);
    lignes.push(ligne);
  }
  return lignes;
}

/** Feuilles d'un texte envoye par l'application : « Feuille « nom » » ou « [nom] », puis CSV ou lignes « a | b | c » (Word). */
function feuilles(texte) {
  const res = [];
  let nom = "";
  let bloc = [];
  const fin = () => {
    const t = bloc.join("\n");
    if (t.trim()) {
      const tableau = t.includes(" | ") && !t.includes(",") ? t.split("\n").map((l) => l.split(" | ")) : lireCsv(t);
      res.push({ nom, lignes: tableau.map((l) => l.map((c) => String(c ?? "").trim())).filter((l) => l.some(Boolean)) });
    }
    bloc = [];
  };
  for (const l of String(texte || "").split("\n")) {
    const m = l.match(/^\s*Feuille « (.+) »\s*$/) || l.match(/^\s*\[([^\],]+)\]\s*$/);
    if (m) {
      fin();
      nom = m[1].trim();
    } else bloc.push(l);
  }
  fin();
  return res;
}

// Ligne d'en-tete : la premiere ligne dont les cellules repondent a toutes les colonnes demandees
function entete(lignes, colonnes) {
  for (let i = 0; i < Math.min(lignes.length, 15); i++) {
    const cellules = lignes[i].map(sansAccent);
    const pos = {};
    for (const [cle, motif] of Object.entries(colonnes)) {
      const k = cellules.findIndex((c) => motif.test(c));
      if (k >= 0) pos[cle] = k;
    }
    if (Object.keys(colonnes).every((c) => c.endsWith("?") || pos[c] !== undefined)) return { ligne: i, pos };
  }
  return null;
}

const MOIS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
/** Date ISO (AAAA-MM-JJ) a partir de « 02/11/2026 », « 2026-11-02 » ou « 15 octobre 2026 ». */
function dateIso(t) {
  const s = sansAccent(t);
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/(\d{1,2})(?:er)?\s+([a-z]+)\s+(\d{4})/);
  if (m && MOIS.includes(m[2])) return `${m[3]}-${String(MOIS.indexOf(m[2]) + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}
const heure = (t) => {
  const m = String(t || "").match(/(\d{1,2})\s*[h:H]\s*(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
};

// Nom de la classe indique dans le titre d'une feuille ou dans le nom du fichier
function classeDuTitre(lignes, nomFeuille, nomFichier) {
  const titre = lignes.slice(0, 4).map((l) => l.join(" ")).join(" ");
  const m = titre.match(/(?:emploi du temps|cahier d.appel|classe)\s*[·:–-]\s*([^·:–\n]+?)\s*(?:·|–|$|\s-\s)/i);
  if (m) return m[1].trim();
  if (nomFeuille && !/^(feuil|sheet|tous|toutes|recap)/i.test(nomFeuille)) return nomFeuille;
  const f = String(nomFichier || "").replace(/\.[a-z0-9]+$/i, "").replace(/^(emploi-du-temps|edt|cahier-d-appel|cahier-appel)-/i, "").replace(/-(novembre|octobre|decembre|janvier|fevrier|mars|avril|mai|juin|septembre)-\d{4}$/i, "");
  return f ? f.replace(/-/g, " ") : "";
}

const JOURS = { lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6 };

/** Emplois du temps : grille (jours en colonnes, horaires en lignes) ou liste (Classe, Jour, Debut, Fin, Matiere). */
function emplois(texte, nomFichier) {
  const classes = [];
  for (const f of feuilles(texte)) {
    // liste
    const liste = entete(f.lignes, { classe: /^classe/, jour: /^jour/, debut: /^(debut|heure de debut|de)$/, fin: /^(fin|heure de fin|a)$/, matiere: /^(matiere|discipline|cours)/, "salle?": /^salle/ });
    if (liste) {
      const parClasse = new Map();
      for (const l of f.lignes.slice(liste.ligne + 1)) {
        const jour = JOURS[sansAccent(l[liste.pos.jour])];
        const c = { jour: l[liste.pos.jour], debut: heure(l[liste.pos.debut]), fin: heure(l[liste.pos.fin]), matiere: l[liste.pos.matiere], salle: liste.pos["salle?"] !== undefined ? l[liste.pos["salle?"]] : "" };
        if (!jour || !c.debut || !c.fin || !c.matiere) continue;
        const nom = l[liste.pos.classe];
        if (!parClasse.has(nom)) parClasse.set(nom, []);
        parClasse.get(nom).push(c);
      }
      for (const [classe, creneaux] of parClasse) classes.push({ classe, creneaux });
      continue;
    }
    // grille
    let h = -1;
    let cols = [];
    for (let i = 0; i < Math.min(f.lignes.length, 15); i++) {
      const c = f.lignes[i].map((x, k) => [JOURS[sansAccent(x)], k]).filter(([j]) => j);
      if (c.length >= 3) {
        h = i;
        cols = c;
        break;
      }
    }
    if (h < 0) continue;
    const creneaux = [];
    for (const l of f.lignes.slice(h + 1)) {
      const m = l.join(" ").match(/(\d{1,2})\s*[h:]\s*(\d{2})\s*[–—-]\s*(\d{1,2})\s*[h:]\s*(\d{2})/);
      if (!m) continue;
      for (const [jour, k] of cols) {
        const cellule = String(l[k] || "").trim();
        const matiere = cellule.split(/\n/)[0].trim();
        if (!matiere || /^(recreation|pause|-|–|—)$/i.test(sansAccent(matiere))) continue;
        creneaux.push({ jour: Object.keys(JOURS)[jour - 1], debut: `${m[1].padStart(2, "0")}:${m[2]}`, fin: `${m[3].padStart(2, "0")}:${m[4]}`, matiere, salle: "" });
      }
    }
    if (creneaux.length) classes.push({ classe: classeDuTitre(f.lignes, f.nom, nomFichier), creneaux });
  }
  return classes.length ? { classes } : null;
}

/** Cahier d'appel : colonnes Date, (Heure), Nom, (Prenom), (Classe). */
function absences(texte, nomFichier) {
  const res = [];
  let classeDoc = "";
  for (const f of feuilles(texte)) {
    const e = entete(f.lignes, { date: /^date/, nom: /^(nom|eleve|noms)/, "prenom?": /^prenom/, "heure?": /^(heure|horaire)/, "classe?": /^classe/ });
    if (!e) continue;
    const classeF = classeDuTitre(f.lignes, f.nom, nomFichier);
    classeDoc ||= classeF;
    for (const l of f.lignes.slice(e.ligne + 1)) {
      const date = dateIso(l[e.pos.date]);
      const nom = l[e.pos.nom];
      if (!date || !nom) continue;
      res.push({ date, heure: e.pos["heure?"] !== undefined ? heure(l[e.pos["heure?"]]) : "", nom, prenom: e.pos["prenom?"] !== undefined ? l[e.pos["prenom?"]] : "", classe: e.pos["classe?"] !== undefined ? l[e.pos["classe?"]] : classeF });
    }
  }
  return res.length ? { classe: classeDoc, absences: res } : null;
}

const CATEGORIE_FRAIS = [
  [/inscription/, "inscription"],
  [/ape/, "apee"],
  [/examen|bepc|probatoire|bac/, "examen"],
  [/tenue|uniforme/, "tenue"],
  [/cantine|repas/, "cantine"],
  [/transport|bus/, "transport"],
  [/sortie|activite|excursion/, "activite"],
  [/pension|scolarite|tranche|exigible/, "scolarite"],
];
/** Frais : colonnes Frais (ou Libelle), Montant, (Echeance), (Classes), (Obligatoire). */
function frais(texte) {
  const res = [];
  for (const f of feuilles(texte)) {
    const e = entete(f.lignes, { nom: /^(frais|libelle|designation|nature|intitule)/, montant: /^montant/, "echeance?": /^(echeance|date)/, "classes?": /^(classes?|niveaux?)/, "obligatoire?": /^obligatoire/ });
    if (!e) continue;
    for (const l of f.lignes.slice(e.ligne + 1)) {
      const nom = l[e.pos.nom];
      const montant = parseInt(String(l[e.pos.montant] || "").replace(/[^\d]/g, ""), 10);
      if (!nom || !(montant > 0)) continue;
      const c = e.pos["classes?"] !== undefined ? sansAccent(l[e.pos["classes?"]]) : "";
      const classes = !c || /tout|ensemble/.test(c) ? [] : /examen/.test(c) ? ["3e", "1ère", "Tle"] : String(l[e.pos["classes?"]]).split(/[,;/]/).map((x) => x.trim()).filter(Boolean);
      const n = sansAccent(nom);
      res.push({
        nom,
        montant,
        echeance: e.pos["echeance?"] !== undefined ? dateIso(l[e.pos["echeance?"]]) : null,
        categorie: (CATEGORIE_FRAIS.find(([m]) => m.test(n)) || [null, "autre"])[1],
        classes,
        obligatoire: e.pos["obligatoire?"] !== undefined ? !/^non/.test(sansAccent(l[e.pos["obligatoire?"]])) : !/cantine|transport|sortie|option/.test(n),
      });
    }
  }
  return res.length ? { frais: res } : null;
}

const TYPES_SANCTION = [
  [/exclusion definitive/, "exclusion_definitive"],
  [/exclusion/, "exclusion_temporaire"],
  [/convocation/, "convocation_parents"],
  [/retenue|consigne/, "retenue"],
  [/blame/, "blame"],
  [/avertissement/, "avertissement"],
  [/observation/, "observation"],
];
/** Sanctions : colonnes Eleve (ou Nom), Sanction (ou Type), (Classe), (Motif), (Date), (Duree). */
function sanctions(texte) {
  const res = [];
  for (const f of feuilles(texte)) {
    const e = entete(f.lignes, { nom: /^(eleve|nom)/, type: /^(sanction|type)/, "classe?": /^classe/, "motif?": /^(motif|faute|raison)/, "date?": /^date/, "duree?": /^duree/ });
    if (!e) continue;
    for (const l of f.lignes.slice(e.ligne + 1)) {
      const nom = l[e.pos.nom];
      const t = sansAccent(l[e.pos.type]);
      if (!nom || !t) continue;
      res.push({
        nom,
        classe: e.pos["classe?"] !== undefined ? l[e.pos["classe?"]] : "",
        type: (TYPES_SANCTION.find(([m]) => m.test(t)) || [null, "observation"])[1],
        motif: e.pos["motif?"] !== undefined ? l[e.pos["motif?"]] : "",
        date: e.pos["date?"] !== undefined ? dateIso(l[e.pos["date?"]]) || "" : "",
        dureeJours: e.pos["duree?"] !== undefined ? parseInt(l[e.pos["duree?"]], 10) || null : null,
      });
    }
  }
  return res.length ? { entrees: res } : null;
}

module.exports = { feuilles, emplois, absences, frais, sanctions, dateIso };
