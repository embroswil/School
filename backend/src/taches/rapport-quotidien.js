// taches/rapport-quotidien.js
// Chaque soir (a partir de 19 h, heure du Cameroun), chaque parent recoit UN resume de la journee de
// chacun de ses enfants : absences, notes publiees, devoirs donnes, sanctions. Rien n'est envoye pour un
// enfant dont la journee est sans evenement. Le parent peut couper ce resume dans son Profil.
const db = require("../config/db");
const logger = require("../utils/logger");
const { notifierUtilisateur } = require("../utils/notifier");

// Jour du Cameroun (UTC+1) : bornes en heure du serveur de base (UTC)
const JOUR = "((NOW() AT TIME ZONE 'UTC') + INTERVAL '1 hour')::date";
const DU_JOUR = (col) => `(${col} + INTERVAL '1 hour')::date = ${JOUR}`;

const envoyer = async () => {
  // eleves ayant eu au moins un evenement aujourd'hui, avec leurs parents qui recoivent le resume
  const { rows: evts } = await db.query(
    `WITH ev AS (
       SELECT a.student_id, 'absence' AS k, COUNT(*)::text AS v FROM attendance a
       WHERE a.date = ${JOUR} AND a.status = 'absent' GROUP BY a.student_id
       UNION ALL
       SELECT x.student_id, 'note', s.name || ' ' || CASE WHEN x.absent THEN 'absent(e)' ELSE (x.note::float)::text || '/' || (e.bareme::float)::text END
       FROM notes_eleves x JOIN evaluations e ON e.id = x.evaluation_id AND e.publiee JOIN subjects s ON s.id = e.subject_id
       WHERE ${DU_JOUR("x.updated_at")} AND (x.note IS NOT NULL OR x.absent)
       UNION ALL
       SELECT cs.student_id, 'devoir', COALESCE(s.name, 'Devoir') || '|' || COALESCE(to_char(d.pour_le, 'YYYY-MM-DD'), '')
       FROM devoirs d JOIN class_students cs ON cs.class_id = d.class_id AND cs.status = 'active' LEFT JOIN subjects s ON s.id = d.subject_id
       WHERE ${DU_JOUR("d.created_at")}
       UNION ALL
       SELECT sa.student_id, 'sanction', sa.type FROM sanctions sa WHERE ${DU_JOUR("sa.created_at")})
     SELECT ev.student_id, ev.k, ev.v, u.first_name, l.parent_id
     FROM ev JOIN users u ON u.id = ev.student_id
     JOIN parent_student_links l ON l.student_id = ev.student_id
     JOIN users p ON p.id = l.parent_id AND p.is_active AND p.rapport_quotidien
     WHERE NOT EXISTS (SELECT 1 FROM rapports_quotidiens r WHERE r.parent_id = l.parent_id AND r.jour = ${JOUR})
     ORDER BY l.parent_id, ev.student_id`
  );
  const parents = new Map();
  for (const r of evts) {
    if (!parents.has(r.parent_id)) parents.set(r.parent_id, new Map());
    const enfants = parents.get(r.parent_id);
    if (!enfants.has(r.student_id)) enfants.set(r.student_id, { prenom: r.first_name, absences: 0, notes: [], devoirs: [], sanctions: [] });
    const e = enfants.get(r.student_id);
    if (r.k === "absence") e.absences += Number(r.v);
    else if (r.k === "note") e.notes.push(r.v.replace(/(\d)\.(\d)/g, "$1,$2"));
    else if (r.k === "devoir") e.devoirs.push(r.v.split("|")[0]);
    else e.sanctions.push(r.v);
  }
  let n = 0;
  for (const [parentId, enfants] of parents) {
    // le resume du jour n'est envoye qu'une fois, meme si la tache repasse
    const ok = await db.query(`INSERT INTO rapports_quotidiens (parent_id, jour) VALUES ($1, ${JOUR}) ON CONFLICT DO NOTHING RETURNING 1`, [parentId]);
    if (!ok.rows[0]) continue;
    for (const [eleveId, e] of enfants) {
      const parties = [];
      if (e.absences) parties.push(`${e.absences} heure(s) d’absence`);
      if (e.notes.length) parties.push(`${e.notes.length > 1 ? "notes" : "note"} : ${e.notes.join(", ")}`);
      if (e.devoirs.length) parties.push(`${e.devoirs.length > 1 ? `${e.devoirs.length} devoirs` : "1 devoir"} (${[...new Set(e.devoirs)].join(", ")})`);
      if (e.sanctions.length) parties.push(`${e.sanctions.length > 1 ? `${e.sanctions.length} sanctions` : "1 sanction"}`);
      if (!parties.length) continue;
      await notifierUtilisateur(parentId, {
        title: `Journée de ${e.prenom}`,
        message: parties.join(" · "),
        type: "attendance",
        data: { lien: `/suivi/${eleveId}` },
      }).catch(() => {});
      n += 1;
    }
  }
  return n;
};

let enCours = false;
const tourner = async () => {
  if (enCours) return;
  enCours = true;
  try {
    const h = new Date(Date.now() + 3600 * 1000).getUTCHours();
    if (h < 19 || h >= 22) return;
    const n = await envoyer();
    if (n) logger.info(`Rapport du jour : ${n} résumé(s) envoyé(s)`);
  } catch (e) {
    logger.error(`Rapport du jour : ${e.message}`);
  } finally {
    enCours = false;
  }
};

const demarrer = () => setInterval(tourner, 10 * 60 * 1000);

module.exports = { envoyer, demarrer };
