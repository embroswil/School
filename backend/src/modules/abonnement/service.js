// modules/abonnement/service.js
// Abonnement annuel des etablissements a School (une ligne par annee scolaire).
const db = require("../../config/db");

const reglages = async () => {
  const { rows } = await db.query("SELECT cle, valeur FROM plateforme_reglages");
  const r = Object.fromEntries(rows.map((x) => [x.cle, x.valeur]));
  return {
    prixDefaut: Number(r.prix_defaut ?? 150000),
    echeance: String(r.echeance ?? "10-31"),
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
  const [mm, jj] = r.echeance.split("-").map(Number);
  let echeance = new Date(Number(annee.slice(0, 4)), (mm || 10) - 1, jj || 31);
  // Un etablissement inscrit apres l'echeance a 30 jours pour payer
  const min = new Date(Date.now() + 30 * 86400000);
  if (echeance < min) echeance = min;
  const { rows } = await db.query(
    `INSERT INTO abonnements (school_id, annee, montant, echeance, gratuit) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (school_id, annee) DO UPDATE SET annee = EXCLUDED.annee RETURNING *`,
    [schoolId, annee, e.tarif_annuel ?? r.prixDefaut, iso(echeance), e.abonnement_gratuit]
  );
  return rows[0];
};

// Etat de l'abonnement : montants et statut
const etat = async (schoolId) => {
  const a = await assurerAbonnement(schoolId);
  if (!a) return null;
  const r = await reglages();
  const p = (
    await db.query(
      `SELECT COALESCE(SUM(montant) FILTER (WHERE statut = 'confirme'), 0)::int AS paye,
              COALESCE(SUM(montant) FILTER (WHERE statut = 'declare'), 0)::int AS en_attente
       FROM paiements_abonnement WHERE abonnement_id = $1`,
      [a.id]
    )
  ).rows[0];
  const reste = Math.max(0, a.montant - p.paye);
  const jours = Math.ceil((new Date(`${iso(a.echeance)}T23:59:59`) - Date.now()) / 86400000);
  let statut = "a_payer";
  if (a.gratuit || a.montant === 0) statut = "gratuit";
  else if (reste === 0) statut = "paye";
  else if (jours < -r.delaiGrace) statut = "lecture_seule";
  else if (jours < 0) statut = "en_retard";
  return {
    id: a.id,
    annee: a.annee,
    montant: a.montant,
    paye: p.paye,
    enAttente: p.en_attente,
    reste,
    echeance: iso(a.echeance),
    joursRestants: jours,
    finGrace: iso(new Date(new Date(a.echeance).getTime() + r.delaiGrace * 86400000)),
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
