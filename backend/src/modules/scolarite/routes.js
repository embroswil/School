// modules/scolarite/routes.js
// Frais de scolarite : l'etablissement fixe ses frais (pension, inscription,
// APEE…) ; parents et eleves voient ce qui est paye et ce qui reste ; paiement
// par Mobile Money (NotchPay) ou enregistrement d'un paiement en especes.
const express = require("express");
const router = express.Router();
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { authenticate } = require("../../middlewares/auth.middleware");
const { notifierEtablissement, notifierUtilisateur, emailNotification } = require("../../utils/notifier");
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
const CATEGORIES = ["scolarite", "inscription", "apee", "examen", "tenue", "cantine", "transport", "activite", "autre"];

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
    `SELECT f.id, f.nom, f.montant, f.echeance, f.obligatoire, f.categorie,
            COALESCE((SELECT SUM(p.montant) FROM paiements_scolaires p WHERE p.frais_id = f.id AND p.student_id = $2 AND p.statut = 'reussi'), 0)::int AS paye
     FROM frais_scolaires f
     WHERE f.school_id = $1 AND (f.academic_year_id IS NULL OR f.academic_year_id = $3)
       AND (f.classes IS NULL OR cardinality(f.classes) = 0 OR lower($4) = ANY (SELECT lower(x) FROM unnest(f.classes) x))
     ORDER BY f.echeance NULLS LAST, f.id`,
    [eleve.school_id, eleve.id, annee?.id || null, eleve.classe || ""]
  );
  const frais = rows.map((f) => ({ ...f, reste: Math.max(0, f.montant - f.paye) }));
  const paiements = await db.query(
    `SELECT p.id, p.montant, p.mode, p.statut, p.reference, p.created_at, p.numero_recu, f.nom AS frais
     FROM paiements_scolaires p JOIN frais_scolaires f ON f.id = p.frais_id
     WHERE p.student_id = $1 AND p.statut = 'reussi' ORDER BY p.created_at DESC LIMIT 30`,
    [eleve.id]
  );
  return {
    moyens: (await moyensEcole(eleve.school_id)).public,
    eleve: { id: eleve.id, prenom: eleve.first_name, nom: eleve.last_name, classe: eleve.classe },
    frais,
    total: frais.reduce((s, f) => s + f.montant, 0),
    paye: frais.reduce((s, f) => s + Math.min(f.paye, f.montant), 0),
    reste: frais.reduce((s, f) => s + f.reste, 0),
    paiements: paiements.rows,
  };
};

// Moyens de paiement de l'etablissement : son propre compte NotchPay (paiement
// en ligne) et/ou ses numeros Orange Money / MTN MoMo (transfert puis declaration)
const moyensEcole = async (schoolId) => {
  const { rows } = await db.query(
    "SELECT notchpay_public_key, orange_money, mtn_momo, paiement_instructions, frais_service_parent, frais_service_pct FROM schools WHERE id = $1",
    [schoolId]
  );
  const e = rows[0] || {};
  return {
    cle: e.notchpay_public_key || null,
    // Frais de transaction du paiement en ligne : ajoutes au montant paye par le parent, si l'etablissement le choisit
    fraisServicePct: e.frais_service_parent ? Number(e.frais_service_pct || 0) : 0,
    public: {
      enLigne: Boolean(e.notchpay_public_key),
      fraisServicePct: e.frais_service_parent ? Number(e.frais_service_pct || 0) : 0,
      orange: e.orange_money || null,
      mtn: e.mtn_momo || null,
      instructions: e.paiement_instructions || null,
    },
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
    const eleve = await db.query("SELECT school_id FROM users WHERE id = $1", [studentId]);
    // L'argent va directement sur le compte NotchPay de l'etablissement
    const { cle, fraisServicePct } = await moyensEcole(eleve.rows[0].school_id);
    if (!cle) throw new ApiError(400, "L'établissement n'a pas activé le paiement en ligne : utilisez ses numéros Mobile Money");
    const fraisService = Math.ceil((montant * fraisServicePct) / 100);
    const reference = `SCH-${studentId}-${fraisId}-${Date.now()}`;
    await db.query(
      `INSERT INTO paiements_scolaires (school_id, frais_id, student_id, montant, mode, statut, reference, telephone, paye_par, frais_service)
       VALUES ($1, $2, $3, $4, 'mobile_money', 'en_attente', $5, $6, $7, $8)`,
      [eleve.rows[0].school_id, fraisId, studentId, montant, reference, telephone || null, u.id, fraisService]
    );
    const retour = `${(process.env.FRONTEND_URL || "").split(",")[0].trim()}/#/scolarite`;
    const r = await fetch("https://api.notchpay.co/payments/initialize", {
      method: "POST",
      headers: { Authorization: cle, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        amount: montant + fraisService,
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

// Le parent a transfere l'argent sur le numero Mobile Money de l'etablissement
// et declare son paiement (n° de transaction) ; l'etablissement confirme.
router.post("/declarer", async (req, res, next) => {
  try {
    const u = req.user;
    const studentId = entier(req.body?.studentId);
    const fraisId = entier(req.body?.fraisId);
    const montant = entier(req.body?.montant);
    const transaction = texte(req.body?.transaction, 120);
    const telephone = texte(req.body?.telephone, 30);
    if (!(await elevesAccessibles(u)).includes(studentId)) throw new ApiError(403, "Élève non relié à votre compte");
    if (!transaction) throw new ApiError(400, "Indiquez le numéro de la transaction reçu par SMS");
    const s = await situationEleve(studentId);
    const frais = s?.frais.find((f) => f.id === fraisId);
    if (!frais) throw new ApiError(404, "Frais introuvable");
    if (!(montant > 0) || montant > frais.reste) throw new ApiError(400, `Montant entre 1 et ${fcfa(frais.reste)}`);
    const eleve = await db.query("SELECT school_id FROM users WHERE id = $1", [studentId]);
    const deja = await db.query("SELECT 1 FROM paiements_scolaires WHERE reference = $1", [`TX-${transaction}`]);
    if (deja.rows[0]) throw new ApiError(409, "Cette transaction a déjà été déclarée");
    await db.query(
      `INSERT INTO paiements_scolaires (school_id, frais_id, student_id, montant, mode, statut, reference, telephone, paye_par)
       VALUES ($1, $2, $3, $4, 'mobile_money', 'declare', $5, $6, $7)`,
      [eleve.rows[0].school_id, fraisId, studentId, montant, `TX-${transaction}`, telephone || null, u.id]
    );
    await notifierEtablissement(eleve.rows[0].school_id, {
      title: "Paiement à confirmer",
      message: `${fcfa(montant)} · ${frais.nom} · ${s.eleve.prenom} ${s.eleve.nom} · transaction ${transaction}`,
      type: "payment",
      priority: "high",
      data: { lien: "/scolarite" },
    }).catch(() => {});
    res.status(201).json({ success: true, message: "Paiement déclaré : l'établissement va le vérifier et le confirmer." });
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
    if (p.statut !== "en_attente") return res.json({ success: true, data: { statut: p.statut, id: p.id } });
    const statut = await verifierPaiement(p);
    res.json({ success: true, data: { statut, id: p.id } });
  } catch (e) {
    next(e);
  }
});

// Interroge NotchPay sur un paiement en attente et met a jour son statut
const verifierPaiement = async (p) => {
  const { cle } = await moyensEcole(p.school_id);
  if (!cle) return "en_attente";
  const r = await fetch(`https://api.notchpay.co/payments/${encodeURIComponent(p.reference)}`, {
    headers: { Authorization: cle, Accept: "application/json" },
  });
  const j = await r.json().catch(() => ({}));
  const etat = j?.transaction?.status || j?.status;
  let statut = "en_attente";
  if (etat === "complete") statut = "reussi";
  else if (["failed", "canceled", "expired", "rejected"].includes(etat)) statut = "echoue";
  if (statut !== "en_attente") {
    const maj = await db.query("UPDATE paiements_scolaires SET statut = $2, confirme_le = NOW() WHERE id = $1 AND statut = 'en_attente'", [p.id, statut]);
    if (statut === "reussi" && maj.rowCount) await apresPaiement(p);
  }
  return statut;
};

// Numero de recu unique (ex. REC-2026-000123)
const attribuerRecu = (id) =>
  db.query(
    "UPDATE paiements_scolaires SET numero_recu = 'REC-' || to_char(NOW(), 'YYYY') || '-' || lpad(id::text, 6, '0') WHERE id = $1 AND numero_recu IS NULL",
    [id]
  );

const apresPaiement = async (p) => {
  await attribuerRecu(p.id).catch(() => {});
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
       FROM parent_student_links l WHERE l.student_id = $1 AND l.parent_id IS DISTINCT FROM $3
       RETURNING user_id`,
      [p.student_id, `${fcfa(p.montant)} · ${i.nom} · ${i.first_name} ${i.last_name}`, p.paye_par]
    )
    .then((r) =>
      r.rows.forEach((x) =>
        emailNotification(x.user_id, {
          title: "Paiement de scolarité",
          message: `${fcfa(p.montant)} · ${i.nom} · ${i.first_name} ${i.last_name}`,
          data: { lien: "/scolarite" },
        })
      )
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
    const categorie = CATEGORIES.includes(b.categorie) ? b.categorie : "scolarite";
    const { rows } = await db.query(
      `INSERT INTO frais_scolaires (school_id, academic_year_id, nom, montant, echeance, classes, obligatoire, categorie)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [ecole, annee?.id || null, nom, montant, b.echeance || null, classes.length ? classes : null, b.obligatoire !== false, categorie]
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
      `SELECT p.id, p.montant, p.mode, p.statut, p.reference, p.created_at, p.numero_recu, f.nom AS frais,
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

// Paiements declares par les parents, a confirmer
router.get("/a-confirmer", async (req, res, next) => {
  try {
    reserve(req);
    const ecole = ecoleDe(req);
    const { rows } = await db.query(
      `SELECT p.id, p.montant, p.reference, p.telephone, p.created_at, f.nom AS frais,
              u.first_name, u.last_name, ${SQL_CLASSE} AS classe,
              pp.first_name AS payeur_prenom, pp.last_name AS payeur_nom
       FROM paiements_scolaires p JOIN frais_scolaires f ON f.id = p.frais_id JOIN users u ON u.id = p.student_id
       LEFT JOIN users pp ON pp.id = p.paye_par
       WHERE p.school_id = $1 AND p.statut = 'declare' ORDER BY p.created_at`,
      [ecole]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

router.post("/a-confirmer/:id/:decision", async (req, res, next) => {
  try {
    reserve(req);
    const ecole = ecoleDe(req);
    const { rows } = await db.query("SELECT * FROM paiements_scolaires WHERE id = $1 AND school_id = $2 AND statut = 'declare'", [
      entier(req.params.id),
      ecole,
    ]);
    const p = rows[0];
    if (!p) throw new ApiError(404, "Paiement introuvable ou déjà traité");
    if (req.params.decision === "confirmer") {
      await db.query("UPDATE paiements_scolaires SET statut = 'reussi', confirme_le = NOW(), enregistre_par = $2 WHERE id = $1", [p.id, req.user.id]);
      await apresPaiement({ ...p, school_id: -1 }); // parents informes
    } else {
      const motif = texte(req.body?.motif, 300) || null;
      await db.query("UPDATE paiements_scolaires SET statut = 'rejete', motif_rejet = $2 WHERE id = $1", [p.id, motif]);
      if (p.paye_par) {
        await notifierUtilisateur(p.paye_par, {
          title: "Paiement non reconnu",
          message: `${fcfa(p.montant)} : l'établissement n'a pas retrouvé cette transaction${motif ? ` (${motif})` : ""}.`,
          type: "payment",
          data: { lien: "/scolarite" },
        }).catch(() => {});
      }
    }
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// Reglages de paiement de l'etablissement
router.get("/reglages", async (req, res, next) => {
  try {
    reserve(req);
    const ecole = ecoleDe(req);
    const { rows } = await db.query(
      "SELECT notchpay_public_key, orange_money, mtn_momo, paiement_instructions, frais_service_parent, frais_service_pct FROM schools WHERE id = $1",
      [ecole]
    );
    const e = rows[0] || {};
    const cle = e.notchpay_public_key || "";
    res.json({
      success: true,
      data: {
        cleMasquee: cle ? `${cle.slice(0, 10)}…${cle.slice(-4)}` : "",
        orange: e.orange_money || "",
        mtn: e.mtn_momo || "",
        instructions: e.paiement_instructions || "",
        fraisServiceParent: Boolean(e.frais_service_parent),
        fraisServicePct: Number(e.frais_service_pct || 0),
      },
    });
  } catch (e) {
    next(e);
  }
});

router.put("/reglages", async (req, res, next) => {
  try {
    reserve(req);
    const ecole = ecoleDe(req);
    const b = req.body || {};
    const sets = [];
    const vals = [ecole];
    const ajouter = (col, v) => {
      vals.push(v);
      sets.push(`${col} = $${vals.length}`);
    };
    if (b.cle !== undefined) {
      const cle = texte(b.cle, 200);
      if (cle && (cle.length < 20 || /\s/.test(cle))) throw new ApiError(400, "Clé NotchPay invalide : copiez la « clé publique » depuis votre tableau de bord NotchPay");
      ajouter("notchpay_public_key", cle || null);
    }
    if (b.orange !== undefined) ajouter("orange_money", texte(b.orange, 30) || null);
    if (b.mtn !== undefined) ajouter("mtn_momo", texte(b.mtn, 30) || null);
    if (b.instructions !== undefined) ajouter("paiement_instructions", texte(b.instructions, 1000) || null);
    if (typeof b.fraisServiceParent === "boolean") ajouter("frais_service_parent", b.fraisServiceParent);
    if (b.fraisServicePct !== undefined) {
      const pct = Number(String(b.fraisServicePct).replace(",", "."));
      if (!(pct >= 0 && pct <= 10)) throw new ApiError(400, "Pourcentage entre 0 et 10");
      ajouter("frais_service_pct", pct);
    }
    if (sets.length) await db.query(`UPDATE schools SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $1`, vals);
    res.json({ success: true });
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

// GET /api/scolarite/recus/:id : recu d'un paiement (parent relie, eleve, etablissement)
router.get("/recus/:id", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT p.id, p.montant, p.mode, p.reference, p.created_at, p.confirme_le, p.numero_recu, p.frais_service, p.student_id, p.school_id, p.paye_par,
              f.nom AS frais, f.montant AS frais_montant, u.first_name, u.last_name, ${SQL_CLASSE} AS classe,
              s.name AS ecole, s.city, s.photo IS NOT NULL AS a_photo, sr.admission_number AS matricule,
              pp.first_name AS payeur_prenom, pp.last_name AS payeur_nom
       FROM paiements_scolaires p JOIN frais_scolaires f ON f.id = p.frais_id JOIN users u ON u.id = p.student_id
       JOIN schools s ON s.id = p.school_id LEFT JOIN student_records sr ON sr.student_id = u.id LEFT JOIN users pp ON pp.id = p.paye_par
       WHERE p.id = $1 AND p.statut = 'reussi'`,
      [entier(req.params.id)]
    );
    const r = rows[0];
    if (!r) throw new ApiError(404, "Reçu introuvable");
    const u = req.user;
    const autorise =
      (u.role === "principal" && u.schoolId === r.school_id) || u.role === "admin" || r.paye_par === u.id || (await elevesAccessibles(u)).includes(r.student_id);
    if (!autorise) throw new ApiError(404, "Reçu introuvable");
    if (!r.numero_recu) {
      await attribuerRecu(r.id);
      r.numero_recu = (await db.query("SELECT numero_recu FROM paiements_scolaires WHERE id = $1", [r.id])).rows[0].numero_recu;
    }
    const paye = (
      await db.query("SELECT COALESCE(SUM(montant), 0)::int AS t FROM paiements_scolaires WHERE frais_id = (SELECT frais_id FROM paiements_scolaires WHERE id = $1) AND student_id = $2 AND statut = 'reussi' AND created_at <= $3", [r.id, r.student_id, r.created_at])
    ).rows[0].t;
    res.json({ success: true, data: { ...r, resteApres: Math.max(0, r.frais_montant - paye) } });
  } catch (e) {
    next(e);
  }
});

// Requete commune : ce que chaque eleve doit, frais obligatoires par frais
const SQL_DU = `
  WITH el AS (
    SELECT u.id, u.first_name, u.last_name, c.name AS classe
    FROM users u JOIN class_students cs ON cs.student_id = u.id AND cs.status = 'active'
    JOIN classes c ON c.id = cs.class_id JOIN academic_years ay ON ay.id = c.academic_year_id AND ay.is_current
    WHERE u.school_id = $1 AND u.role = 'student'),
  fr AS (SELECT id, nom, montant, classes, echeance FROM frais_scolaires
         WHERE school_id = $1 AND obligatoire AND (academic_year_id IS NULL OR academic_year_id = $2)),
  du AS (SELECT el.*, fr.id AS frais_id, fr.nom AS frais, fr.montant, fr.echeance FROM el JOIN fr
         ON (fr.classes IS NULL OR cardinality(fr.classes) = 0 OR lower(el.classe) = ANY (SELECT lower(x) FROM unnest(fr.classes) x))),
  pa AS (SELECT student_id, frais_id, SUM(montant) AS s FROM paiements_scolaires WHERE school_id = $1 AND statut = 'reussi' GROUP BY 1, 2)
  SELECT du.*, LEAST(COALESCE(pa.s, 0), du.montant)::int AS paye, GREATEST(du.montant - COALESCE(pa.s, 0), 0)::int AS reste,
         (du.echeance < CURRENT_DATE AND COALESCE(pa.s, 0) < du.montant) AS en_retard
  FROM du LEFT JOIN pa ON pa.student_id = du.id AND pa.frais_id = du.frais_id`;

// GET /api/scolarite/recouvrement[?classe=6e A] : par classe, ou les eleves d'une classe
router.get("/recouvrement", async (req, res, next) => {
  try {
    reserve(req);
    const ecole = ecoleDe(req);
    const annee = await assurerAnneeScolaire(ecole);
    if (req.query.classe) {
      const { rows } = await db.query(
        `SELECT id, first_name, last_name, SUM(montant)::int AS du, SUM(paye)::int AS paye, SUM(reste)::int AS reste, bool_or(en_retard) AS en_retard
         FROM (${SQL_DU}) x WHERE classe = $3 GROUP BY id, first_name, last_name ORDER BY SUM(reste) DESC, last_name`,
        [ecole, annee?.id || null, texte(req.query.classe, 60)]
      );
      return res.json({ success: true, data: rows });
    }
    const { rows } = await db.query(
      `SELECT classe, COUNT(DISTINCT id)::int AS effectif, SUM(montant)::bigint AS attendu, SUM(paye)::bigint AS encaisse,
              SUM(reste)::bigint AS reste, COUNT(DISTINCT id) FILTER (WHERE en_retard)::int AS en_retard
       FROM (${SQL_DU}) x GROUP BY classe ORDER BY classe`,
      [ecole, annee?.id || null]
    );
    const t = rows.reduce((a, r) => ({ attendu: a.attendu + Number(r.attendu), encaisse: a.encaisse + Number(r.encaisse), enRetard: a.enRetard + r.en_retard }), {
      attendu: 0,
      encaisse: 0,
      enRetard: 0,
    });
    const relance = (await db.query("SELECT derniere_relance FROM schools WHERE id = $1", [ecole])).rows[0]?.derniere_relance;
    res.json({ success: true, data: { classes: rows, totaux: { ...t, reste: t.attendu - t.encaisse }, derniereRelance: relance } });
  } catch (e) {
    next(e);
  }
});

// POST /api/scolarite/relancer { classe? } : rappel aux parents des eleves en retard (au plus une fois tous les 3 jours)
router.post("/relancer", async (req, res, next) => {
  try {
    reserve(req);
    const ecole = ecoleDe(req);
    const annee = await assurerAnneeScolaire(ecole);
    const der = (await db.query("SELECT derniere_relance FROM schools WHERE id = $1", [ecole])).rows[0]?.derniere_relance;
    if (der && Date.now() - new Date(der).getTime() < 3 * 86400000) throw new ApiError(429, "Une relance a déjà été envoyée il y a moins de 3 jours");
    const classe = texte(req.body?.classe, 60) || null;
    const { rows } = await db.query(
      `SELECT x.id, x.first_name, x.last_name, x.classe, SUM(x.reste)::int AS reste, l.parent_id
       FROM (${SQL_DU}) x JOIN parent_student_links l ON l.student_id = x.id
       WHERE x.en_retard AND ($3::text IS NULL OR x.classe = $3)
       GROUP BY x.id, x.first_name, x.last_name, x.classe, l.parent_id`,
      [ecole, annee?.id || null, classe]
    );
    for (const r of rows) {
      await notifierUtilisateur(r.parent_id, {
        title: "Rappel : frais de scolarité",
        message: `${r.first_name} ${r.last_name} (${r.classe}) : ${fcfa(r.reste)} restent à payer, dont des frais dont l’échéance est passée.`,
        type: "payment",
        priority: "high",
        data: { lien: "/scolarite" },
      }).catch(() => {});
    }
    await db.query("UPDATE schools SET derniere_relance = NOW() WHERE id = $1", [ecole]);
    res.json({ success: true, data: { parents: rows.length } });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
module.exports.verifierPaiement = verifierPaiement;
module.exports.situationEleve = situationEleve;
module.exports.elevesAccessibles = elevesAccessibles;
module.exports.apresPaiement = apresPaiement;
module.exports.moyensEcole = moyensEcole;
