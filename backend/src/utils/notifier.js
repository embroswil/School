// utils/notifier.js
// Notifications dans l'application, doublees d'un email pour les evenements
// importants (absence, paiement, reponse de l'etablissement), si l'utilisateur
// a confirme son email et n'a pas desactive les emails.
const db = require("../config/db");
const logger = require("./logger");

const TYPES_EMAIL = ["attendance", "payment", "message", "discipline"];
const APP = () => (process.env.FRONTEND_URL || "").split(",")[0].trim();

const emailNotification = async (userId, { title, message, data }) => {
  try {
    const { rows } = await db.query(
      "SELECT email, first_name, email_verifie, notif_email FROM users WHERE id = $1 AND email NOT LIKE '%@inscrit.school'",
      [userId]
    );
    const u = rows[0];
    if (!u || !u.email_verifie || !u.notif_email) return;
    const { envoyerEmail } = require("./email");
    const lien = `${APP()}/#${data?.lien || "/"}`;
    await envoyerEmail({
      a: u.email,
      nom: u.first_name,
      sujet: `School · ${title}`,
      texte: `Bonjour ${u.first_name},\n\n${title}\n${message}\n\nOuvrir School : ${lien}\n\nPour ne plus recevoir ces emails : Profil › Notifications par email.`,
      html: `<!doctype html><html><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#0f1a3c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:18px;border:1px solid #e3e8f4;overflow:hidden">
<tr><td style="background:#2446d8;padding:18px 24px;color:#fff;font-size:20px;font-weight:bold">School<span style="color:#ffb020">.</span></td></tr>
<tr><td style="padding:24px"><p style="margin:0 0 6px;font-size:15px">Bonjour ${u.first_name},</p>
<h1 style="margin:0 0 8px;font-size:19px">${title}</h1><p style="margin:0 0 20px;font-size:15px;line-height:1.5">${message}</p>
<a href="${lien}" style="display:inline-block;background:#2446d8;color:#fff;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:12px">Ouvrir School</a></td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #e3e8f4;font-size:12px;color:#5d6789">Pour ne plus recevoir ces emails : Profil › Notifications par email.</td></tr>
</table></td></tr></table></body></html>`,
    });
  } catch (e) {
    logger.error(`Email de notification non envoye : ${e.message}`);
  }
};

/** Notifie tous les administrateurs d'un etablissement. */
const notifierEtablissement = async (schoolId, { title, message, type = "system", data = null, priority = "normal" }) => {
  if (!schoolId) return;
  await db.query(
    `INSERT INTO notifications (user_id, title, message, type, priority, data)
     SELECT id, $2, $3, $4, $5, $6 FROM users WHERE school_id = $1 AND role = 'principal' AND is_active = true`,
    [schoolId, title, message, type, priority, data ? JSON.stringify(data) : null]
  );
};

/** Notifie un utilisateur (et lui envoie un email pour les evenements importants). */
const notifierUtilisateur = async (userId, { title, message, type = "system", data = null, priority = "normal" }) => {
  if (!userId) return;
  await db.query(
    "INSERT INTO notifications (user_id, title, message, type, priority, data) VALUES ($1, $2, $3, $4, $5, $6)",
    [userId, title, message, type, priority, data ? JSON.stringify(data) : null]
  );
  if (TYPES_EMAIL.includes(type)) emailNotification(userId, { title, message, data }); // sans attendre
};

module.exports = { notifierEtablissement, notifierUtilisateur, emailNotification };
