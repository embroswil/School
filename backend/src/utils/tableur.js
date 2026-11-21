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

// Absences des enseignants : date, nom (enseignant), prenom, heures (debut-fin ou horaire), classe, motif
function absencesEnseignants(texte) {
  const res = [];
  for (const f of feuilles(texte)) {
    const e = entete(f.lignes, {
      date: /^date/,
      nom: /^(nom|enseignant|professeur|noms)/,
      "prenom?": /^prenom/,
      "debut?": /^(debut|heure de debut|de$)/,
      "fin?": /^(fin|heure de fin|a$)/,
      "horaire?": /^(heure|horaire|creneau|cours)/,
      "classe?": /^classe/,
      "motif?": /^(motif|raison|observation)/,
    });
    if (!e) continue;
    const col = (l, k) => (e.pos[k] !== undefined ? l[e.pos[k]] : "");
    for (const l of f.lignes.slice(e.ligne + 1)) {
      const date = dateIso(col(l, "date"));
      const nom = col(l, "nom");
      if (!date || !nom) continue;
      // « 07h30 - 09h20 » dans une seule colonne
      const plage = String(col(l, "horaire?")).match(/(\d{1,2}\s*[h:H]\s*\d{2}).*?(\d{1,2}\s*[h:H]\s*\d{2})/);
      res.push({
        date,
        nom,
        prenom: col(l, "prenom?"),
        debut: heure(col(l, "debut?")) || (plage ? heure(plage[1]) : heure(col(l, "horaire?"))),
        fin: heure(col(l, "fin?")) || (plage ? heure(plage[2]) : ""),
        classe: col(l, "classe?"),
        motif: col(l, "motif?"),
      });
    }
  }
  return res.length ? { absences: res } : null;
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

// Comptabilite : budget previsionnel (poste, nature, montant prevu) et journal des operations
// (date, libelle, montant, categorie, beneficiaire, piece, mode, etat).
const RECETTE = /recette|produit|ressource|encaissement/;
function comptabilite(texte) {
  const postes = [];
  const operations = [];
  const montantDe = (v) => parseInt(String(v || "").replace(/[^\d]/g, ""), 10);
  const paiements = [];
  for (const f of feuilles(texte)) {
    const nomFeuille = sansAccent(f.nom);
    // journal des paiements de scolarite : un recu par ligne (matricule de l'eleve, frais, montant)
    const p = entete(f.lignes, {
      date: /^date/,
      montant: /^montant/,
      matricule: /^matricule/,
      frais: /^(frais|objet|motif)/,
      "recu?": /recu/,
      "mode?": /^(moyen|mode)/,
      "ref?": /^ref/,
      "nom?": /^nom$/,
      "prenom?": /^prenom/,
    });
    if (p) {
      const val = (l, k) => (p.pos[k] !== undefined ? String(l[p.pos[k]] || "").trim() : "");
      for (const l of f.lignes.slice(p.ligne + 1)) {
        const montant = montantDe(l[p.pos.montant]);
        const date = dateIso(l[p.pos.date]);
        const matricule = val(l, "matricule");
        const fraisNom = val(l, "frais");
        if (!(montant > 0) || !date || !matricule || !fraisNom) continue;
        paiements.push({ date, montant, matricule, frais: fraisNom, recu: val(l, "recu?") || null, mode: val(l, "mode?"), reference: val(l, "ref?") || null, nom: `${val(l, "nom?")} ${val(l, "prenom?")}`.trim() });
      }
      continue;
    }
    const j = entete(f.lignes, {
      date: /^date/,
      libelle: /^(libelle|designation|objet|intitule|operation)/,
      montant: /^montant/,
      "categorie?": /^(categorie|rubrique|poste)/,
      "tiers?": /^(beneficiaire|fournisseur|tiers|payeur|client)/,
      "piece?": /^(bon|piece|n°|no |numero|facture|ref)/,
      "mode?": /^(mode|moyen|reglement)/,
      "etat?": /^(etat|statut)/,
      "sens?": /^(sens|type|nature)/,
    });
    if (j) {
      for (const l of f.lignes.slice(j.ligne + 1)) {
        const libelle = l[j.pos.libelle];
        const montant = montantDe(l[j.pos.montant]);
        const date = dateIso(l[j.pos.date]);
        if (!libelle || !(montant > 0) || !date || /^(total|sous-total|solde)/.test(sansAccent(libelle))) continue;
        const sensCel = j.pos["sens?"] !== undefined ? sansAccent(l[j.pos["sens?"]]) : "";
        const val = (k) => (j.pos[k] !== undefined ? String(l[j.pos[k]] || "").trim() : "");
        operations.push({
          date,
          libelle,
          montant,
          sens: RECETTE.test(sensCel) || (!sensCel && RECETTE.test(nomFeuille)) ? "recette" : "depense",
          categorie: val("categorie?") || null,
          tiers: val("tiers?") || null,
          piece: val("piece?") || null,
          mode: val("mode?") || null,
          etat: /engag|attente|non pay|a payer/.test(sansAccent(val("etat?"))) ? "engage" : "paye",
        });
      }
      continue;
    }
    // execution du budget, tresorerie : tableaux calcules, non importes
    if (f.lignes.slice(0, 15).some((l) => l.some((c) => /^(depense|realise|taux|solde cumule)/.test(sansAccent(c))))) continue;
    const b = entete(f.lignes, { poste: /^(poste|libelle|designation|rubrique|intitule)/, montant: /^(montant|prevu|budget|prevision)/, "nature?": /^(nature|type|categorie|sens)/ });
    if (!b) continue;
    for (const l of f.lignes.slice(b.ligne + 1)) {
      const nom = l[b.pos.poste];
      const prevu = montantDe(l[b.pos.montant]);
      if (!nom || !(prevu > 0) || /^(total|sous-total|solde)/.test(sansAccent(nom))) continue;
      const nature = b.pos["nature?"] !== undefined ? String(l[b.pos["nature?"]] || "").trim() : "";
      const recette = RECETTE.test(sansAccent(nature));
      postes.push({
        nom,
        prevu,
        sens: recette ? "recette" : "depense",
        categorie: !recette && nature && !/depense|charge/.test(sansAccent(nature)) ? nature : null,
        scolarite: recette && /scolarit|famille|pension|contribution|inscription/.test(sansAccent(nom)),
      });
    }
  }
  return postes.length || operations.length || paiements.length ? { postes, operations, paiements } : null;
}

// Rapport ou proces-verbal redige (PDF avec texte, Word) : sans IA. Les eleves de l'etablissement dont le nom
// figure dans le texte sont retrouves ; la sanction est lue dans la derniere phrase qui les cite avec une sanction,
// le motif dans les premieres phrases qui les citent (les faits).
const MOIS_FR = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12 };
const GRAVITE = [
  [/exclusion definitive|renvoi definitif|exclu(e)? definitivement/, "exclusion_definitive"],
  [/exclusion|exclu(e)?\b|mise a pied/, "exclusion_temporaire"],
  [/blame/, "blame"],
  [/avertissement (ecrit|de conduite|de travail)|avertissement\b(?! oral)/, "avertissement"],
  [/convocation des parents|parents? convoques?|convoquer les parents/, "convocation_parents"],
  [/retenue|consigne\b|heures? de colle/, "retenue"],
  [/observation (ecrite|de conduite)|observation\b/, "observation"],
];
function sanctionsRedigees(texte, eleves) {
  const brut = String(texte || "").replace(/\s+/g, " ");
  const plat = sansAccent(brut);
  const phrases = plat.split(/(?<=[.;!?])\s+/).map((p) => p.trim()).filter(Boolean);
  const dl = plat.match(/(\d{1,2})(?:er)? (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre) (20\d{2})/);
  const dn = plat.match(/(\d{1,2})\/(\d{1,2})\/(20\d{2})/);
  const date = dl
    ? `${dl[3]}-${String(MOIS_FR[dl[2]]).padStart(2, "0")}-${dl[1].padStart(2, "0")}`
    : dn
      ? `${dn[3]}-${dn[2].padStart(2, "0")}-${dn[1].padStart(2, "0")}`
      : "";
  const res = [];
  // noms presents dans le texte ; un nom contenu dans un nom plus long au meme endroit (« AMADOU Souleymanou »
  // dans « AMADOU Souleymanou Ousmane ») n'est pas retenu
  const trouves = [];
  for (const e of eleves) {
    const cles = [`${e.last_name} ${e.first_name}`, `${e.first_name} ${e.last_name}`].map((x) => sansAccent(x).replace(/\s+/g, " ")).filter((k) => k.length > 5);
    const pos = [];
    for (const k of cles) for (let i = plat.indexOf(k); i >= 0; i = plat.indexOf(k, i + 1)) if (!/[a-z]/.test(plat[i + k.length] || "") && !/[a-z]/.test(plat[i - 1] || "")) pos.push([i, i + k.length, k]);
    if (pos.length) trouves.push({ e, pos });
  }
  const couvert = (a, b) => b.pos.some(([d, f]) => d <= a[0] && a[1] <= f && f - d > a[1] - a[0]);
  for (const { e, pos } of trouves) {
    const libres = pos.filter((p) => !trouves.some((t) => t.e !== e && couvert(p, t)));
    if (!libres.length) continue;
    const cles = [libres[0][2]];
    const cle = cles.find((k) => plat.includes(k));
    // sanction : ce qui suit le nom, jusqu'a la fin de la phrase (la derniere mention avec une sanction l'emporte)
    let type = null;
    let duree = null;
    let convoques = false;
    for (let i = plat.indexOf(cle); i >= 0; i = plat.indexOf(cle, i + 1)) {
      const suite = plat.slice(i + cle.length, i + cle.length + 200).split(/[.;!?](\s|$)/)[0].replace(/avertissements? oraux?/g, "");
      const g = GRAVITE.find(([r]) => r.test(suite));
      if (g) {
        type = g[1];
        duree = Number((suite.match(/(\d+)\s*jours?/) || [])[1]) || null;
        convoques = type !== "convocation_parents" && /convocation des parents|parents? convoques?/.test(suite);
      }
    }
    if (!type) continue;
    // motif : les phrases de faits qui citent l'eleve (pas la ligne « NOM : sanction »), dans la casse du document
    const faits = phrases
      .filter((p) => p.includes(cle) && !p.includes(`${cle} :`))
      .slice(0, 2)
      .map((p) => (p.includes("faits ") ? p.slice(p.lastIndexOf("faits ") + 6) : p));
    const motif = faits
      .map((p) => {
        const i = sansAccent(brut).indexOf(p.slice(0, 40));
        return i >= 0 ? brut.slice(i, i + p.length) : p;
      })
      .join(" ")
      .slice(0, 380) + (convoques ? " Convocation des parents." : "");
    res.push({ nom: `${e.last_name} ${e.first_name}`, classe: e.classe || "", type, motif, date, dureeJours: duree });
  }
  return res.length ? { entrees: res } : null;
}

module.exports = { feuilles, emplois, absences, absencesEnseignants, frais, sanctions, sanctionsRedigees, comptabilite, dateIso };
