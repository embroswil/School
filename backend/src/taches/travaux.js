// taches/travaux.js
// Execution des travaux en arriere-plan (ex. installation du dossier d'un etablissement).
// Chaque element est traite par l'API elle-meme, au nom de l'utilisateur qui a lance le travail :
// memes controles et memes regles que dans l'application. Les elements deja faits ne sont jamais
// refaits : apres un redemarrage du serveur, le travail reprend la ou il s'etait arrete.
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const env = require("../config/env");
const logger = require("../utils/logger");
const { notifierUtilisateur } = require("../utils/notifier");

let actif = false;

// Appel de l'API locale au nom de l'utilisateur
async function appel(u, method, chemin, corps) {
  const jeton = jwt.sign({ role: u.role, email: u.email, schoolId: u.school_id || null }, env.jwt.secret, { subject: String(u.id), expiresIn: "30m", algorithm: "HS256" });
  const r = await fetch(`http://127.0.0.1:${env.port}${chemin}`, {
    method,
    headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json", "X-Langue": u.langue || "fr" },
    body: corps === undefined ? undefined : JSON.stringify(corps),
    signal: AbortSignal.timeout(180000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || `Erreur ${r.status}`);
  return j.data;
}

const decoupe = (l, n) => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, i * n + n));

// Un traitement par role : renvoie { n: { compteurs }, alertes: [] }
const ROLES = {
  async photo(u, d) {
    await appel(u, "PUT", "/api/etablissement/photo", { photo: d.photo });
    return { n: { photo: 1 } };
  },
  async eleves(u, d) {
    const r = await appel(u, "POST", "/api/etablissement/import-eleves", { eleves: d.eleves, classeParDefaut: "" });
    return { n: { eleves: d.eleves.length, crees: r.crees || 0, existants: r.existants || 0, places: r.places || 0 }, alertes: (r.erreurs || []).slice(0, 3) };
  },
  async enseignants(u, d) {
    await appel(u, "POST", "/api/etablissement/enseignants/import", { enseignants: d.enseignants });
    return { n: { enseignants: d.enseignants.length } };
  },
  async emplois(u, d) {
    const r = await appel(u, "POST", "/api/documents-ecole/emplois/lire", d);
    const classes = (r?.classes || []).filter((c) => c.classId).map((c) => ({ classId: c.classId, creneaux: c.creneaux }));
    const inconnues = (r?.classes || []).filter((c) => !c.classId).map((c) => c.nomLu || d.nom);
    let cours = 0;
    for (const lot of decoupe(classes, 40)) cours += (await appel(u, "POST", "/api/documents-ecole/emplois/appliquer", { classes: lot }))?.cours || 0;
    return { n: { classes: classes.length, cours }, alertes: inconnues.length ? [`Classe non reconnue : ${inconnues.join(", ")}`] : [] };
  },
  async appel(u, d) {
    const lues = ((await appel(u, "POST", "/api/documents-ecole/absences/lire", d)) || []).filter((l) => l.trouve);
    let ajoutees = 0;
    for (const lot of decoupe(lues, 2500)) ajoutees += (await appel(u, "POST", "/api/documents-ecole/absences/appliquer", { absences: lot }))?.ajoutees || 0;
    return { n: { absences: ajoutees } };
  },
  async frais(u, d) {
    const r = (await appel(u, "POST", "/api/scolarite/frais/lire", d)) || [];
    const aEnvoyer = r.filter((f) => f.statut !== "identique");
    if (aEnvoyer.length)
      await appel(u, "POST", "/api/scolarite/frais/appliquer", {
        frais: aEnvoyer.map(({ id, nom, montant, echeance, classes, categorie, obligatoire }) => ({ id, nom, montant, echeance, classes, categorie, obligatoire })),
      });
    return { n: { frais: r.length } };
  },
  async paiements(u, d) {
    const r = await appel(u, "POST", "/api/comptabilite/importer", { texte: d.texte });
    const alertes = [];
    if (r.elevesInconnus) alertes.push(`${r.elevesInconnus} matricule(s) introuvable(s)`);
    if (r.fraisInconnus?.length) alertes.push(`Frais inconnus : ${r.fraisInconnus.join(", ")}`);
    return { n: { paiements: r.paiements || 0, montant: r.paiementsTotal || 0, operations: r.operations || 0, postes: (r.postesNouveaux || 0) + (r.postesMaj || 0) }, alertes };
  },
  async compta(u, d) {
    return ROLES.paiements(u, d);
  },
  async discipline(u, d) {
    const lues = (await appel(u, "POST", "/api/vie-scolaire/sanctions/lire", d)) || [];
    let faites = 0;
    let aVoir = 0;
    for (const s of lues) {
      if (!s.eleve) {
        aVoir++;
        continue;
      }
      const r = await appel(u, "POST", "/api/vie-scolaire/sanctions", { studentId: s.eleve.id, type: s.type, motif: s.motif || s.type, date: s.date, dureeJours: s.dureeJours });
      if (!r?.deja) faites++;
    }
    return { n: { sanctions: faites, aVoir } };
  },
  async document(u, d) {
    const existants = (await appel(u, "GET", "/api/actualites/documents")) || [];
    const nom = String(d.fichier.nom || "").toLowerCase();
    if (existants.some((x) => (Array.isArray(x.medias) ? x.medias : []).some((m) => String(m.nom || "").toLowerCase() === nom))) return { n: { deja: 1 } };
    await appel(u, "POST", "/api/actualites/documents", { titre: d.titre, categorie: d.categorie || "autre", audience: d.audience, fichiers: [d.fichier] });
    return { n: { documents: 1 } };
  },
};
ROLES.publier = ROLES.document;
ROLES.interne = ROLES.document;

async function traiter(t) {
  const u = (await db.query("SELECT id, role, email, school_id, langue FROM users WHERE id = $1 AND is_active", [t.user_id])).rows[0];
  if (!u) {
    await db.query("UPDATE travaux SET statut = 'erreur', updated_at = NOW(), termine_le = NOW() WHERE id = $1", [t.id]);
    return;
  }
  for (;;) {
    const etat = (await db.query("SELECT statut FROM travaux WHERE id = $1", [t.id])).rows[0];
    if (!etat || etat.statut !== "en_cours") return; // annule
    const el = (await db.query("SELECT id, role, donnees, libelle FROM travaux_elements WHERE travail_id = $1 AND statut = 'a_faire' ORDER BY ordre, id LIMIT 1", [t.id])).rows[0];
    if (!el) break;
    let statut = "fait";
    let resultat;
    try {
      if (!ROLES[el.role]) throw new Error("Type d’élément inconnu");
      resultat = await ROLES[el.role](u, el.donnees);
    } catch (e) {
      statut = "erreur";
      resultat = { erreur: `${el.libelle ? `${el.libelle} : ` : ""}${e.message}` };
    }
    // les donnees volumineuses ne sont plus utiles une fois l'element traite
    await db.query("UPDATE travaux_elements SET statut = $2, resultat = $3, traite_le = NOW(), donnees = '{}'::jsonb WHERE id = $1", [el.id, statut, JSON.stringify(resultat)]);
    await db.query("UPDATE travaux SET updated_at = NOW() WHERE id = $1", [t.id]);
  }
  const c = (await db.query("SELECT COUNT(*) FILTER (WHERE statut = 'fait')::int AS faits, COUNT(*) FILTER (WHERE statut = 'erreur')::int AS erreurs FROM travaux_elements WHERE travail_id = $1", [t.id])).rows[0];
  await db.query("UPDATE travaux SET statut = 'termine', updated_at = NOW(), termine_le = NOW() WHERE id = $1", [t.id]);
  await notifierUtilisateur(t.user_id, {
    title: c.erreurs ? `${t.titre} : terminé avec ${c.erreurs} point(s) à vérifier` : `${t.titre} : terminé`,
    message: c.erreurs ? "Ouvrez le suivi pour voir ce qui n’a pas pu être installé." : "Tout a été installé. Vous pouvez consulter le résultat.",
    type: "system",
    data: { lien: `/dossier?travail=${t.id}` },
  }).catch(() => {});
}

async function boucle() {
  if (actif) return;
  actif = true;
  try {
    for (;;) {
      const t = (await db.query("SELECT id, user_id, titre FROM travaux WHERE statut = 'en_cours' ORDER BY id LIMIT 1")).rows[0];
      if (!t) break;
      await traiter(t).catch((e) => logger.error(`Travail ${t.id} : ${e.message}`));
    }
  } catch (e) {
    logger.error(`Travaux : ${e.message}`);
  } finally {
    actif = false;
  }
}

module.exports = {
  demarrer() {
    setTimeout(boucle, 5000); // reprise des travaux interrompus par un redemarrage
    setInterval(boucle, 20000);
  },
  reveiller: () => setTimeout(boucle, 100),
};
