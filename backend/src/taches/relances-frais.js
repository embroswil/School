// taches/relances-frais.js
// Relances automatiques des frais de scolarite (etablissements qui les ont activees) :
// - 3 jours avant l'echeance : rappel ;
// - 1, 8 et 15 jours apres l'echeance : relance, tant que le frais n'est pas paye.
// Chaque etape n'est envoyee qu'une fois par eleve et par frais. Un seul message par parent et par enfant,
// qui regroupe tous les frais concernes. Envoi le matin (a partir de 8 h, heure du Cameroun).
const db = require("../config/db");
const logger = require("../utils/logger");
const { notifierUtilisateur } = require("../utils/notifier");
const { assurerAnneeScolaire } = require("../utils/annees");

const fcfa = (n) => `${Number(n).toLocaleString("fr-FR")} FCFA`;
// date SQL (objet Date a minuit local, ou texte) -> « AAAA-MM-JJ »
const iso = (d) => (d instanceof Date ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : String(d).slice(0, 10));
const jourCourt = (d) => new Date(`${iso(d)}T00:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });

// Etape due aujourd'hui pour un frais (null si aucune) : 0 avant, puis 1, 2, 3 apres l'echeance
const etapeDue = (echeance, aujourdhui) => {
  const j = Math.round((Date.parse(aujourdhui) - Date.parse(iso(echeance))) / 86400000);
  if (j >= -3 && j < 0) return 0;
  if (j >= 15) return 3;
  if (j >= 8) return 2;
  if (j >= 1) return 1;
  return null;
};

const relancerEcole = async (ecole, aujourdhui) => {
  const { SQL_DU } = require("../modules/scolarite/routes");
  const annee = await assurerAnneeScolaire(ecole);
  const { rows } = await db.query(
    `SELECT x.id, x.first_name, x.last_name, x.classe, x.frais_id, x.frais, x.echeance, x.reste,
            COALESCE((SELECT MAX(r.etape) FROM relances_frais r WHERE r.student_id = x.id AND r.frais_id = x.frais_id), -1) AS deja
     FROM (${SQL_DU}) x WHERE x.reste > 0 AND x.echeance IS NOT NULL
       AND x.echeance BETWEEN CURRENT_DATE - 60 AND CURRENT_DATE + 3`,
    [ecole, annee?.id || null]
  );
  const parEleve = new Map();
  for (const r of rows) {
    const e = etapeDue(r.echeance, aujourdhui);
    // une etape deja depassee n'est pas rattrapee : seule la plus recente est envoyee (a l'activation des relances,
    // les parents deja en retard recoivent donc une seule relance)
    if (e === null || e <= r.deja) continue;
    if (!parEleve.has(r.id)) parEleve.set(r.id, { ...r, lignes: [], avant: true });
    const el = parEleve.get(r.id);
    el.lignes.push({ ...r, etape: e });
    if (e > 0) el.avant = false;
  }
  if (!parEleve.size) return 0;
  // etapes enregistrees avant l'envoi (en une requete) : une relance n'est jamais envoyee deux fois
  const faites = [];
  for (const el of parEleve.values()) for (const l of el.lignes) faites.push({ s: el.id, f: l.frais_id, e: l.etape });
  await db.query(
    `INSERT INTO relances_frais (student_id, frais_id, etape, school_id)
     SELECT x.s, x.f, g, $2 FROM jsonb_to_recordset($1::jsonb) AS x(s int, f int, e int), generate_series(0, x.e) g
     ON CONFLICT DO NOTHING`,
    [JSON.stringify(faites), ecole]
  );
  const liens = (await db.query("SELECT student_id, parent_id FROM parent_student_links WHERE student_id = ANY($1::int[])", [[...parEleve.keys()]])).rows;
  let messages = 0;
  for (const { student_id: sid, parent_id: parent } of liens) {
    const el = parEleve.get(sid);
    const total = el.lignes.reduce((a, l) => a + Number(l.reste), 0);
    const detail = el.lignes.map((l) => `${l.frais} : ${fcfa(l.reste)} (${el.avant ? "avant le" : "échéance du"} ${jourCourt(l.echeance)})`).join(" · ");
    await notifierUtilisateur(parent, {
      title: el.avant ? "Rappel : échéance proche" : "Relance : frais de scolarité en retard",
      message: `${el.first_name} ${el.last_name} (${el.classe}) : ${fcfa(total)} à payer. ${detail}. Payez au guichet de l’établissement ou depuis Sùkûl par Mobile Money.`,
      type: "payment",
      priority: el.avant ? "normal" : "high",
      data: { lien: "/scolarite" },
    }).catch(() => {});
    messages += 1;
  }
  return messages;
};

let enCours = false;
const relancer = async () => {
  if (enCours) return;
  enCours = true;
  try {
    const maintenant = new Date(Date.now() + 3600 * 1000); // heure du Cameroun (UTC+1)
    if (maintenant.getUTCHours() < 8 || maintenant.getUTCHours() >= 19) return;
    const aujourdhui = maintenant.toISOString().slice(0, 10);
    const ecoles = (await db.query("SELECT id FROM schools WHERE relances_auto AND is_active IS NOT FALSE")).rows;
    for (const e of ecoles) {
      try {
        const n = await relancerEcole(e.id, aujourdhui);
        if (n) logger.info(`Relances des frais : ${n} message(s) pour l'établissement ${e.id}`);
      } catch (err) {
        logger.error(`Relances des frais (établissement ${e.id}) : ${err.message}`);
      }
    }
  } catch (e) {
    logger.error(`Relances des frais : ${e.message}`);
  } finally {
    enCours = false;
  }
};

// toutes les heures : chaque etape n'etant envoyee qu'une fois, les passages suivants ne renvoient rien
const demarrer = () => {
  setTimeout(relancer, 60 * 1000);
  setInterval(relancer, 60 * 60 * 1000);
};

module.exports = { relancer, relancerEcole, etapeDue, demarrer };
