// modules/abonnement/routes.js
// Abonnement des etablissements : page de l'etablissement, et gestion par
// l'administrateur de la plateforme (tarifs, confirmations, encaissements).
const express = require("express");
const router = express.Router();
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { authenticate, isPlatformAdmin } = require("../../middlewares/auth.middleware");
const { notifierUtilisateur, emailNotification } = require("../../utils/notifier");
const S = require("./service");

router.use(authenticate);
const entier = (v) => parseInt(v, 10);
const fcfa = (n) => `${Number(n || 0).toLocaleString("fr-FR")} FCFA`;
const MOYENS = ["orange_money", "mtn_momo", "virement", "especes", "notchpay", "autre"];

const numeroRecu = (annee, id) => `SCH-${annee.slice(0, 4)}-${String(id).padStart(5, "0")}`;
const confirmer = async (paiementId, adminId) => {
  const { rows } = await db.query(
    `UPDATE paiements_abonnement SET statut = 'confirme', confirme_par = $2, confirme_le = NOW(), motif_rejet = NULL
     WHERE id = $1 RETURNING *, (SELECT annee FROM abonnements a WHERE a.id = abonnement_id) AS annee,
               (SELECT school_id FROM abonnements a WHERE a.id = abonnement_id) AS school_id`,
    [paiementId, adminId]
  );
  const p = rows[0];
  if (!p) throw new ApiError(404, "Paiement introuvable");
  await db.query("UPDATE paiements_abonnement SET numero_recu = $2 WHERE id = $1 AND numero_recu IS NULL", [p.id, numeroRecu(p.annee, p.id)]);
  S.oublier(p.school_id);
  const chefs = await db.query("SELECT id FROM users WHERE school_id = $1 AND role = 'principal'", [p.school_id]);
  for (const c of chefs.rows) {
    await notifierUtilisateur(c.id, {
      title: "Paiement de l’abonnement confirmé",
      message: `${fcfa(p.montant)} reçus pour l’année ${p.annee}. Votre reçu est disponible.`,
      type: "payment",
      data: { lien: "/abonnement" },
    }).catch(() => {});
  }
  return p;
};

// ---------------------------------------------------------------- cote etablissement

// GET /api/abonnement : etat, historique, moyens de paiement
router.get("/", async (req, res, next) => {
  try {
    if (!req.user.schoolId) throw new ApiError(400, "Aucun établissement associé");
    const e = await S.etat(req.user.schoolId);
    if (req.user.role !== "principal") return res.json({ success: true, data: { statut: e.statut, annee: e.annee } });
    const r = await S.reglages();
    const historique = (
      await db.query(
        `SELECT p.id, p.montant, p.moyen, p.reference, p.statut, p.motif_rejet, p.numero_recu, p.created_at, p.confirme_le, a.annee
         FROM paiements_abonnement p JOIN abonnements a ON a.id = p.abonnement_id
         WHERE a.school_id = $1 ORDER BY p.created_at DESC`,
        [req.user.schoolId]
      )
    ).rows;
    res.json({
      success: true,
      data: {
        ...e,
        historique: historique.filter((h) => !["en_attente", "echoue"].includes(h.statut)),
        enLigne: Boolean(cleNotchPay()),
        paiement: { beneficiaire: r.beneficiaire, orangeMoney: r.orangeMoney, mtnMomo: r.mtnMomo, instructions: r.instructions },
      },
    });
  } catch (err) {
    next(err);
  }
});

// NotchPay de la plateforme : l'etablissement paie son abonnement en ligne
const cleNotchPay = () => process.env.NOTCHPAY_PUBLIC_KEY || "";
const verifierEnLigne = async (p) => {
  const r = await fetch(`https://api.notchpay.co/payments/${encodeURIComponent(p.reference)}`, {
    headers: { Authorization: cleNotchPay(), Accept: "application/json" },
  });
  const j = await r.json().catch(() => ({}));
  const etat = j?.transaction?.status || j?.status;
  if (etat === "complete") {
    await confirmer(p.id, null);
    return "confirme";
  }
  if (["failed", "canceled", "expired", "rejected"].includes(etat)) {
    await db.query("UPDATE paiements_abonnement SET statut = 'echoue' WHERE id = $1 AND statut = 'en_attente'", [p.id]);
    return "echoue";
  }
  return "en_attente";
};

// POST /api/abonnement/payer { montant } : redirige vers la page de paiement NotchPay
router.post("/payer", async (req, res, next) => {
  try {
    if (req.user.role !== "principal") throw new ApiError(403, "Réservé à l’administration de l’établissement");
    if (!cleNotchPay()) throw new ApiError(400, "Le paiement en ligne n’est pas encore activé : utilisez le transfert puis déclarez-le");
    const e = await S.etat(req.user.schoolId);
    if (e.statut === "gratuit" || e.reste <= 0) throw new ApiError(400, "Rien à payer");
    const montant = Math.min(entier(req.body?.montant) || e.reste, e.reste);
    if (!(montant >= 100)) throw new ApiError(400, "Montant invalide");
    const reference = `ABO-${req.user.schoolId}-${Date.now()}`;
    const { rows } = await db.query(
      `INSERT INTO paiements_abonnement (abonnement_id, montant, moyen, reference, statut, declare_par) VALUES ($1, $2, 'notchpay', $3, 'en_attente', $4) RETURNING id`,
      [e.id, montant, reference, req.user.id]
    );
    const ecole = (await db.query("SELECT name FROM schools WHERE id = $1", [req.user.schoolId])).rows[0]?.name || "Établissement";
    const r = await fetch("https://api.notchpay.co/payments/initialize", {
      method: "POST",
      headers: { Authorization: cleNotchPay(), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        amount: montant,
        currency: "XAF",
        email: req.user.email,
        reference,
        callback: `${(process.env.FRONTEND_URL || "").split(",")[0].trim()}/#/abonnement`,
        description: `Abonnement School ${e.annee} – ${ecole}`,
      }),
    });
    const j = await r.json().catch(() => ({}));
    const url = j?.authorization_url || j?.transaction?.authorization_url;
    if (!r.ok || !url) {
      await db.query("UPDATE paiements_abonnement SET statut = 'echoue' WHERE id = $1", [rows[0].id]);
      throw new ApiError(502, j?.message || "Le service de paiement ne répond pas");
    }
    res.json({ success: true, data: { url, reference } });
  } catch (err) {
    next(err);
  }
});

// GET /api/abonnement/verifier/:reference : au retour de NotchPay
router.get("/verifier/:reference", async (req, res, next) => {
  try {
    const p = (await db.query("SELECT * FROM paiements_abonnement WHERE reference = $1", [String(req.params.reference).slice(0, 120)])).rows[0];
    if (!p) throw new ApiError(404, "Paiement introuvable");
    const statut = p.statut === "en_attente" ? await verifierEnLigne(p) : p.statut;
    res.json({ success: true, data: { statut, id: p.id } });
  } catch (err) {
    next(err);
  }
});

// POST /api/abonnement/declarer { montant, moyen, reference }
router.post("/declarer", async (req, res, next) => {
  try {
    if (req.user.role !== "principal") throw new ApiError(403, "Réservé à l’administration de l’établissement");
    const e = await S.etat(req.user.schoolId);
    if (e.statut === "gratuit") throw new ApiError(400, "Votre abonnement est gratuit");
    const montant = entier(req.body?.montant);
    if (!(montant > 0)) throw new ApiError(400, "Montant invalide");
    const moyen = MOYENS.includes(req.body?.moyen) ? req.body.moyen : "autre";
    const reference = String(req.body?.reference || "").trim().slice(0, 120);
    if (!reference) throw new ApiError(400, "Indiquez la référence de la transaction");
    const { rows } = await db.query(
      `INSERT INTO paiements_abonnement (abonnement_id, montant, moyen, reference, declare_par) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [e.id, montant, moyen, reference, req.user.id]
    );
    const ecole = (await db.query("SELECT name FROM schools WHERE id = $1", [req.user.schoolId])).rows[0]?.name;
    const admins = await db.query("SELECT id FROM users WHERE role = 'admin' AND is_active");
    for (const a of admins.rows) {
      await notifierUtilisateur(a.id, {
        title: "Paiement d’abonnement à confirmer",
        message: `${ecole} : ${fcfa(montant)} (réf. ${reference})`,
        type: "payment",
        data: { lien: "/abonnements" },
      }).catch(() => {});
    }
    res.status(201).json({ success: true, data: { id: rows[0].id } });
  } catch (err) {
    next(err);
  }
});

// GET /api/abonnement/recus/:id : donnees du recu (etablissement concerne ou plateforme)
router.get("/recus/:id", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT p.*, a.annee, a.montant AS montant_annuel, a.school_id, s.name AS ecole, s.city, s.type
       FROM paiements_abonnement p JOIN abonnements a ON a.id = p.abonnement_id JOIN schools s ON s.id = a.school_id
       WHERE p.id = $1 AND p.statut = 'confirme'`,
      [entier(req.params.id)]
    );
    const p = rows[0];
    if (!p || (req.user.role !== "admin" && p.school_id !== req.user.schoolId)) throw new ApiError(404, "Reçu introuvable");
    const r = await S.reglages();
    res.json({ success: true, data: { ...p, beneficiaire: r.beneficiaire } });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- cote plateforme

// GET /api/abonnement/admin : tous les etablissements, paiements a confirmer, totaux
router.get("/admin", isPlatformAdmin, async (req, res, next) => {
  try {
    const ecoles = (await db.query("SELECT id, name, city, type, is_active, tarif_annuel, abonnement_gratuit FROM schools ORDER BY name")).rows;
    const liste = [];
    for (const e of ecoles) liste.push({ ...e, abonnement: await S.etat(e.id) });
    const attente = (
      await db.query(
        `SELECT p.id, p.montant, p.moyen, p.reference, p.created_at, s.name AS ecole, a.annee
         FROM paiements_abonnement p JOIN abonnements a ON a.id = p.abonnement_id JOIN schools s ON s.id = a.school_id
         WHERE p.statut = 'declare' ORDER BY p.created_at`
      )
    ).rows;
    const annee = S.anneeCourante();
    const payants = liste.filter((x) => x.abonnement && x.abonnement.statut !== "gratuit");
    res.json({
      success: true,
      data: {
        annee,
        reglages: await S.reglages(),
        totaux: {
          attendu: payants.reduce((s, x) => s + x.abonnement.montant, 0),
          encaisse: payants.reduce((s, x) => s + x.abonnement.paye, 0),
          reste: payants.reduce((s, x) => s + x.abonnement.reste, 0),
          enRetard: payants.filter((x) => ["en_retard", "lecture_seule"].includes(x.abonnement.statut)).length,
          gratuits: liste.length - payants.length,
        },
        attente,
        ecoles: liste,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/abonnement/admin/ecoles/:id { tarifAnnuel, gratuit, montant, echeance }
router.put("/admin/ecoles/:id", isPlatformAdmin, async (req, res, next) => {
  try {
    const id = entier(req.params.id);
    const b = req.body || {};
    if (b.tarifAnnuel !== undefined || b.gratuit !== undefined) {
      await db.query(
        "UPDATE schools SET tarif_annuel = COALESCE($2, tarif_annuel), abonnement_gratuit = COALESCE($3, abonnement_gratuit) WHERE id = $1",
        [id, b.tarifAnnuel === undefined ? null : entier(b.tarifAnnuel) >= 0 ? entier(b.tarifAnnuel) : null, typeof b.gratuit === "boolean" ? b.gratuit : null]
      );
    }
    const a = await S.assurerAbonnement(id);
    if (!a) throw new ApiError(404, "Établissement introuvable");
    const montant = b.montant !== undefined ? entier(b.montant) : b.tarifAnnuel !== undefined ? entier(b.tarifAnnuel) : null;
    await db.query(
      `UPDATE abonnements SET montant = COALESCE($2, montant), echeance = COALESCE($3::date, echeance), gratuit = COALESCE($4, gratuit) WHERE id = $1`,
      [a.id, montant >= 0 ? montant : null, /^\d{4}-\d{2}-\d{2}$/.test(b.echeance || "") ? b.echeance : null, typeof b.gratuit === "boolean" ? b.gratuit : null]
    );
    S.oublier(id);
    res.json({ success: true, data: await S.etat(id) });
  } catch (err) {
    next(err);
  }
});

// POST /api/abonnement/admin/ecoles/:id/paiements { montant, moyen, reference } : paiement recu directement
router.post("/admin/ecoles/:id/paiements", isPlatformAdmin, async (req, res, next) => {
  try {
    const a = await S.assurerAbonnement(entier(req.params.id));
    if (!a) throw new ApiError(404, "Établissement introuvable");
    const montant = entier(req.body?.montant);
    if (!(montant > 0)) throw new ApiError(400, "Montant invalide");
    const { rows } = await db.query(
      `INSERT INTO paiements_abonnement (abonnement_id, montant, moyen, reference, declare_par) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [a.id, montant, MOYENS.includes(req.body?.moyen) ? req.body.moyen : "especes", String(req.body?.reference || "").slice(0, 120) || null, req.user.id]
    );
    await confirmer(rows[0].id, req.user.id);
    res.status(201).json({ success: true, data: { id: rows[0].id } });
  } catch (err) {
    next(err);
  }
});

router.post("/admin/paiements/:id/confirmer", isPlatformAdmin, async (req, res, next) => {
  try {
    await confirmer(entier(req.params.id), req.user.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post("/admin/paiements/:id/rejeter", isPlatformAdmin, async (req, res, next) => {
  try {
    const motif = String(req.body?.motif || "").trim().slice(0, 300) || "Paiement introuvable";
    const { rows } = await db.query(
      `UPDATE paiements_abonnement SET statut = 'rejete', motif_rejet = $2 WHERE id = $1 AND statut = 'declare'
       RETURNING montant, (SELECT school_id FROM abonnements a WHERE a.id = abonnement_id) AS school_id`,
      [entier(req.params.id), motif]
    );
    if (!rows[0]) throw new ApiError(404, "Paiement introuvable");
    const chefs = await db.query("SELECT id FROM users WHERE school_id = $1 AND role = 'principal'", [rows[0].school_id]);
    for (const c of chefs.rows) {
      await notifierUtilisateur(c.id, {
        title: "Paiement de l’abonnement non retrouvé",
        message: `${fcfa(rows[0].montant)} : ${motif}`,
        type: "payment",
        data: { lien: "/abonnement" },
      }).catch(() => {});
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// PUT /api/abonnement/admin/reglages
router.put("/admin/reglages", isPlatformAdmin, async (req, res, next) => {
  try {
    const b = req.body || {};
    const champs = {
      prix_defaut: b.prixDefaut !== undefined ? Math.max(0, entier(b.prixDefaut) || 0) : undefined,
      echeance: /^\d{2}-\d{2}$/.test(b.echeance || "") ? b.echeance : undefined,
      delai_grace_jours: b.delaiGrace !== undefined ? Math.min(180, Math.max(0, entier(b.delaiGrace) || 0)) : undefined,
      beneficiaire: b.beneficiaire !== undefined ? String(b.beneficiaire).slice(0, 80) : undefined,
      orange_money: b.orangeMoney !== undefined ? String(b.orangeMoney).slice(0, 30) : undefined,
      mtn_momo: b.mtnMomo !== undefined ? String(b.mtnMomo).slice(0, 30) : undefined,
      instructions: b.instructions !== undefined ? String(b.instructions).slice(0, 300) : undefined,
    };
    for (const [cle, v] of Object.entries(champs)) {
      if (v === undefined) continue;
      await db.query(
        "INSERT INTO plateforme_reglages (cle, valeur) VALUES ($1, $2) ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur",
        [cle, JSON.stringify(v)]
      );
    }
    res.json({ success: true, data: await S.reglages() });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- reversements aux etablissements
// Paiements de scolarite encaisses en ligne par School (compte NotchPay de la plateforme) a reverser.

// GET /api/abonnement/admin/reversements
router.get("/admin/reversements", isPlatformAdmin, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT s.id, s.name, s.city, s.orange_money, s.mtn_momo,
              COALESCE((SELECT SUM(montant) FROM paiements_scolaires p WHERE p.school_id = s.id AND p.statut = 'reussi' AND p.encaisse_par = 'plateforme'), 0)::bigint AS encaisse,
              COALESCE((SELECT SUM(montant) FROM reversements r WHERE r.school_id = s.id), 0)::bigint AS reverse
       FROM schools s ORDER BY s.name`
    );
    const data = rows.map((r) => ({ ...r, encaisse: Number(r.encaisse), reverse: Number(r.reverse), du: Number(r.encaisse) - Number(r.reverse) }));
    res.json({ success: true, data: { ecoles: data.filter((x) => x.encaisse > 0), totalDu: data.reduce((s, x) => s + x.du, 0) } });
  } catch (err) {
    next(err);
  }
});

// POST /api/abonnement/admin/reversements { schoolId, montant, reference, note }
router.post("/admin/reversements", isPlatformAdmin, async (req, res, next) => {
  try {
    const schoolId = entier(req.body?.schoolId);
    const montant = entier(req.body?.montant);
    if (!(montant > 0)) throw new ApiError(400, "Montant invalide");
    await db.query("INSERT INTO reversements (school_id, montant, reference, note, cree_par) VALUES ($1, $2, $3, $4, $5)", [
      schoolId,
      montant,
      String(req.body?.reference || "").slice(0, 120) || null,
      String(req.body?.note || "").slice(0, 300) || null,
      req.user.id,
    ]);
    const chefs = await db.query("SELECT id FROM users WHERE school_id = $1 AND role = 'principal'", [schoolId]);
    for (const c of chefs.rows) {
      await notifierUtilisateur(c.id, {
        title: "Reversement des paiements en ligne",
        message: `${fcfa(montant)} vous ont été reversés${req.body?.reference ? ` (réf. ${req.body.reference})` : ""}.`,
        type: "payment",
        data: { lien: "/scolarite" },
      }).catch(() => {});
    }
    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.verifierEnLigne = verifierEnLigne;
