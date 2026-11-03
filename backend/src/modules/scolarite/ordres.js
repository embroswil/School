// modules/scolarite/ordres.js
// Paiement « P2P » des frais de scolarite, comme sur les plateformes d'echange :
// 1. le parent cree un ordre (frais, montant, Orange Money ou MTN MoMo) : School
//    affiche le numero de l'etablissement, le montant exact et un code a mettre en motif ;
// 2. il a 30 minutes pour payer depuis son telephone, puis touche « J'ai paye »
//    (ID de transaction, capture facultative) ;
// 3. l'etablissement verifie son compte et confirme la reception (recu automatique),
//    ou ouvre un litige ; l'administrateur de la plateforme arbitre les litiges.
// L'argent va directement de l'un a l'autre : School ne le touche jamais.
const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { authenticate } = require("../../middlewares/auth.middleware");
const { notifierEtablissement, notifierUtilisateur } = require("../../utils/notifier");
const S = require("./routes");

router.use(authenticate);
const DELAI_MINUTES = 30;
const entier = (v) => parseInt(String(v ?? "").replace(/\s/g, ""), 10);
const texte = (v, max) => String(v ?? "").trim().slice(0, max);
const fcfa = (n) => `${Number(n).toLocaleString("fr-FR")} FCFA`;
const OPERATEURS = { orange_money: "Orange Money", mtn_momo: "MTN MoMo" };
const nouveauCode = () => {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.randomBytes(6), (b) => a[b % a.length]).join("");
};

const SQL_ORDRE = `
  SELECT o.*, f.nom AS frais, u.first_name, u.last_name, s.name AS ecole, s.paiement_instructions AS consignes,
         pp.first_name AS parent_prenom, pp.last_name AS parent_nom, pp.phone AS parent_tel,
         (SELECT c.name FROM class_students cs JOIN classes c ON c.id = cs.class_id
          WHERE cs.student_id = o.student_id AND cs.status = 'active' ORDER BY cs.enrolled_at DESC LIMIT 1) AS classe
  FROM ordres_paiement o JOIN frais_scolaires f ON f.id = o.frais_id JOIN users u ON u.id = o.student_id
  JOIN schools s ON s.id = o.school_id LEFT JOIN users pp ON pp.id = o.cree_par`;

// L'ordre tel qu'il est vu par l'utilisateur (null si pas d'acces)
const chargerOrdre = async (u, id) => {
  const o = (await db.query(`${SQL_ORDRE} WHERE o.id = $1`, [id])).rows[0];
  if (!o) return null;
  const role =
    u.role === "admin"
      ? "arbitre"
      : u.role === "principal" && u.schoolId === o.school_id
        ? "etablissement"
        : o.cree_par === u.id || (await S.elevesAccessibles(u)).includes(o.student_id)
          ? "payeur"
          : null;
  if (!role) return null;
  // Expiration a la lecture (en plus de la tache automatique)
  if (o.statut === "a_payer" && new Date(o.expire_le) < new Date()) {
    await db.query("UPDATE ordres_paiement SET statut = 'expire' WHERE id = $1 AND statut = 'a_payer'", [o.id]);
    o.statut = "expire";
  }
  return { ...o, monRole: role };
};
const exiger = async (u, id, roles) => {
  const o = await chargerOrdre(u, id);
  if (!o) throw new ApiError(404, "Ordre introuvable");
  if (roles && !roles.includes(o.monRole)) throw new ApiError(403, "Action non autorisée");
  return o;
};
const ajouterMessage = (ordreId, auteurId, role, txt) =>
  db.query("INSERT INTO messages_ordre (ordre_id, auteur_id, role, texte) VALUES ($1, $2, $3, $4)", [ordreId, auteurId, role, txt.slice(0, 1000)]);
const lien = (o) => ({ lien: `/ordres/${o.id}` });

// Confirme la reception : cree le paiement (recu automatique) et clot l'ordre
const confirmerOrdre = async (o, userId, message) => {
  const s = await S.situationEleve(o.student_id);
  const f = s?.frais.find((x) => x.id === o.frais_id);
  const montant = Math.min(o.montant, f ? f.reste : o.montant) || o.montant;
  const { rows } = await db.query(
    `INSERT INTO paiements_scolaires (school_id, frais_id, student_id, montant, mode, statut, reference, telephone, paye_par, enregistre_par, confirme_le)
     VALUES ($1, $2, $3, $4, 'mobile_money', 'reussi', $5, $6, $7, $8, NOW()) RETURNING *`,
    [o.school_id, o.frais_id, o.student_id, montant, `P2P-${o.code}`, o.telephone_payeur, o.cree_par, userId]
  );
  const maj = await db.query(
    `UPDATE ordres_paiement SET statut = 'confirme', confirme_le = NOW(), confirme_par = $2, paiement_id = $3
     WHERE id = $1 AND statut IN ('paye', 'litige') RETURNING id`,
    [o.id, userId, rows[0].id]
  );
  if (!maj.rowCount) {
    await db.query("DELETE FROM paiements_scolaires WHERE id = $1", [rows[0].id]);
    throw new ApiError(409, "Cet ordre a déjà été traité");
  }
  await ajouterMessage(o.id, userId, "systeme", message);
  // Recu, notification du payeur et des autres parents (sans renotifier l'etablissement)
  await S.apresPaiement({ ...rows[0], school_id: -1 });
  return rows[0];
};

// ---------------------------------------------------------------- creation et suivi

// POST /api/scolarite/ordres { studentId, fraisId, montant, moyen }
router.post("/", async (req, res, next) => {
  try {
    const u = req.user;
    const studentId = entier(req.body?.studentId);
    const fraisId = entier(req.body?.fraisId);
    const montant = entier(req.body?.montant);
    const moyen = OPERATEURS[req.body?.moyen] ? req.body.moyen : null;
    if (!(await S.elevesAccessibles(u)).includes(studentId)) throw new ApiError(403, "Élève non relié à votre compte");
    if (!moyen) throw new ApiError(400, "Choisissez Orange Money ou MTN MoMo");
    const s = await S.situationEleve(studentId);
    const f = s?.frais.find((x) => x.id === fraisId);
    if (!f) throw new ApiError(404, "Frais introuvable");
    // Montant restant, deduction faite des ordres deja en cours pour ce frais
    const enCours = (
      await db.query(
        "SELECT COALESCE(SUM(montant), 0)::int AS t FROM ordres_paiement WHERE student_id = $1 AND frais_id = $2 AND statut IN ('a_payer', 'paye', 'litige') AND (statut <> 'a_payer' OR expire_le > NOW())",
        [studentId, fraisId]
      )
    ).rows[0].t;
    const max = f.reste - enCours;
    if (max <= 0) throw new ApiError(400, "Un paiement est déjà en cours pour ce frais : terminez-le ou annulez-le d’abord");
    if (!(montant >= 100) || montant > max) throw new ApiError(400, `Montant entre 100 et ${fcfa(max)}`);
    const ecole = (await db.query("SELECT orange_money, mtn_momo FROM users u JOIN schools sc ON sc.id = u.school_id WHERE u.id = $1", [studentId])).rows[0] || {};
    const numero = moyen === "orange_money" ? ecole.orange_money : ecole.mtn_momo;
    if (!numero) throw new ApiError(400, `L’établissement n’a pas de numéro ${OPERATEURS[moyen]}`);
    const schoolId = (await db.query("SELECT school_id FROM users WHERE id = $1", [studentId])).rows[0].school_id;
    let o = null;
    for (let i = 0; i < 5 && !o; i++) {
      o = (
        await db.query(
          `INSERT INTO ordres_paiement (code, school_id, student_id, frais_id, montant, moyen, numero_destinataire, cree_par, expire_le)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() + ($9 || ' minutes')::interval)
           ON CONFLICT (code) DO NOTHING RETURNING id`,
          [nouveauCode(), schoolId, studentId, fraisId, montant, moyen, numero, u.id, String(DELAI_MINUTES)]
        )
      ).rows[0];
    }
    await ajouterMessage(o.id, null, "systeme", `Ordre créé : ${fcfa(montant)} à envoyer par ${OPERATEURS[moyen]} au ${numero}.`);
    res.status(201).json({ success: true, data: { id: o.id } });
  } catch (e) {
    next(e);
  }
});

// GET /api/scolarite/ordres?statut=… : mes ordres (parent), ceux de l'ecole, ou les litiges (plateforme)
router.get("/", async (req, res, next) => {
  try {
    const u = req.user;
    await db.query("UPDATE ordres_paiement SET statut = 'expire' WHERE statut = 'a_payer' AND expire_le < NOW()");
    let where, params;
    if (u.role === "admin") {
      where = "o.statut = 'litige'";
      params = [];
    } else if (u.role === "principal") {
      where = "o.school_id = $1";
      params = [u.schoolId];
    } else {
      const ids = await S.elevesAccessibles(u);
      where = "(o.cree_par = $1 OR o.student_id = ANY($2))";
      params = [u.id, ids];
    }
    const statut = texte(req.query.statut, 40);
    if (statut) {
      params.push(statut.split(","));
      where += ` AND o.statut = ANY($${params.length})`;
    }
    const { rows } = await db.query(
      `${SQL_ORDRE.replace("o.*,", "o.id, o.code, o.school_id, o.student_id, o.montant, o.moyen, o.statut, o.transaction, o.expire_le, o.paye_le, o.confirme_le, o.created_at,")}
       WHERE ${where} ORDER BY CASE o.statut WHEN 'litige' THEN 0 WHEN 'paye' THEN 1 WHEN 'a_payer' THEN 2 ELSE 3 END, o.created_at DESC LIMIT 100`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

// GET /api/scolarite/ordres/:id : l'ordre et sa discussion
router.get("/:id", async (req, res, next) => {
  try {
    const o = await exiger(req.user, entier(req.params.id));
    const messages = (
      await db.query(
        `SELECT m.id, m.role, m.texte, m.created_at, m.auteur_id, u.first_name, u.last_name
         FROM messages_ordre m LEFT JOIN users u ON u.id = m.auteur_id WHERE m.ordre_id = $1 ORDER BY m.created_at`,
        [o.id]
      )
    ).rows;
    res.json({ success: true, data: { ...o, operateur: OPERATEURS[o.moyen], delaiMinutes: DELAI_MINUTES, messages, maintenant: new Date().toISOString() } });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------- actions du payeur

// POST /api/scolarite/ordres/:id/payer { transaction, telephone, preuve }
router.post("/:id/payer", async (req, res, next) => {
  try {
    const o = await exiger(req.user, entier(req.params.id), ["payeur"]);
    if (o.statut !== "a_payer") throw new ApiError(400, o.statut === "expire" ? "Ordre expiré : créez un nouvel ordre" : "Cet ordre n’est plus en attente de paiement");
    const transaction = texte(req.body?.transaction, 120);
    if (transaction.length < 4) throw new ApiError(400, "Indiquez l’ID de la transaction reçu par SMS");
    const preuve = req.body?.preuve ? String(req.body.preuve) : null;
    if (preuve && (!/^data:image\/(jpeg|png|webp);base64,/.test(preuve) || preuve.length > 700000)) throw new ApiError(400, "Capture invalide ou trop lourde");
    try {
      await db.query(
        `UPDATE ordres_paiement SET statut = 'paye', paye_le = NOW(), transaction = $2, telephone_payeur = $3, preuve = $4 WHERE id = $1 AND statut = 'a_payer'`,
        [o.id, transaction, texte(req.body?.telephone, 30) || null, preuve]
      );
    } catch (err) {
      if (err.code === "23505") throw new ApiError(409, "Cet ID de transaction a déjà été utilisé");
      throw err;
    }
    await ajouterMessage(o.id, req.user.id, "systeme", `Paiement signalé par le parent · transaction ${transaction}.`);
    await notifierEtablissement(o.school_id, {
      title: "Paiement à confirmer",
      message: `${fcfa(o.montant)} par ${OPERATEURS[o.moyen]} · ${o.frais} · ${o.first_name} ${o.last_name} · code ${o.code}`,
      type: "payment",
      priority: "high",
      data: lien(o),
    }).catch(() => {});
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// POST /api/scolarite/ordres/:id/annuler : seulement avant d'avoir paye
router.post("/:id/annuler", async (req, res, next) => {
  try {
    const o = await exiger(req.user, entier(req.params.id), ["payeur"]);
    const r = await db.query("UPDATE ordres_paiement SET statut = 'annule', motif = 'Annulé par le parent' WHERE id = $1 AND statut = 'a_payer'", [o.id]);
    if (!r.rowCount) throw new ApiError(400, "Cet ordre ne peut plus être annulé");
    await ajouterMessage(o.id, req.user.id, "systeme", "Ordre annulé par le parent.");
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------- actions de l'etablissement

// POST /api/scolarite/ordres/:id/confirmer : l'argent est bien arrive
router.post("/:id/confirmer", async (req, res, next) => {
  try {
    const o = await exiger(req.user, entier(req.params.id), ["etablissement"]);
    if (!["paye", "litige"].includes(o.statut)) throw new ApiError(400, "Rien à confirmer pour cet ordre");
    const p = await confirmerOrdre(o, req.user.id, "Réception confirmée par l’établissement. Reçu émis.");
    res.json({ success: true, data: { paiementId: p.id } });
  } catch (e) {
    next(e);
  }
});

// POST /api/scolarite/ordres/:id/litige { motif } : etablissement (rien recu) ou parent (pas de confirmation apres 24 h)
router.post("/:id/litige", async (req, res, next) => {
  try {
    const o = await exiger(req.user, entier(req.params.id), ["etablissement", "payeur"]);
    if (o.statut !== "paye") throw new ApiError(400, "Un litige ne peut être ouvert que sur un paiement signalé");
    if (o.monRole === "payeur" && Date.now() - new Date(o.paye_le).getTime() < 24 * 3600 * 1000) {
      throw new ApiError(400, "Laissez à l’établissement 24 heures pour confirmer avant d’ouvrir un litige");
    }
    const motif = texte(req.body?.motif, 500) || (o.monRole === "etablissement" ? "Montant non reçu sur le compte" : "Paiement non confirmé");
    await db.query("UPDATE ordres_paiement SET statut = 'litige', motif = $2 WHERE id = $1 AND statut = 'paye'", [o.id, motif]);
    await ajouterMessage(o.id, req.user.id, "systeme", `Litige ouvert par ${o.monRole === "etablissement" ? "l’établissement" : "le parent"} : ${motif}`);
    const autre = o.monRole === "etablissement" ? o.cree_par : null;
    if (autre) {
      await notifierUtilisateur(autre, { title: "Paiement contesté", message: `${fcfa(o.montant)} · ${o.frais} : ${motif}`, type: "payment", priority: "high", data: lien(o) }).catch(() => {});
    } else {
      await notifierEtablissement(o.school_id, { title: "Litige ouvert par un parent", message: `${fcfa(o.montant)} · ${o.first_name} ${o.last_name} : ${motif}`, type: "payment", priority: "high", data: lien(o) }).catch(() => {});
    }
    const admins = await db.query("SELECT id FROM users WHERE role = 'admin' AND is_active");
    for (const a of admins.rows) {
      await notifierUtilisateur(a.id, { title: "Litige de paiement à arbitrer", message: `${o.ecole} · ${fcfa(o.montant)} · code ${o.code}`, type: "payment", data: lien(o) }).catch(() => {});
    }
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------- discussion et arbitrage

// POST /api/scolarite/ordres/:id/messages { texte }
router.post("/:id/messages", async (req, res, next) => {
  try {
    const o = await exiger(req.user, entier(req.params.id));
    const t = texte(req.body?.texte, 1000);
    if (!t) throw new ApiError(400, "Message vide");
    await ajouterMessage(o.id, req.user.id, o.monRole, t);
    const dest = o.monRole === "payeur" ? null : o.cree_par;
    if (dest) {
      await notifierUtilisateur(dest, { title: `Message sur votre paiement ${o.code}`, message: t.slice(0, 140), type: "message", data: lien(o) }).catch(() => {});
    } else if (o.monRole === "payeur") {
      await notifierEtablissement(o.school_id, { title: `Message sur le paiement ${o.code}`, message: t.slice(0, 140), type: "message", data: lien(o) }).catch(() => {});
    }
    res.status(201).json({ success: true });
  } catch (e) {
    next(e);
  }
});

// POST /api/scolarite/ordres/:id/arbitrer { decision: 'confirmer' | 'annuler', motif } (administrateur de la plateforme)
router.post("/:id/arbitrer", async (req, res, next) => {
  try {
    const o = await exiger(req.user, entier(req.params.id), ["arbitre"]);
    if (o.statut !== "litige") throw new ApiError(400, "Cet ordre n’est pas en litige");
    const motif = texte(req.body?.motif, 500) || "Décision de l’arbitrage School";
    if (req.body?.decision === "confirmer") {
      await confirmerOrdre(o, req.user.id, `Arbitrage School : paiement validé. ${motif}`);
    } else {
      await db.query("UPDATE ordres_paiement SET statut = 'annule', motif = $2 WHERE id = $1", [o.id, motif]);
      await ajouterMessage(o.id, req.user.id, "systeme", `Arbitrage School : ordre annulé. ${motif}`);
    }
    for (const dest of [o.cree_par]) {
      if (dest) await notifierUtilisateur(dest, { title: "Décision sur votre paiement", message: motif, type: "payment", data: lien(o) }).catch(() => {});
    }
    await notifierEtablissement(o.school_id, { title: `Décision sur le paiement ${o.code}`, message: motif, type: "payment", data: lien(o) }).catch(() => {});
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
