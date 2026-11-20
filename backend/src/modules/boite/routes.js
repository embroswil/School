// modules/boite/routes.js
// Boite de reception : notifications et messagerie avec l'etablissement.
// - un parent, un eleve ou un enseignant ecrit a SON etablissement ;
// - l'administrateur de l'etablissement voit tous les messages et repond ;
// - un enseignant peut aussi ecrire aux parents de ses classes (conversation parent <-> enseignant,
//   teacher_id renseigne : l'etablissement ne la voit pas ; cote « ecole » = l'enseignant).
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
      ? await db.query("SELECT COUNT(*)::int AS n FROM conversations WHERE school_id = $1 AND teacher_id IS NULL AND unread_school = true", [u.schoolId])
      : await db.query(
          "SELECT COUNT(*)::int AS n FROM conversations WHERE (user_id = $1 AND unread_user = true) OR (teacher_id = $1 AND unread_school = true)",
          [u.id]
        );
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
           WHERE c.school_id = $1 AND c.teacher_id IS NULL ORDER BY c.updated_at DESC LIMIT 100`,
          [u.schoolId]
        )
      : await db.query(
          // avec : l'interlocuteur (etablissement, enseignant ou parent) ; eleve : l'eleve concerne
          `SELECT c.id, c.subject, c.updated_at,
                  CASE WHEN c.teacher_id = $1 THEN c.unread_school ELSE c.unread_user END AS non_lu,
                  CASE WHEN c.teacher_id = $1 THEN 'parent' WHEN c.teacher_id IS NOT NULL THEN 'enseignant' ELSE 'etablissement' END AS genre,
                  CASE WHEN c.teacher_id = $1 THEN p.first_name || ' ' || p.last_name
                       WHEN c.teacher_id IS NOT NULL THEN t.first_name || ' ' || t.last_name ELSE s.name END AS avec,
                  CASE WHEN e.id IS NOT NULL THEN e.first_name || ' ' || e.last_name END AS eleve,
                  (SELECT body FROM conversation_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS dernier
           FROM conversations c JOIN schools s ON s.id = c.school_id JOIN users p ON p.id = c.user_id
           LEFT JOIN users t ON t.id = c.teacher_id LEFT JOIN users e ON e.id = c.student_id
           WHERE c.user_id = $1 OR c.teacher_id = $1 ORDER BY c.updated_at DESC LIMIT 100`,
          [u.id]
        );
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

// GET /api/boite/destinataires?classe=ID : enseignant, les eleves d'une de ses classes et leurs parents inscrits
router.get("/destinataires", async (req, res, next) => {
  try {
    const u = req.user;
    if (u.role !== "teacher") throw new ApiError(403, "Réservé aux enseignants");
    await classeDeLEnseignant(u, req.query.classe);
    const { rows } = await db.query(
      `SELECT x.id, x.first_name, x.last_name, COUNT(l.parent_id)::int AS parents
       FROM class_students cs JOIN users x ON x.id = cs.student_id
       LEFT JOIN parent_student_links l ON l.student_id = x.id
       WHERE cs.class_id = $1 AND cs.status = 'active'
       GROUP BY x.id ORDER BY x.last_name, x.first_name`,
      [parseInt(req.query.classe, 10) || 0]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

// La classe doit etre une classe de l'enseignant, dans son etablissement actuel
async function classeDeLEnseignant(u, id) {
  const { rows } = await db.query(
    `SELECT c.id, c.name FROM classes c JOIN academic_years ay ON ay.id = c.academic_year_id
     WHERE c.id = $1 AND ay.school_id = $2 AND ay.is_current
       AND (c.class_teacher_id = $3 OR EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.class_id = c.id AND cs.teacher_id = $3))`,
    [parseInt(id, 10) || 0, u.schoolId, u.id]
  );
  if (!rows[0]) throw new ApiError(404, "Classe introuvable");
  return rows[0];
}

// POST /api/boite/messages { subject, body, a: 'etablissement'|'parents', classeId, eleveId }
// Par defaut : message a l'etablissement. Enseignant -> parents : une conversation privee par parent
// (tous les parents de la classe, ou ceux d'un eleve).
router.post("/messages", async (req, res, next) => {
  try {
    const u = req.user;
    if (estEtablissement(u) || u.role === "admin") throw new ApiError(400, "Répondez depuis une conversation existante");
    if (!u.schoolId) throw new ApiError(400, "Aucun établissement associé à votre compte");
    const sujet = texte(req.body?.subject, 200);
    const corps = texte(req.body?.body, 5000);
    if (!sujet || !corps) throw new ApiError(400, "Indiquez un objet et un message");

    if (req.body?.a === "parents") {
      if (u.role !== "teacher") throw new ApiError(403, "Réservé aux enseignants");
      const classe = await classeDeLEnseignant(u, req.body.classeId);
      const eleve = req.body.eleveId ? parseInt(req.body.eleveId, 10) || 0 : null;
      const { rows: liens } = await db.query(
        `SELECT DISTINCT ON (l.parent_id) l.parent_id, l.student_id
         FROM parent_student_links l JOIN class_students cs ON cs.student_id = l.student_id
         WHERE cs.class_id = $1 AND cs.status = 'active' AND ($2::int IS NULL OR l.student_id = $2)
         ORDER BY l.parent_id, l.student_id`,
        [classe.id, eleve]
      );
      if (!liens.length) throw new ApiError(400, eleve ? "Aucun parent n’est encore inscrit pour cet élève." : "Aucun parent n’est encore inscrit dans cette classe.");
      const nom = await nomDe(u.id);
      let premier = null;
      for (const l of liens) {
        const c = await db.query(
          `INSERT INTO conversations (school_id, user_id, teacher_id, student_id, subject, unread_school, unread_user)
           VALUES ($1, $2, $3, $4, $5, false, true) RETURNING id`,
          [u.schoolId, l.parent_id, u.id, l.student_id, sujet]
        );
        premier = premier || c.rows[0].id;
        await db.query("INSERT INTO conversation_messages (conversation_id, sender_id, from_school, body) VALUES ($1, $2, true, $3)", [c.rows[0].id, u.id, corps]);
        await notifierUtilisateur(l.parent_id, {
          title: `Message de ${nom}`,
          message: sujet,
          type: "message",
          data: { conversationId: c.rows[0].id },
        }).catch(() => {});
      }
      return res.status(201).json({ success: true, data: { id: liens.length === 1 ? premier : null, envoyes: liens.length } });
    }

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

// Nom affiche d'un enseignant dans les notifications des parents
const nomDe = async (id) => {
  const r = (await db.query("SELECT first_name, last_name FROM users WHERE id = $1", [id])).rows[0];
  return r ? `${r.first_name || ""} ${r.last_name || ""}`.trim() : "l’enseignant";
};

const coteEcole = (c, u) => (c.teacher_id ? c.teacher_id === u.id : estEtablissement(u));

const chargerConversation = async (id, u) => {
  const { rows } = await db.query("SELECT * FROM conversations WHERE id = $1", [id]);
  const c = rows[0];
  // cote « ecole » : l'administrateur (conversations avec l'etablissement) ou l'enseignant (conversations avec un parent)
  const ok = c && (c.teacher_id ? c.user_id === u.id || c.teacher_id === u.id : estEtablissement(u) ? c.school_id === u.schoolId : c.user_id === u.id);
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
    const ecole = coteEcole(c, u);
    await db.query(`UPDATE conversations SET ${ecole ? "unread_school" : "unread_user"} = false WHERE id = $1`, [c.id]);
    const auteur = await db.query("SELECT first_name, last_name, role, email, phone FROM users WHERE id = $1", [c.user_id]);
    const enseignant = c.teacher_id ? (await db.query("SELECT first_name, last_name FROM users WHERE id = $1", [c.teacher_id])).rows[0] : null;
    const eleve = c.student_id ? (await db.query("SELECT first_name, last_name FROM users WHERE id = $1", [c.student_id])).rows[0] : null;
    res.json({ success: true, data: { conversation: c, auteur: auteur.rows[0], enseignant, eleve, coteEcole: ecole, messages: rows } });
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
    const deEtab = coteEcole(c, u);
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
    if (c.teacher_id && deEtab) {
      await notifierUtilisateur(c.user_id, { title: `Message de ${await nomDe(u.id)}`, message: c.subject, type: "message", data: { conversationId: c.id } });
    } else if (c.teacher_id) {
      await notifierUtilisateur(c.teacher_id, { title: "Réponse d’un parent", message: c.subject, type: "message", data: { conversationId: c.id } });
    } else if (deEtab) {
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
