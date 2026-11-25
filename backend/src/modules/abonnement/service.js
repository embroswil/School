// modules/abonnement/service.js
// Abonnement des etablissements a Sùkûl : une ligne par annee scolaire, payable par trimestre
// (prix_trimestre, 100 $ convertis) ou pour l'annee entiere (prix_defaut, moins cher que 3 trimestres).
// Trimestres : 1er septembre, 1er janvier, 1er avril. Un nouvel etablissement a un trimestre d'essai gratuit
// (schools.essai_fin) : les trimestres qui commencent avant cette date ne sont pas factures.
const db = require("../../config/db");

const reglages = async () => {
  const { rows } = await db.query("SELECT cle, valeur FROM plateforme_reglages");
  const r = Object.fromEntries(rows.map((x) => [x.cle, x.valeur]));
  return {
    prixDefaut: Number(r.prix_defaut ?? 155000),
    prixTrimestre: Number(r.prix_trimestre ?? 57000),
    delaiGrace: Number(r.delai_grace_jours ?? 30),
    beneficiaire: r.beneficiaire || "",
    orangeMoney: r.orange_money || "",
    mtnMomo: r.mtn_momo || "",
    instructions: r.instructions || "",
    telephone: r.telephone || "",
  };
};

// Annee scolaire en cours : de aout a juillet (ex. « 2026/2027 »)
const anneeCourante = (d = new Date()) => {
  const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}/${y + 1}`;
};

const iso = (d) => new Date(d).toISOString().slice(0, 10);

// Cree au besoin l'abonnement de l'annee en cours ; renvoie la ligne
const assurerAbonnement = async (schoolId) => {
  const annee = anneeCourante();
  const ex = await db.query("SELECT * FROM abonnements WHERE school_id = $1 AND annee = $2", [schoolId, annee]);
  if (ex.rows[0]) return ex.rows[0];
  const r = await reglages();
  const e = (await db.query("SELECT tarif_annuel, abonnement_gratuit, created_at FROM schools WHERE id = $1", [schoolId])).rows[0];
  if (!e) return null;
  // echeance de la ligne = date avant laquelle rien n'est exige (30 jours pour payer apres l'ouverture de l'annee)
  const echeance = new Date(Date.now() + 30 * 86400000);
  const { rows } = await db.query(
    `INSERT INTO abonnements (school_id, annee, montant, echeance, gratuit) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (school_id, annee) DO UPDATE SET annee = EXCLUDED.annee RETURNING *`,
    [schoolId, annee, e.tarif_annuel ?? r.prixDefaut, iso(echeance), e.abonnement_gratuit]
  );
  return rows[0];
};

// Etat de l'abonnement : trimestres factures, montants et statut
const JOUR = 86400000;
const etat = async (schoolId) => {
  const a = await assurerAbonnement(schoolId);
  if (!a) return null;
  const r = await reglages();
  // (lu ainsi, la requete marche aussi tant que la colonne essai_fin n'est pas encore creee)
  const ecole = (await db.query("SELECT to_jsonb(s) ->> 'essai_fin' AS essai_fin FROM schools s WHERE id = $1", [schoolId])).rows[0] || {};
  const p = (
    await db.query(
      `SELECT COALESCE(SUM(montant) FILTER (WHERE statut = 'confirme'), 0)::int AS paye,
              COALESCE(SUM(montant) FILTER (WHERE statut = 'declare'), 0)::int AS en_attente
       FROM paiements_abonnement WHERE abonnement_id = $1`,
      [a.id]
    )
  ).rows[0];
  const y = Number(a.annee.slice(0, 4));
  const aujourdhui = iso(new Date());
  const essaiFin = ecole.essai_fin ? iso(ecole.essai_fin) : null;
  // trimestres factures : ceux qui commencent apres la fin de l'essai
  const trimestres = [`${y}-09-01`, `${y + 1}-01-01`, `${y + 1}-04-01`].filter((d) => !essaiFin || d >= essaiFin);
  const prixT = r.prixTrimestre;
  const total = a.gratuit ? 0 : trimestres.length === 3 ? a.montant : Math.min(a.montant, trimestres.length * prixT);
  const commences = trimestres.filter((d) => d <= aujourdhui).length;
  const du = Math.min(total, commences * prixT);
  const reste = Math.max(0, du - p.paye); // a payer maintenant
  const resteAnnee = Math.max(0, total - p.paye);
  // prochain trimestre non couvert par les paiements : son echeance (30 jours apres son debut, jamais avant a.echeance)
  const couverts = p.paye >= total ? trimestres.length : Math.floor(p.paye / prixT);
  const debut = trimestres[couverts];
  const plancher = new Date(`${iso(a.echeance)}T12:00:00Z`);
  const echeance = debut ? iso(Math.max(new Date(`${debut}T12:00:00Z`).getTime() + 30 * JOUR, plancher.getTime())) : iso(a.echeance);
  const jours = Math.ceil((new Date(`${echeance}T23:59:59`) - Date.now()) / JOUR);
  let statut;
  if (a.gratuit || (total === 0 && !essaiFin)) statut = "gratuit";
  else if (resteAnnee === 0) statut = "paye";
  else if (reste === 0) statut = essaiFin && aujourdhui < essaiFin ? "essai" : "a_jour";
  else if (jours < -r.delaiGrace) statut = "lecture_seule";
  else if (jours < 0) statut = "en_retard";
  else statut = "a_payer";
  return {
    id: a.id,
    annee: a.annee,
    montant: total, // l'annee entiere (trimestres factures)
    prixTrimestre: prixT,
    prixAnnee: a.montant,
    trimestres: trimestres.length,
    paye: p.paye,
    enAttente: p.en_attente,
    reste,
    resteAnnee,
    prochain: Math.min(prixT, resteAnnee), // montant du prochain trimestre
    echeance,
    joursRestants: jours,
    finGrace: iso(new Date(`${echeance}T12:00:00Z`).getTime() + r.delaiGrace * JOUR),
    essaiFin,
    gratuit: a.gratuit,
    statut,
    rappels: a.rappels || [],
  };
};

// Lecture seule : petit cache pour ne pas interroger la base a chaque requete
const cache = new Map();
const estEnLectureSeule = async (schoolId) => {
  if (!schoolId) return false;
  const c = cache.get(schoolId);
  if (c && c.expire > Date.now()) return c.valeur;
  let valeur = false;
  try {
    valeur = (await etat(schoolId))?.statut === "lecture_seule";
  } catch (_) {
    valeur = false; // en cas de doute, on ne bloque pas
  }
  cache.set(schoolId, { valeur, expire: Date.now() + 5 * 60 * 1000 });
  return valeur;
};
const oublier = (schoolId) => cache.delete(schoolId);

module.exports = { reglages, anneeCourante, assurerAbonnement, etat, estEnLectureSeule, oublier };
