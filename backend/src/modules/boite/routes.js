// modules/boite/routes.js
// Boite de reception : notifications et messagerie avec l'etablissement.
// - un parent, un eleve ou un enseignant ecrit a SON etablissement ;
// - l'administrateur de l'etablissement voit tous les messages et repond.
const express = require("express");
const router = express.Router();
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { authenticate } = require("../../middlewares/auth.middleware");
const { notifierEtablissement, notifierUtilisateur } = require("../../utils/notifier");

router.use(authenticate);

const estEtablissement = (u) => u.role === "principal";
const texte = (v, max) => (v === undefined || v === null ? "" : String(v).trim().slice(0, max));

// Compteurs pour les pastilles : notifications et messages non lus
router.get("/compteurs", async (req, res, next) => {
  try {
    const u = req.user;
    const notif = await db.query("SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND is_read = false", [u.id]);
    const msg = estEtablissement(u)
      ? await db.query("SELECT COUNT(*)::int AS n FROM conversations WHERE school_id = $1 AND unread_school = true", [u.schoolId])
      : await db.query("SELECT COUNT(*)::int AS n FROM conversations WHERE user_id = $1 AND unread_user = true", [u.id]);
    res.json({ success: true, data: { notifications: notif.rows[0].n, messages: msg.rows[0].n } });
  } catch (e) {
    next(e);
  }
});

// Notifications (les 50 dernieres)
router.get("/notifications", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, title, message, type, is_read, data, created_at FROM notifications
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

router.post("/notifications/lues", async (req, res, next) => {
  try {
    await db.query("UPDATE notifications SET is_read = true, read_at = NOW() WHERE user_id = $1 AND is_read = false", [req.user.id]);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// Conversations
router.get("/messages", async (req, res, next) => {
  try {
    const u = req.user;
    const { rows } = estEtablissement(u)
      ? await db.query(
          `SELECT c.id, c.subject, c.updated_at, c.unread_school AS non_lu,
                  u.first_name, u.last_name, u.role,
                  (SELECT body FROM conversation_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS dernier
           FROM conversations c JOIN users u ON u.id = c.user_id
           WHERE c.school_id = $1 ORDER BY c.updated_at DESC LIMIT 100`,
          [u.schoolId]
        )
      : await db.query(
          `SELECT c.id, c.subject, c.updated_at, c.unread_user AS non_lu,
                  (SELECT body FROM conversation_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS dernier
           FROM conversations c WHERE c.user_id = $1 ORDER BY c.updated_at DESC LIMIT 100`,
          [u.id]
        );
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

// Nouveau message a l'etablissement
router.post("/messages", async (req, res, next) => {
  try {
    const u = req.user;
    if (estEtablissement(u) || u.role === "admin") throw new ApiError(400, "Répondez depuis une conversation existante");
    if (!u.schoolId) throw new ApiError(400, "Aucun établissement associé à votre compte");
    const sujet = texte(req.body?.subject, 200);
    const corps = texte(req.body?.body, 5000);
    if (!sujet || !corps) throw new ApiError(400, "Indiquez un objet et un message");
    const c = await db.query(
      "INSERT INTO conversations (school_id, user_id, subject, unread_school, unread_user) VALUES ($1, $2, $3, true, false) RETURNING id",
      [u.schoolId, u.id, sujet]
    );
    await db.query("INSERT INTO conversation_messages (conversation_id, sender_id, from_school, body) VALUES ($1, $2, false, $3)", [
      c.rows[0].id,
      u.id,
      corps,
    ]);
    await notifierEtablissement(u.schoolId, {
      title: "Nouveau message",
      message: `${sujet}`,
      type: "message",
      data: { conversationId: c.rows[0].id },
    });
    res.status(201).json({ success: true, data: { id: c.rows[0].id } });
  } catch (e) {
    next(e);
  }
});

const chargerConversation = async (id, u) => {
  const { rows } = await db.query("SELECT * FROM conversations WHERE id = $1", [id]);
  const c = rows[0];
  const ok = c && (estEtablissement(u) ? c.school_id === u.schoolId : c.user_id === u.id);
  if (!ok) throw new ApiError(404, "Conversation introuvable");
  return c;
};

router.get("/messages/:id", async (req, res, next) => {
  try {
    const u = req.user;
    const c = await chargerConversation(parseInt(req.params.id, 10), u);
    const { rows } = await db.query(
      `SELECT m.id, m.body, m.from_school, m.created_at, u.first_name, u.last_name
       FROM conversation_messages m LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = $1 ORDER BY m.created_at`,
      [c.id]
    );
    await db.query(`UPDATE conversations SET ${estEtablissement(u) ? "unread_school" : "unread_user"} = false WHERE id = $1`, [c.id]);
    const auteur = await db.query("SELECT first_name, last_name, role, email, phone FROM users WHERE id = $1", [c.user_id]);
    res.json({ success: true, data: { conversation: c, auteur: auteur.rows[0], messages: rows } });
  } catch (e) {
    next(e);
  }
});

router.post("/messages/:id", async (req, res, next) => {
  try {
    const u = req.user;
    const c = await chargerConversation(parseInt(req.params.id, 10), u);
    const corps = texte(req.body?.body, 5000);
    if (!corps) throw new ApiError(400, "Le message est vide");
    const deEtab = estEtablissement(u);
    await db.query("INSERT INTO conversation_messages (conversation_id, sender_id, from_school, body) VALUES ($1, $2, $3, $4)", [
      c.id,
      u.id,
      deEtab,
      corps,
    ]);
    await db.query(
      `UPDATE conversations SET updated_at = NOW(), ${deEtab ? "unread_user = true" : "unread_school = true"} WHERE id = $1`,
      [c.id]
    );
    if (deEtab) {
      await notifierUtilisateur(c.user_id, { title: "Réponse de l'établissement", message: c.subject, type: "message", data: { conversationId: c.id } });
    } else {
      await notifierEtablissement(c.school_id, { title: "Nouveau message", message: c.subject, type: "message", data: { conversationId: c.id } });
    }
    res.status(201).json({ success: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
