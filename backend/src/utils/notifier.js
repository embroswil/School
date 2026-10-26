// utils/notifier.js
// Envoi de notifications dans l'application.
const db = require("../config/db");

/** Notifie tous les administrateurs d'un etablissement. */
const notifierEtablissement = async (schoolId, { title, message, type = "system", data = null, priority = "normal" }) => {
  if (!schoolId) return;
  await db.query(
    `INSERT INTO notifications (user_id, title, message, type, priority, data)
     SELECT id, $2, $3, $4, $5, $6 FROM users WHERE school_id = $1 AND role = 'principal' AND is_active = true`,
    [schoolId, title, message, type, priority, data ? JSON.stringify(data) : null]
  );
};

/** Notifie un utilisateur. */
const notifierUtilisateur = async (userId, { title, message, type = "system", data = null, priority = "normal" }) => {
  if (!userId) return;
  await db.query(
    "INSERT INTO notifications (user_id, title, message, type, priority, data) VALUES ($1, $2, $3, $4, $5, $6)",
    [userId, title, message, type, priority, data ? JSON.stringify(data) : null]
  );
};

module.exports = { notifierEtablissement, notifierUtilisateur };
