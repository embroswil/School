// taches/resume-absences.js
// Un seul email par mois et par parent : le recapitulatif des absences et
// retards de ses enfants le mois precedent (au lieu d'un email par absence).
// Les absences restent visibles a tout moment dans l'application.
const db = require("../config/db");
const logger = require("../utils/logger");
const { envoyerEmail } = require("../utils/email");

const NOMS_MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const APP = () => (process.env.FRONTEND_URL || "").split(",")[0].trim();
const heure = (p) => (p === null || p === undefined ? "" : ` à ${String(Math.floor(p / 100)).padStart(2, "0")}h${String(p % 100).padStart(2, "0")}`);

// Mois precedent : { cle: '2026-10', debut: Date, fin: Date, libelle: 'octobre 2026' }
const moisPrecedent = (maintenant = new Date()) => {
  const debut = new Date(maintenant.getFullYear(), maintenant.getMonth() - 1, 1);
  const fin = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
  return {
    cle: `${debut.getFullYear()}-${String(debut.getMonth() + 1).padStart(2, "0")}`,
    debut: debut.toISOString().slice(0, 10),
    fin: fin.toISOString().slice(0, 10),
    libelle: `${NOMS_MOIS[debut.getMonth()]} ${debut.getFullYear()}`,
  };
};

const envoyerResumes = async () => {
  const m = moisPrecedent();
  // Parents concernes : email confirme, emails actives, au moins une absence ou un retard, pas encore servis ce mois-ci
  const { rows } = await db.query(
    `SELECT a.date, a.status, a.period_number, l.parent_id, p.email, p.first_name AS parent_prenom,
            e.id AS eleve_id, e.first_name, e.last_name, c.name AS classe
     FROM attendance a
     JOIN parent_student_links l ON l.student_id = a.student_id
     JOIN users p ON p.id = l.parent_id
     JOIN users e ON e.id = a.student_id
     JOIN classes c ON c.id = a.class_id
     WHERE a.date >= $1 AND a.date < $2 AND a.status = 'absent'
       AND p.email_verifie AND p.notif_email AND p.is_active
       AND NOT EXISTS (SELECT 1 FROM resumes_mensuels r WHERE r.mois = $3 AND r.parent_id = l.parent_id)
     ORDER BY l.parent_id, e.id, a.date, a.period_number NULLS FIRST`,
    [m.debut, m.fin, m.cle]
  );
  const parParent = new Map();
  for (const r of rows) {
    if (!parParent.has(r.parent_id)) parParent.set(r.parent_id, { email: r.email, prenom: r.parent_prenom, enfants: new Map() });
    const p = parParent.get(r.parent_id);
    if (!p.enfants.has(r.eleve_id)) p.enfants.set(r.eleve_id, { nom: `${r.first_name} ${r.last_name}`, classe: r.classe, lignes: [], abs: 0, ret: 0 });
    const enf = p.enfants.get(r.eleve_id);
    r.status === "absent" ? enf.abs++ : enf.ret++;
    const jour = new Date(r.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    enf.lignes.push(`${jour}${heure(r.period_number)}`);
  }
  let envoyes = 0;
  for (const [parentId, p] of parParent) {
    const blocs = [...p.enfants.values()];
    const texte = blocs
      .map((e) => `${e.nom} (${e.classe}) : ${e.abs} absence(s)\n${e.lignes.map((l) => `  - ${l}`).join("\n")}`)
      .join("\n\n");
    const html = blocs
      .map(
        (e) => `<h2 style="margin:18px 0 6px;font-size:17px">${e.nom} <span style="color:#5d6789;font-weight:normal">· ${e.classe}</span></h2>
        <p style="margin:0 0 8px;font-size:15px"><b style="color:#d92d4b">${e.abs} absence(s)</b></p>
        <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.6;color:#33405f">${e.lignes.map((l) => `<li>${l}</li>`).join("")}</ul>`
      )
      .join("");
    try {
      await envoyerEmail({
        a: p.email,
        nom: p.prenom,
        sujet: `School · Absences de ${m.libelle}`,
        texte: `Bonjour ${p.prenom},\n\nVoici le récapitulatif des absences de ${m.libelle} :\n\n${texte}\n\nLe détail est disponible à tout moment dans School : ${APP()}\n\nPour ne plus recevoir ces emails : Profil › Notifications par email.`,
        html: `<!doctype html><html><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#0f1a3c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:18px;border:1px solid #e3e8f4;overflow:hidden">
<tr><td style="background:#2446d8;padding:18px 24px;color:#fff;font-size:20px;font-weight:bold">School<span style="color:#ffb020">.</span></td></tr>
<tr><td style="padding:24px"><p style="margin:0 0 6px;font-size:15px">Bonjour ${p.prenom},</p>
<h1 style="margin:0 0 4px;font-size:19px">Absences de ${m.libelle}</h1>${html}
<p style="margin:22px 0 0"><a href="${APP()}" style="display:inline-block;background:#2446d8;color:#fff;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:12px">Voir le détail dans School</a></p></td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #e3e8f4;font-size:12px;color:#5d6789">Récapitulatif mensuel. Pour ne plus recevoir ces emails : Profil › Notifications par email.</td></tr>
</table></td></tr></table></body></html>`,
      });
      await db.query("INSERT INTO resumes_mensuels (mois, parent_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [m.cle, parentId]);
      envoyes++;
    } catch (e) {
      logger.error(`Récapitulatif d'absences non envoyé (parent ${parentId}) : ${e.message}`);
    }
  }
  if (envoyes) logger.info(`Récapitulatifs d'absences de ${m.libelle} envoyés : ${envoyes}`);
  return { mois: m.cle, envoyes };
};

// Verifie chaque heure ; envoie du 1er au 5 du mois, entre 8 h et 20 h (heure du serveur).
// La table resumes_mensuels garantit un seul envoi par parent et par mois.
const demarrer = () => {
  const verifier = () => {
    const d = new Date();
    if (d.getDate() <= 5 && d.getHours() >= 8 && d.getHours() < 20) envoyerResumes().catch((e) => logger.error(e.message));
  };
  setTimeout(verifier, 60 * 1000);
  setInterval(verifier, 60 * 60 * 1000);
};

module.exports = { envoyerResumes, demarrer, moisPrecedent };
