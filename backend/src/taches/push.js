// taches/push.js
// Toute notification creee dans School (absence, note, paiement, message…) part aussi
// en notification « push » sur les telephones abonnes. Verification toutes les 15 s.
const db = require("../config/db");
const logger = require("../utils/logger");
const W = require("../utils/webpush");

let enCours = false;
const envoyer = async () => {
  if (!W.configuree() || enCours) return;
  enCours = true;
  try {
    // Notifications recentes pas encore poussees (au plus 500 a la fois)
    const { rows } = await db.query(
      `UPDATE notifications SET push_envoye = true
       WHERE id IN (SELECT id FROM notifications WHERE NOT push_envoye AND created_at > NOW() - INTERVAL '30 minutes' ORDER BY id LIMIT 500)
       RETURNING id, user_id, title, message, data`
    );
    if (!rows.length) return;
    const abos = (
      await db.query(
        "SELECT a.*, u.langue FROM push_abonnements a JOIN users u ON u.id = a.user_id WHERE a.user_id = ANY($1)",
        [[...new Set(rows.map((r) => r.user_id))]]
      )
    ).rows;
    const { traduireNotification } = require("../utils/langue");
    for (const n of rows) {
      for (const a of abos.filter((x) => x.user_id === n.user_id)) {
        try {
          const t = traduireNotification(n, a.langue);
          const statut = await W.envoyer(a, { title: t.title, body: t.message || "", lien: n.data?.lien || "/notifications", tag: `n${n.id}` });
          if (statut === 404 || statut === 410) await db.query("DELETE FROM push_abonnements WHERE id = $1", [a.id]);
        } catch (e) {
          logger.error(`Push : ${e.message}`);
        }
      }
    }
  } catch (e) {
    logger.error(`Push : ${e.message}`);
  } finally {
    enCours = false;
  }
};

const demarrer = () => {
  // Les notifications anciennes (serveur endormi) ne sont pas envoyees en rafale au reveil
  db.query("UPDATE notifications SET push_envoye = true WHERE NOT push_envoye AND created_at <= NOW() - INTERVAL '30 minutes'").catch(() => {});
  setInterval(envoyer, 15000);
};

module.exports = { envoyer, demarrer };
