// modules/scolarite/routes.js
// Frais de scolarite : l'etablissement fixe ses frais (pension, inscription,
// APEE…) ; parents et eleves voient ce qui est paye et ce qui reste ; paiement
// par Mobile Money (NotchPay) ou enregistrement d'un paiement en especes.
const express = require("express");
const router = express.Router();
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { authenticate } = require("../../middlewares/auth.middleware");
const { notifierEtablissement, notifierUtilisateur } = require("../../utils/notifier");
const { assurerAnneeScolaire } = require("../../utils/annees");

router.use(authenticate);

const texte = (v, max) => (v === undefined || v === null ? "" : String(v).trim().slice(0, max));
const entier = (v) => {
  const n = parseInt(String(v).replace(/\s/g, ""), 10);
  return Number.isFinite(n) ? n : NaN;
};
const estEtablissement = (u) => u.role === "principal";
const ecoleDe = (req) => {
  const id = req.user.role === "admin" ? parseInt(req.query.ecole, 10) : req.user.schoolId;
  if (!id) throw new ApiError(400, "Aucun établissement associé à votre compte");
  return id;
};
const fcfa = (n) => `${Number(n).toLocaleString("fr-FR")} FCFA`;

// Classe actuelle d'un eleve (sinon la classe declaree a l'inscription)
const SQL_CLASSE = `COALESCE(
  (SELECT c.name FROM class_students cs JOIN classes c ON c.id = cs.class_id
   WHERE cs.student_id = u.id AND cs.status = 'active' ORDER BY cs.enrolled_at DESC LIMIT 1),
  (SELECT sr.declared_class FROM student_records sr WHERE sr.student_id = u.id))`;

// Situation d'un eleve : frais applicables, paye, reste
const situationEleve = async (studentId) => {
  const e = await db.query(`SELECT u.id, u.first_name, u.last_name, u.school_id, ${SQL_CLASSE} AS classe FROM users u WHERE u.id = $1`, [studentId]);
  const eleve = e.rows[0];
  if (!eleve) return null;
  const annee = await assurerAnneeScolaire(eleve.school_id);
  const { rows } = await db.query(
    `SELECT f.id, f.nom, f.montant, f.echeance, f.obligatoire,
            COALESCE((SELECT SUM(p.montant) FROM paiements_scolaires p WHERE p.frais_id = f.id AND p.student_id = $2 AND p.statut = 'reussi'), 0)::int AS paye
     FROM frais_scolaires f
     WHERE f.school_id = $1 AND (f.academic_year_id IS NULL OR f.academic_year_id = $3)
       AND (f.classes IS NULL OR cardinality(f.classes) = 0 OR lower($4) = ANY (SELECT lower(x) FROM unnest(f.classes) x))
     ORDER BY f.echeance NULLS LAST, f.id`,
    [eleve.school_id, eleve.id, annee?.id || null, eleve.classe || ""]
  );
  const frais = rows.map((f) => ({ ...f, reste: Math.max(0, f.montant - f.paye) }));
  const paiements = await db.query(
    `SELECT p.id, p.montant, p.mode, p.statut, p.reference, p.created_at, f.nom AS frais
     FROM paiements_scolaires p JOIN frais_scolaires f ON f.id = p.frais_id
     WHERE p.student_id = $1 AND p.statut = 'reussi' ORDER BY p.created_at DESC LIMIT 30`,
    [eleve.id]
  );
  return {
    eleve: { id: eleve.id, prenom: eleve.first_name, nom: eleve.last_name, classe: eleve.classe },
    frais,
    total: frais.reduce((s, f) => s + f.montant, 0),
    paye: frais.reduce((s, f) => s + Math.min(f.paye, f.montant), 0),
    reste: frais.reduce((s, f) => s + f.reste, 0),
    paiements: paiements.rows,
  };
};

// Eleves que l'utilisateur peut consulter (parent : ses enfants ; eleve : lui-meme)
const elevesAccessibles = async (u) => {
  if (u.role === "student") return [u.id];
  if (u.role === "parent") {
    const { rows } = await db.query("SELECT student_id FROM parent_student_links WHERE parent_id = $1", [u.id]);
    return rows.map((r) => r.student_id);
  }
  return [];
};

// ---------------------------------------------------------------- parents / eleves

router.get("/situation", async (req, res, next) => {
  try {
    const ids = await elevesAccessibles(req.user);
    const data = [];
    for (const id of ids) {
      const s = await situationEleve(id);
      if (s) data.push(s);
    }
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

// Paiement Mobile Money via NotchPay
router.post("/payer", async (req, res, next) => {
  try {
    const u = req.user;
    const studentId = entier(req.body?.studentId);
    const fraisId = entier(req.body?.fraisId);
    const montant = entier(req.body?.montant);
    const telephone = texte(req.body?.telephone, 30);
    if (!(await elevesAccessibles(u)).includes(studentId)) throw new ApiError(403, "Élève non relié à votre compte");
    const s = await situationEleve(studentId);
    const frais = s?.frais.find((f) => f.id === fraisId);
    if (!frais) throw new ApiError(404, "Frais introuvable");
    if (!(montant >= 100) || montant > frais.reste) throw new ApiError(400, `Montant entre 100 et ${fcfa(frais.reste)}`);
    const cle = process.env.NOTCHPAY_PUBLIC_KEY;
    if (!cle) throw new ApiError(503, "Le paiement en ligne n'est pas encore activé");

    const eleve = await db.query("SELECT school_id FROM users WHERE id = $1", [studentId]);
    const reference = `SCH-${studentId}-${fraisId}-${Date.now()}`;
    await db.query(
      `INSERT INTO paiements_scolaires (school_id, frais_id, student_id, montant, mode, statut, reference, telephone, paye_par)
       VALUES ($1, $2, $3, $4, 'mobile_money', 'en_attente', $5, $6, $7)`,
      [eleve.rows[0].school_id, fraisId, studentId, montant, reference, telephone || null, u.id]
    );
    const retour = `${(process.env.FRONTEND_URL || "").split(",")[0].trim()}/#/scolarite`;
    const r = await fetch("https://api.notchpay.co/payments/initialize", {
      method: "POST",
      headers: { Authorization: cle, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        amount: montant,
        currency: "XAF",
        email: u.email,
        phone: telephone || undefined,
        reference,
        callback: retour,
        description: `${frais.nom} – ${s.eleve.prenom} ${s.eleve.nom}`,
      }),
    });
    const j = await r.json().catch(() => ({}));
    const url = j?.authorization_url || j?.transaction?.authorization_url;
    if (!r.ok || !url) throw new ApiError(502, j?.message || "Le service de paiement ne répond pas");
    res.json({ success: true, data: { url, reference } });
  } catch (e) {
    next(e);
  }
});

// Verification apres le retour du paiement
router.get("/verifier/:reference", async (req, res, next) => {
  try {
    const reference = texte(req.params.reference, 120);
    const { rows } = await db.query("SELECT * FROM paiements_scolaires WHERE reference = $1", [reference]);
    const p = rows[0];
    if (!p) throw new ApiError(404, "Paiement introuvable");
    if (p.statut !== "en_attente") return res.json({ success: true, data: { statut: p.statut } });
    const r = await fetch(`https://api.notchpay.co/payments/${encodeURIComponent(reference)}`, {
      headers: { Authorization: process.env.NOTCHPAY_PUBLIC_KEY || "", Accept: "application/json" },
    });
    const j = await r.json().catch(() => ({}));
    const etat = j?.transaction?.status || j?.status;
    let statut = "en_attente";
    if (etat === "complete") statut = "reussi";
    else if (["failed", "canceled", "expired", "rejected"].includes(etat)) statut = "echoue";
    if (statut !== "en_attente") {
      await db.query("UPDATE paiements_scolaires SET statut = $2, confirme_le = NOW() WHERE id = $1", [p.id, statut]);
      if (statut === "reussi") await apresPaiement(p);
    }
    res.json({ success: true, data: { statut } });
  } catch (e) {
    next(e);
  }
});

const apresPaiement = async (p) => {
  const info = await db.query(
    `SELECT u.first_name, u.last_name, f.nom FROM users u, frais_scolaires f WHERE u.id = $1 AND f.id = $2`,
    [p.student_id, p.frais_id]
  );
  const i = info.rows[0] || {};
  await notifierEtablissement(p.school_id, {
    title: "Paiement reçu",
    message: `${fcfa(p.montant)} · ${i.nom} · ${i.first_name} ${i.last_name}`,
    type: "payment",
    data: { lien: "/scolarite" },
  }).catch(() => {});
  if (p.paye_par) {
    await notifierUtilisateur(p.paye_par, {
      title: "Paiement confirmé",
      message: `${fcfa(p.montant)} · ${i.nom} · ${i.first_name} ${i.last_name}`,
      type: "payment",
      data: { lien: "/scolarite" },
    }).catch(() => {});
  }
  // Parents relies a l'eleve (autres que le payeur) : informes aussi
  await db
    .query(
      `INSERT INTO notifications (user_id, title, message, type, data)
       SELECT l.parent_id, 'Paiement de scolarité', $2, 'payment', '{"lien":"/scolarite"}'
       FROM parent_student_links l WHERE l.student_id = $1 AND l.parent_id IS DISTINCT FROM $3`,
      [p.student_id, `${fcfa(p.montant)} · ${i.nom} · ${i.first_name} ${i.last_name}`, p.paye_par]
    )
    .catch(() => {});
};

// ---------------------------------------------------------------- etablissement

const reserve = (req) => {
  if (!estEtablissement(req.user) && req.user.role !== "admin") throw new ApiError(403, "Réservé à l'établissement");
};

router.get("/frais", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    const annee = await assurerAnneeScolaire(ecole);
    const { rows } = await db.query(
      `SELECT f.*,
         COALESCE((SELECT SUM(p.montant) FROM paiements_scolaires p WHERE p.frais_id = f.id AND p.statut = 'reussi'), 0)::int AS encaisse
       FROM frais_scolaires f WHERE f.school_id = $1 AND (f.academic_year_id IS NULL OR f.academic_year_id = $2)
       ORDER BY f.echeance NULLS LAST, f.id`,
      [ecole, annee?.id || null]
    );
    res.json({ success: true, data: rows, annee });
  } catch (e) {
    next(e);
  }
});

router.post("/frais", async (req, res, next) => {
  try {
    reserve(req);
    const ecole = ecoleDe(req);
    const annee = await assurerAnneeScolaire(ecole);
    const b = req.body || {};
    const nom = texte(b.nom, 120);
    const montant = entier(b.montant);
    if (!nom) throw new ApiError(400, "Nom du frais obligatoire (ex. Pension 1re tranche)");
    if (!(montant > 0)) throw new ApiError(400, "Montant invalide");
    const classes = Array.isArray(b.classes) ? b.classes.map((c) => texte(c, 50)).filter(Boolean) : [];
    const { rows } = await db.query(
      `INSERT INTO frais_scolaires (school_id, academic_year_id, nom, montant, echeance, classes, obligatoire)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [ecole, annee?.id || null, nom, montant, b.echeance || null, classes.length ? classes : null, b.obligatoire !== false]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) {
    next(e);
  }
});

router.delete("/frais/:id", async (req, res, next) => {
  try {
    reserve(req);
    const ecole = ecoleDe(req);
    const id = entier(req.params.id);
    const deja = await db.query("SELECT 1 FROM paiements_scolaires WHERE frais_id = $1 AND statut = 'reussi' LIMIT 1", [id]);
    if (deja.rows[0]) throw new ApiError(400, "Des paiements existent déjà pour ce frais : il ne peut pas être supprimé");
    const r = await db.query("DELETE FROM frais_scolaires WHERE id = $1 AND school_id = $2", [id, ecole]);
    if (!r.rowCount) throw new ApiError(404, "Frais introuvable");
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// Paiements recus (les 100 derniers)
router.get("/paiements", async (req, res, next) => {
  try {
    reserve(req);
    const ecole = ecoleDe(req);
    const { rows } = await db.query(
      `SELECT p.id, p.montant, p.mode, p.statut, p.reference, p.created_at, f.nom AS frais,
              u.first_name, u.last_name, ${SQL_CLASSE} AS classe
       FROM paiements_scolaires p JOIN frais_scolaires f ON f.id = p.frais_id JOIN users u ON u.id = p.student_id
       WHERE p.school_id = $1 AND p.statut = 'reussi' ORDER BY p.created_at DESC LIMIT 100`,
      [ecole]
    );
    const total = await db.query("SELECT COALESCE(SUM(montant),0)::int AS t FROM paiements_scolaires WHERE school_id = $1 AND statut = 'reussi'", [ecole]);
    res.json({ success: true, data: rows, total: total.rows[0].t });
  } catch (e) {
    next(e);
  }
});

// Situation d'un eleve (pour l'etablissement)
router.get("/eleves/:id", async (req, res, next) => {
  try {
    reserve(req);
    const ecole = ecoleDe(req);
    const id = entier(req.params.id);
    const ok = await db.query("SELECT 1 FROM users WHERE id = $1 AND school_id = $2 AND role = 'student'", [id, ecole]);
    if (!ok.rows[0]) throw new ApiError(404, "Élève introuvable");
    res.json({ success: true, data: await situationEleve(id) });
  } catch (e) {
    next(e);
  }
});

// Enregistrer un paiement recu au guichet (especes, banque…)
router.post("/paiements", async (req, res, next) => {
  try {
    reserve(req);
    const ecole = ecoleDe(req);
    const b = req.body || {};
    const studentId = entier(b.studentId);
    const fraisId = entier(b.fraisId);
    const montant = entier(b.montant);
    const mode = ["especes", "banque", "mobile_money", "autre"].includes(b.mode) ? b.mode : "especes";
    const ok = await db.query("SELECT 1 FROM users WHERE id = $1 AND school_id = $2 AND role = 'student'", [studentId, ecole]);
    if (!ok.rows[0]) throw new ApiError(404, "Élève introuvable");
    const s = await situationEleve(studentId);
    const frais = s.frais.find((f) => f.id === fraisId);
    if (!frais) throw new ApiError(404, "Frais introuvable pour cet élève");
    if (!(montant > 0) || montant > frais.reste) throw new ApiError(400, `Montant entre 1 et ${fcfa(frais.reste)}`);
    const { rows } = await db.query(
      `INSERT INTO paiements_scolaires (school_id, frais_id, student_id, montant, mode, statut, reference, enregistre_par, confirme_le)
       VALUES ($1, $2, $3, $4, $5, 'reussi', $6, $7, NOW()) RETURNING *`,
      [ecole, fraisId, studentId, montant, mode, texte(b.reference, 120) || `GUI-${studentId}-${Date.now()}`, req.user.id]
    );
    // Les parents sont informes (l'etablissement n'a pas besoin de se notifier lui-meme)
    await apresPaiement({ ...rows[0], paye_par: null, school_id: -1 });
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
