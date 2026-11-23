// modules/scolarite/routes.js
// Frais de scolarite : l'etablissement fixe ses frais (pension, inscription,
// APEE…) ; parents et eleves voient ce qui est paye et ce qui reste ; paiement
// par Mobile Money (NotchPay) ou enregistrement d'un paiement en especes.
const express = require("express");
const router = express.Router();
const db = require("../../config/db");
const crypto = require("crypto");
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
       AND (f.classes IS NULL OR cardinality(f.classes) = 0 OR EXISTS (SELECT 1 FROM unnest(f.classes) x WHERE lower($4) = lower(x) OR lower($4) LIKE lower(x) || ' %'))
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
  // Statut de la scolarite (frais obligatoires) : reglee, partielle, non payee
  const oblig = frais.filter((f) => f.obligatoire)
  const resteOblig = oblig.reduce((s, f) => s + f.reste, 0)
  const statut = !oblig.length ? "aucun" : resteOblig === 0 ? "regle" : oblig.some((f) => f.paye > 0) ? "partiel" : "non_paye"
  const aujourdhui = new Date().toISOString().slice(0, 10)
  return {
    statut,
    resteObligatoire: resteOblig,
    enRetard: oblig.some((f) => f.reste > 0 && f.echeance && new Date(f.echeance).toISOString().slice(0, 10) < aujourdhui),
    moyens: (await moyensEcole(eleve.school_id)).public,
    eleve: { id: eleve.id, prenom: eleve.first_name, nom: eleve.last_name, classe: eleve.classe },
    frais,
    total: frais.reduce((s, f) => s + f.montant, 0),
    paye: frais.reduce((s, f) => s + Math.min(f.paye, f.montant), 0),
    reste: frais.reduce((s, f) => s + f.reste, 0),
    paiements: paiements.rows,
  };
};

// Paiement automatique en ligne (NotchPay) : reserve aux familles abonnees a Sùkûl (abonnement Famille, a venir).
// En attendant, les parents paient par transfert direct au numero de l'etablissement (ordre de paiement).
const ENLIGNE_PARENTS = false;

// Moyens de paiement de l'etablissement : son propre compte NotchPay (paiement
// en ligne) et/ou ses numeros Orange Money / MTN MoMo (transfert puis declaration)
const moyensEcole = async (schoolId) => {
  const { rows } = await db.query(
    "SELECT notchpay_public_key, orange_money, mtn_momo, paiement_instructions, frais_service_parent, frais_service_pct FROM schools WHERE id = $1",
    [schoolId]
  );
  const e = rows[0] || {};
  const cleEcole = e.notchpay_public_key || null;
  return {
    // La cle NotchPay de la plateforme sert uniquement aux abonnements des etablissements
    cle: cleEcole,
    viaPlateforme: false,
    // Frais de transaction du paiement en ligne : ajoutes au montant paye par le parent, si l'etablissement le choisit
    fraisServicePct: e.frais_service_parent ? Number(e.frais_service_pct || 0) : 0,
    public: {
      enLigne: ENLIGNE_PARENTS && Boolean(cleEcole),
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
    if (!ENLIGNE_PARENTS) throw new ApiError(403, "Le paiement en ligne sera réservé aux familles abonnées à Sùkûl. Payez par Orange Money ou MTN MoMo au numéro de l’établissement.");
    // Parent relie, ou tout parent/donateur : on peut payer la scolarite de n'importe quel eleve
    if (u.role !== "parent" && !(await elevesAccessibles(u)).includes(studentId)) throw new ApiError(403, "Élève non relié à votre compte");
    const s = await situationEleve(studentId);
    const frais = s?.frais.find((f) => f.id === fraisId);
    if (!frais) throw new ApiError(404, "Frais introuvable");
    if (!(montant >= 100) || montant > frais.reste) throw new ApiError(400, `Montant entre 100 et ${fcfa(frais.reste)}`);
    const eleve = await db.query("SELECT school_id FROM users WHERE id = $1", [studentId]);
    const { cle, fraisServicePct, viaPlateforme } = await moyensEcole(eleve.rows[0].school_id);
    if (!cle) throw new ApiError(400, "Le paiement en ligne n'est pas encore activé : utilisez le transfert direct");
    const fraisService = Math.ceil((montant * fraisServicePct) / 100);
    const reference = `SCH-${studentId}-${fraisId}-${Date.now()}`;
    await db.query(
      `INSERT INTO paiements_scolaires (school_id, frais_id, student_id, montant, mode, statut, reference, telephone, paye_par, frais_service, encaisse_par)
       VALUES ($1, $2, $3, $4, 'mobile_money', 'en_attente', $5, $6, $7, $8, $9)`,
      [eleve.rows[0].school_id, fraisId, studentId, montant, reference, telephone || null, u.id, fraisService, viaPlateforme ? "plateforme" : "ecole"]
    );
    const retour = `${(process.env.FRONTEND_URL || "").split(",")[0].trim()}/#/${req.body?.retour === "payer" ? `payer/${studentId}` : "scolarite"}`;
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

// Numero de recu Sukul unique (ex. SK-2026-0000123), distinct du recu papier ou du bordereau (recu_externe).
// La base l'attribue automatiquement a tout paiement reussi ; cette fonction couvre les anciens paiements.
const attribuerRecu = (id) =>
  db.query(
    "UPDATE paiements_scolaires SET numero_recu = 'SK-' || to_char(COALESCE(confirme_le, created_at), 'YYYY') || '-' || lpad(id::text, 7, '0') WHERE id = $1 AND (numero_recu IS NULL OR numero_recu NOT LIKE 'SK-%')",
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
      "SELECT notchpay_public_key, orange_money, mtn_momo, paiement_instructions, frais_service_parent, frais_service_pct, telephone FROM schools WHERE id = $1",
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
        telephone: e.telephone || "",
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
    if (b.telephone !== undefined) ajouter("telephone", texte(b.telephone, 30) || null);
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
    // Encaissement fait sans reseau : numero d'operation cree par l'appareil. Renvoye plusieurs fois,
    // il n'est enregistre qu'une seule fois.
    const opClient = /^OP-[A-Z0-9]{4,14}-[A-Z0-9]{4,8}$/.test(String(b.op || "")) ? String(b.op) : null;
    if (opClient) {
      const deja = await operationGuichet(ecole, opClient);
      if (deja) return res.status(200).json({ success: true, data: deja });
    }
    const s = await situationEleve(studentId);
    const frais = s.frais.find((f) => f.id === fraisId);
    if (!frais) throw new ApiError(404, "Frais introuvable pour cet élève");
    if (!(montant > 0) || montant > frais.reste) throw new ApiError(400, `Montant entre 1 et ${fcfa(frais.reste)}`);
    const { rows } = await db.query(
      `INSERT INTO paiements_scolaires (school_id, frais_id, student_id, montant, mode, statut, reference, enregistre_par, confirme_le, recu_externe)
       VALUES ($1, $2, $3, $4, $5, 'reussi', $6, $7, NOW(), $8) RETURNING *`,
      [ecole, fraisId, studentId, montant, mode, `GUI-${studentId}-${Date.now()}`, req.user.id, texte(b.recuExterne || b.reference, 80) || null]
    ).catch((e) => {
      if (e.code === "23505") throw new ApiError(409, "Ce numéro de reçu papier ou de bordereau est déjà enregistré");
      throw e;
    });
    // Les parents sont informes (l'etablissement n'a pas besoin de se notifier lui-meme)
    await apresPaiement({ ...rows[0], paye_par: null, school_id: -1 });
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------- guichet de l'intendance
// Heure locale du Cameroun pour la caisse du jour (les dates sont enregistrees en UTC)
const JOUR_LOCAL = "(p.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Douala')::date";
const MODES_GUICHET = ["especes", "mobile_money", "banque", "autre"];

// Un encaissement (une ou plusieurs lignes), pour le recu imprime.
// op : numero d'operation, ou « P123 » pour un ancien paiement seul (id 123).
const operationGuichet = async (ecole, op) => {
  const seul = /^P\d+$/.test(op) ? Number(op.slice(1)) : null;
  const { rows } = await db.query(
    `SELECT p.id, p.montant, p.mode, p.created_at, p.numero_recu, p.recu_externe, p.verse_par, p.telephone, p.student_id, p.frais_id,
            f.nom AS frais, f.montant AS frais_montant, u.first_name, u.last_name, ${SQL_CLASSE} AS classe,
            sr.admission_number AS matricule, c.first_name AS caissier_prenom, c.last_name AS caissier_nom
     FROM paiements_scolaires p JOIN frais_scolaires f ON f.id = p.frais_id JOIN users u ON u.id = p.student_id
     LEFT JOIN student_records sr ON sr.student_id = u.id LEFT JOIN users c ON c.id = p.enregistre_par
     WHERE p.school_id = $1 AND p.statut = 'reussi' AND ${seul ? "p.id = $2" : "p.operation = $2"}
     ORDER BY p.id`,
    [ecole, seul || op]
  );
  if (!rows.length) return null;
  for (const r of rows.filter((x) => !String(x.numero_recu || "").startsWith("SK-"))) {
    await attribuerRecu(r.id);
    r.numero_recu = (await db.query("SELECT numero_recu FROM paiements_scolaires WHERE id = $1", [r.id])).rows[0].numero_recu;
  }
  const t = rows[0];
  // Situation de l'eleve au moment de l'encaissement (paiements jusqu'a cette operation incluse)
  const sit = await situationEleve(t.student_id);
  const payes = (
    await db.query(
      "SELECT frais_id, SUM(montant)::int AS s FROM paiements_scolaires WHERE student_id = $1 AND statut = 'reussi' AND id <= $2 GROUP BY frais_id",
      [t.student_id, Math.max(...rows.map((r) => r.id))]
    )
  ).rows;
  const payeA = new Map(payes.map((x) => [x.frais_id, x.s]));
  const fraisApres = (sit?.frais || []).map((f) => ({ id: f.id, nom: f.nom, montant: f.montant, obligatoire: f.obligatoire, paye: Math.min(f.montant, payeA.get(f.id) || 0) }));
  const total = fraisApres.reduce((a, f) => a + f.montant, 0);
  const paye = fraisApres.reduce((a, f) => a + f.paye, 0);
  const ecoleInfo = (await db.query("SELECT name, city, photo IS NOT NULL AS a_photo FROM schools WHERE id = $1", [ecole])).rows[0] || {};
  const annee = await assurerAnneeScolaire(ecole);
  const { codeRecu } = require("../../utils/recus");
  return {
    operation: seul ? `P${seul}` : op,
    date: t.created_at,
    ecole: { id: ecole, nom: ecoleInfo.name, ville: ecoleInfo.city, aPhoto: Boolean(ecoleInfo.a_photo) },
    annee: annee?.name || "",
    eleve: { id: t.student_id, nom: t.last_name, prenom: t.first_name, classe: t.classe, matricule: t.matricule },
    mode: t.mode,
    recuExterne: t.recu_externe,
    versePar: t.verse_par,
    telephone: t.telephone,
    caissier: [t.caissier_prenom, t.caissier_nom].filter(Boolean).join(" "),
    lignes: rows.map((r) => {
      const f = fraisApres.find((x) => x.id === r.frais_id);
      return { id: r.id, frais: r.frais, montant: r.montant, numero: r.numero_recu, code: codeRecu(r.numero_recu, r.montant), reste: f ? Math.max(0, f.montant - f.paye) : 0 };
    }),
    total: rows.reduce((a, r) => a + r.montant, 0),
    situation: { total, paye, reste: Math.max(0, total - paye) },
  };
};

// POST /api/scolarite/encaissements : encaissement au guichet, un ou plusieurs frais d'un eleve
// { studentId, lignes: [{ fraisId, montant }], mode, recuExterne, versePar, telephone }
router.post("/encaissements", async (req, res, next) => {
  const client = await db.connect();
  try {
    reserve(req);
    const ecole = ecoleDe(req);
    const b = req.body || {};
    const studentId = entier(b.studentId);
    const mode = MODES_GUICHET.includes(b.mode) ? b.mode : "especes";
    const ok = await db.query("SELECT 1 FROM users WHERE id = $1 AND school_id = $2 AND role = 'student'", [studentId, ecole]);
    if (!ok.rows[0]) throw new ApiError(404, "Élève introuvable");
    // Encaissement fait sans reseau : numero d'operation cree par l'appareil. Renvoye plusieurs fois,
    // il n'est enregistre qu'une seule fois.
    const opClient = /^OP-[A-Z0-9]{4,14}-[A-Z0-9]{4,8}$/.test(String(b.op || "")) ? String(b.op) : null;
    if (opClient) {
      const deja = await operationGuichet(ecole, opClient);
      if (deja) return res.status(200).json({ success: true, data: deja });
    }
    const s = await situationEleve(studentId);
    const vus = new Set();
    const lignes = (Array.isArray(b.lignes) ? b.lignes : []).slice(0, 30).map((l) => {
      const fraisId = entier(l.fraisId);
      const montant = entier(l.montant);
      const frais = s.frais.find((f) => f.id === fraisId);
      if (!frais) throw new ApiError(404, "Frais introuvable pour cet élève");
      if (vus.has(fraisId)) throw new ApiError(400, `« ${frais.nom} » est choisi deux fois`);
      vus.add(fraisId);
      if (!(montant > 0) || montant > frais.reste) throw new ApiError(400, `${frais.nom} : montant entre 1 et ${fcfa(frais.reste)}`);
      return { fraisId, montant };
    });
    if (!lignes.length) throw new ApiError(400, "Choisissez au moins un frais à encaisser");
    const ref = texte(b.recuExterne, 80) || null;
    const op = opClient || `OP-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    // heure reelle de l'encaissement fait sans reseau (au plus 7 jours avant)
    const le = b.le ? new Date(b.le) : null;
    const quand = le && !Number.isNaN(le.getTime()) && le.getTime() < Date.now() + 300000 && Date.now() - le.getTime() < 7 * 86400000 ? le : new Date();
    await client.query("BEGIN");
    for (const [i, l] of lignes.entries()) {
      await client.query(
        `INSERT INTO paiements_scolaires (school_id, frais_id, student_id, montant, mode, statut, reference, enregistre_par, confirme_le,
                                          recu_externe, operation, verse_par, telephone, created_at)
         VALUES ($1, $2, $3, $4, $5, 'reussi', $6, $7, $12, $8, $9, $10, $11, $12)`,
        [ecole, l.fraisId, studentId, l.montant, mode, `${op}-${i + 1}`, req.user.id, ref && (i ? `${ref}/${i + 1}` : ref), op, texte(b.versePar, 120) || null, texte(b.telephone, 30) || null, quand]
      );
    }
    await client.query("COMMIT");
    const data = await operationGuichet(ecole, op);
    // Parents relies a l'eleve : une seule notification pour tout l'encaissement
    const message = `${fcfa(data.total)} · ${data.lignes.map((l) => l.frais).join(", ")} · ${data.eleve.prenom} ${data.eleve.nom}`;
    await db
      .query(
        `INSERT INTO notifications (user_id, title, message, type, data)
         SELECT l.parent_id, 'Paiement de scolarité', $2, 'payment', '{"lien":"/scolarite"}'
         FROM parent_student_links l WHERE l.student_id = $1 RETURNING user_id`,
        [studentId, message]
      )
      .then((r) => r.rows.forEach((x) => emailNotification(x.user_id, { title: "Paiement de scolarité", message, data: { lien: "/scolarite" } })))
      .catch(() => {});
    res.status(201).json({ success: true, data });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    if (e.code === "23505") return next(new ApiError(409, "Ce numéro de reçu papier ou de bordereau est déjà enregistré"));
    next(e);
  } finally {
    client.release();
  }
});

// GET /api/scolarite/hors-ligne : tout ce qu'il faut au guichet et a la verification des recus sans reseau
// (eleves, frais, sommes deja payees, recus emis), garde sur l'appareil de l'administration.
router.get("/hors-ligne", async (req, res, next) => {
  try {
    reserve(req);
    const ecole = ecoleDe(req);
    const annee = await assurerAnneeScolaire(ecole);
    const frais = (
      await db.query(
        `SELECT id, nom, montant, echeance, obligatoire, classes FROM frais_scolaires
         WHERE school_id = $1 AND (academic_year_id IS NULL OR academic_year_id = $2) ORDER BY echeance NULLS LAST, id`,
        [ecole, annee?.id || null]
      )
    ).rows;
    const eleves = (
      await db.query(
        `SELECT u.id, u.last_name, u.first_name, ${SQL_CLASSE} AS classe, regexp_replace(COALESCE(sr.admission_number, ''), '^\\d+-', '') AS matricule
         FROM users u LEFT JOIN student_records sr ON sr.student_id = u.id
         WHERE u.school_id = $1 AND u.role = 'student' AND u.is_active ORDER BY u.last_name, u.first_name`,
        [ecole]
      )
    ).rows.map((e) => [e.id, e.last_name, e.first_name, e.classe || "", e.matricule || ""]);
    const payes = (
      await db.query(
        `SELECT student_id, frais_id, SUM(montant)::int AS s FROM paiements_scolaires WHERE school_id = $1 AND statut = 'reussi' GROUP BY 1, 2`,
        [ecole]
      )
    ).rows.map((p) => [p.student_id, p.frais_id, p.s]);
    const { codeRecu } = require("../../utils/recus");
    const recus = (
      await db.query(
        `SELECT numero_recu, recu_externe, montant, student_id, frais_id, COALESCE(confirme_le, created_at) AS d, mode
         FROM paiements_scolaires WHERE school_id = $1 AND statut = 'reussi' AND numero_recu IS NOT NULL ORDER BY id`,
        [ecole]
      )
    ).rows.map((r) => [r.numero_recu, r.montant, codeRecu(r.numero_recu, r.montant), r.student_id, r.frais_id, r.d, r.mode, r.recu_externe || null]);
    res.json({ success: true, data: { le: new Date().toISOString(), ecole, frais, eleves, payes, recus } });
  } catch (e) {
    next(e);
  }
});

// GET /api/scolarite/encaissements/:op : un encaissement, pour imprimer ou reimprimer le recu
router.get("/encaissements/:op", async (req, res, next) => {
  try {
    reserve(req);
    const data = await operationGuichet(ecoleDe(req), String(req.params.op).slice(0, 40));
    if (!data) throw new ApiError(404, "Encaissement introuvable");
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

// GET /api/scolarite/caisse?date=AAAA-MM-JJ : la caisse d'un jour (encaissements au guichet)
router.get("/caisse", async (req, res, next) => {
  try {
    reserve(req);
    const ecole = ecoleDe(req);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || "")) ? req.query.date : null;
    const { rows } = await db.query(
      `SELECT COALESCE(p.operation, 'P' || p.id) AS op, MIN(p.created_at) AS created_at, SUM(p.montant)::int AS montant,
              MIN(p.mode) AS mode, MIN(p.numero_recu) AS numero, MIN(p.recu_externe) AS recu_externe, MIN(p.verse_par) AS verse_par,
              string_agg(f.nom, ', ' ORDER BY p.id) AS frais, MIN(u.last_name) AS nom, MIN(u.first_name) AS prenom,
              MIN(${SQL_CLASSE}) AS classe, MIN(c.first_name || ' ' || c.last_name) AS caissier
       FROM paiements_scolaires p JOIN frais_scolaires f ON f.id = p.frais_id JOIN users u ON u.id = p.student_id
       LEFT JOIN users c ON c.id = p.enregistre_par
       WHERE p.school_id = $1 AND p.statut = 'reussi' AND p.enregistre_par IS NOT NULL
         AND ${JOUR_LOCAL} = COALESCE($2::date, (NOW() AT TIME ZONE 'Africa/Douala')::date)
       GROUP BY 1 ORDER BY 2 DESC`,
      [ecole, date]
    );
    const parFrais = (
      await db.query(
        `SELECT f.nom, SUM(p.montant)::int AS total, COUNT(*)::int AS nb
         FROM paiements_scolaires p JOIN frais_scolaires f ON f.id = p.frais_id
         WHERE p.school_id = $1 AND p.statut = 'reussi' AND p.enregistre_par IS NOT NULL
           AND ${JOUR_LOCAL} = COALESCE($2::date, (NOW() AT TIME ZONE 'Africa/Douala')::date)
         GROUP BY f.nom ORDER BY 2 DESC`,
        [ecole, date]
      )
    ).rows;
    const parMode = {};
    for (const r of rows) parMode[r.mode] = (parMode[r.mode] || 0) + r.montant;
    const jourLocal = date || (await db.query("SELECT to_char((NOW() AT TIME ZONE 'Africa/Douala')::date, 'YYYY-MM-DD') AS d")).rows[0].d;
    const ecoleInfo = (await db.query("SELECT name, city FROM schools WHERE id = $1", [ecole])).rows[0] || {};
    res.json({
      success: true,
      data: {
        date: jourLocal,
        ecole: { nom: ecoleInfo.name, ville: ecoleInfo.city },
        total: rows.reduce((a, r) => a + r.montant, 0),
        nb: rows.length,
        parMode,
        parFrais,
        operations: rows,
      },
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/scolarite/releve/:eleveId : releve de l'annee (frais, paye, reste, tous les recus)
router.get("/releve/:eleveId", async (req, res, next) => {
  try {
    const id = entier(req.params.eleveId);
    const u = req.user;
    const e = (await db.query("SELECT school_id FROM users WHERE id = $1 AND role = 'student'", [id])).rows[0];
    const autorise = e && ((u.role === "principal" && u.schoolId === e.school_id) || u.role === "admin" || (await elevesAccessibles(u)).includes(id));
    if (!autorise) throw new ApiError(404, "Élève introuvable");
    const sit = await situationEleve(id);
    const annee = await assurerAnneeScolaire(e.school_id);
    const ecole = (await db.query("SELECT name, city, photo IS NOT NULL AS a_photo FROM schools WHERE id = $1", [e.school_id])).rows[0];
    const recus = (
      await db.query(
        `SELECT p.id, p.montant, p.mode, p.created_at, p.confirme_le, p.numero_recu, p.recu_externe, f.nom AS frais
         FROM paiements_scolaires p JOIN frais_scolaires f ON f.id = p.frais_id
         WHERE p.student_id = $1 AND p.statut = 'reussi' ORDER BY p.created_at`,
        [id]
      )
    ).rows;
    for (const p of recus.filter((x) => !String(x.numero_recu || '').startsWith('SK-'))) {
      await attribuerRecu(p.id);
      p.numero_recu = (await db.query("SELECT numero_recu FROM paiements_scolaires WHERE id = $1", [p.id])).rows[0].numero_recu;
    }
    const mat = (await db.query("SELECT admission_number FROM student_records WHERE student_id = $1", [id])).rows[0];
    res.json({ success: true, data: { ...sit, recus, ecoleId: e.school_id, aPhoto: Boolean(ecole?.a_photo), ecole: ecole?.name, ville: ecole?.city, annee: annee?.name || "", matricule: mat?.admission_number || null, edite: new Date() } });
  } catch (err) {
    next(err);
  }
});

// GET /api/scolarite/recus/:id : recu d'un paiement (parent relie, eleve, etablissement)
router.get("/recus/:id", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT p.id, p.montant, p.mode, p.reference, p.created_at, p.confirme_le, p.numero_recu, p.recu_externe, p.frais_service, p.student_id, p.school_id, p.paye_par,
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
    if (!String(r.numero_recu || '').startsWith('SK-')) {
      await attribuerRecu(r.id);
      r.numero_recu = (await db.query("SELECT numero_recu FROM paiements_scolaires WHERE id = $1", [r.id])).rows[0].numero_recu;
    }
    const paye = (
      await db.query("SELECT COALESCE(SUM(montant), 0)::int AS t FROM paiements_scolaires WHERE frais_id = (SELECT frais_id FROM paiements_scolaires WHERE id = $1) AND student_id = $2 AND statut = 'reussi' AND created_at <= $3", [r.id, r.student_id, r.created_at])
    ).rows[0].t;
    const sit = await situationEleve(r.student_id);
    const { codeRecu } = require("../../utils/recus");
    res.json({
      success: true,
      data: { ...r, resteApres: Math.max(0, r.frais_montant - paye), code: codeRecu(r.numero_recu, r.montant), annee: sit ? { total: sit.total, paye: sit.paye, reste: sit.reste } : null },
    });
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
  fr AS (SELECT id, nom, montant, classes, echeance, categorie FROM frais_scolaires
         WHERE school_id = $1 AND obligatoire AND (academic_year_id IS NULL OR academic_year_id = $2)),
  du AS (SELECT el.*, fr.id AS frais_id, fr.nom AS frais, fr.montant, fr.echeance, fr.categorie FROM el JOIN fr
         ON (fr.classes IS NULL OR cardinality(fr.classes) = 0 OR EXISTS (SELECT 1 FROM unnest(fr.classes) x WHERE lower(el.classe) = lower(x) OR lower(el.classe) LIKE lower(x) || ' %'))),
  pa AS (SELECT student_id, frais_id, SUM(montant) AS s FROM paiements_scolaires WHERE school_id = $1 AND statut = 'reussi' GROUP BY 1, 2)
  SELECT du.*, LEAST(COALESCE(pa.s, 0), du.montant)::int AS paye, GREATEST(du.montant - COALESCE(pa.s, 0), 0)::int AS reste,
         (du.echeance < CURRENT_DATE AND COALESCE(pa.s, 0) < du.montant) AS en_retard
  FROM du LEFT JOIN pa ON pa.student_id = du.id AND pa.frais_id = du.frais_id`;


// ---------------------------------------------------------------- frais : modification et import de document
const lireChampsFrais = (b) => {
  const nom = texte(b.nom, 120);
  const montant = entier(b.montant);
  if (!nom) throw new ApiError(400, "Nom du frais obligatoire (ex. Pension 1re tranche)");
  if (!(montant > 0)) throw new ApiError(400, "Montant invalide");
  const classes = Array.isArray(b.classes) ? b.classes.map((c) => texte(c, 50)).filter(Boolean) : [];
  const echeance = /^\d{4}-\d{2}-\d{2}$/.test(String(b.echeance || "")) ? b.echeance : null; // null = sans echeance
  return {
    nom,
    montant,
    echeance,
    classes: classes.length ? classes : null,
    categorie: CATEGORIES.includes(b.categorie) ? b.categorie : "scolarite",
    obligatoire: b.obligatoire !== false,
  };
};

// PUT /frais/:id : modifier un frais deja ajoute
router.put("/frais/:id", async (req, res, next) => {
  try {
    reserve(req);
    const ecole = ecoleDe(req);
    const c = lireChampsFrais(req.body || {});
    const { rows } = await db.query(
      `UPDATE frais_scolaires SET nom = $3, montant = $4, echeance = $5, classes = $6, obligatoire = $7, categorie = $8
       WHERE id = $1 AND school_id = $2 RETURNING *`,
      [entier(req.params.id), ecole, c.nom, c.montant, c.echeance, c.classes, c.obligatoire, c.categorie]
    );
    if (!rows[0]) throw new ApiError(404, "Frais introuvable");
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    next(e);
  }
});

const sansAccentFrais = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// Nom d'un frais pour la comparaison : « Pension – 1ère tranche », « pension 1re tranche » et
// « Pension première tranche » designent le meme frais
const ORDINAUX = [[/\b(1 ?(ere|re|er)|premiere?)\b/g, "1"], [/\b(2 ?(eme|e|nde|nd)|deuxieme|seconde?)\b/g, "2"], [/\b(3 ?(eme|e)|troisieme)\b/g, "3"], [/\b(4 ?(eme|e)|quatrieme)\b/g, "4"]];
const cleFrais = (t) => {
  // sigles ecrits avec des points (« A.P.E.E » = « APEE »)
  let s = sansAccentFrais(t).replace(/\b(?:[a-z] )+[a-z]\b/g, (m) => m.replace(/ /g, ""));
  for (const [motif, chiffre] of ORDINAUX) s = s.replace(motif, chiffre);
  return s.replace(/\b(les?|la|du|de|des|d|frais)\b/g, " ").replace(/\s+/g, " ").trim();
};
const memesClasses = (a, b) => [...(a || [])].map(sansAccentFrais).sort().join("|") === [...(b || [])].map(sansAccentFrais).sort().join("|");

// POST /frais/lire { url, mime } ou { texte } : lit un document contenant les frais de l'etablissement
// et les compare aux frais existants (nouveau, modifie, identique). N'ecrit rien : l'application
// envoie ensuite les nouveaux et les modifies a /frais/appliquer. Aucun frais n'est jamais supprime.
router.post("/frais/lire", async (req, res, next) => {
  try {
    reserve(req);
    const ecole = ecoleDe(req);
    const { lireDocument } = require("../../utils/ia");
    const { prefixePublic } = require("../medias/routes");
    const b = req.body || {};
    let images = [];
    let pdfs = [];
    let contenu = "";
    if (b.texte) contenu = String(b.texte);
    else {
      const url = String(b.url || "");
      if (!url.startsWith(prefixePublic())) throw new ApiError(400, "Document invalide");
      const r = await fetch(url);
      const buf = Buffer.from(await r.arrayBuffer());
      if (!r.ok || buf.length > 15 * 1024 * 1024) throw new ApiError(400, "Document trop lourd ou introuvable");
      const mime = String(b.mime || "");
      const b64 = buf.toString("base64");
      if (mime.startsWith("image/")) images = [`data:${mime === "image/png" ? "image/png" : mime === "image/webp" ? "image/webp" : "image/jpeg"};base64,${b64}`];
      else if (mime === "application/pdf") pdfs = [b64];
      else throw new ApiError(400, "Format non lisible : utilisez un PDF, une photo, un fichier Excel ou CSV");
    }
    const tableau = contenu ? require("../../utils/tableur").frais(contenu) : null;
    const j = tableau || await require("../../utils/quota-ia").lireAvecQuota(req, "frais", {
      images,
      pdfs,
      texte: contenu,
      maxTokens: 6000,
      consigne: `Ce document, fourni par un établissement scolaire camerounais, contient la liste de ses frais de scolarité (pension, tranches, inscription, APEE, examens, tenue, cantine, transport, activités…), parfois par classe ou par niveau.
Extrais CHAQUE frais séparément. Renvoie : {"frais": [{"nom": "Pension – 1re tranche", "montant": 50000 (entier en FCFA, sans espaces), "echeance": "AAAA-MM-JJ" ou null si aucune date n'est indiquée,
"categorie": une valeur parmi [${CATEGORIES.join(", ")}], "classes": ["6e", "5e"] (noms de classes ou de niveaux concernés ; tableau vide si tout l'établissement), "obligatoire": true ou false (false pour cantine, transport, sorties, options)}]}.
Si un même frais a un montant différent selon le niveau, crée une ligne par niveau en l'indiquant dans "classes". N'invente rien : ignore ce qui n'est pas un frais.`,
    });
    const lus = (Array.isArray(j.frais) ? j.frais : []).slice(0, 80).map((x) => {
      try {
        return lireChampsFrais(x);
      } catch (_) {
        return null;
      }
    }).filter(Boolean);
    if (!lus.length) throw new ApiError(422, "Aucun frais trouvé dans ce document");
    const annee = await assurerAnneeScolaire(ecole);
    const existants = (
      await db.query("SELECT * FROM frais_scolaires WHERE school_id = $1 AND (academic_year_id IS NULL OR academic_year_id = $2)", [ecole, annee?.id || null])
    ).rows;
    // Chaque frais existant n'est associe qu'une seule fois (meme nom et memes classes d'abord)
    const pris = new Set();
    const data = lus.map((c) => {
      const libre = (e) => !pris.has(e.id) && cleFrais(e.nom) === cleFrais(c.nom);
      const ex = existants.find((e) => libre(e) && memesClasses(e.classes, c.classes)) || existants.find(libre);
      let statut = "nouveau";
      let changements = [];
      if (ex) {
        pris.add(ex.id);
        c.nom = ex.nom; // le nom deja enregistre est garde : seules les donnees changent
        if (ex.montant !== c.montant) changements.push(`montant ${ex.montant.toLocaleString("fr-FR")} → ${c.montant.toLocaleString("fr-FR")}`);
        const ech = ex.echeance ? new Date(ex.echeance).toISOString().slice(0, 10) : null;
        if (ech !== c.echeance) changements.push(`échéance ${ech || "aucune"} → ${c.echeance || "aucune"}`);
        if (!memesClasses(ex.classes, c.classes)) changements.push("classes concernées");
        if (ex.categorie !== c.categorie) changements.push("type de frais");
        if (ex.obligatoire !== c.obligatoire) changements.push(c.obligatoire ? "devient obligatoire" : "devient facultatif");
        statut = changements.length ? "modifie" : "identique";
      }
      return { ...c, id: ex?.id || null, statut, changements };
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

// POST /frais/appliquer { frais: [{ id?, nom, montant, echeance, classes, categorie, obligatoire }] }
// Cree les nouveaux frais et met a jour ceux qui ont change (les frais identiques ne sont pas envoyes)
router.post("/frais/appliquer", async (req, res, next) => {
  try {
    reserve(req);
    const ecole = ecoleDe(req);
    const annee = await assurerAnneeScolaire(ecole);
    const liste = Array.isArray(req.body?.frais) ? req.body.frais.slice(0, 80) : [];
    let crees = 0;
    let modifies = 0;
    for (const x of liste) {
      const c = lireChampsFrais(x);
      if (x.id) {
        const r = await db.query(
          `UPDATE frais_scolaires SET nom = $3, montant = $4, echeance = $5, classes = $6, obligatoire = $7, categorie = $8 WHERE id = $1 AND school_id = $2`,
          [entier(x.id), ecole, c.nom, c.montant, c.echeance, c.classes, c.obligatoire, c.categorie]
        );
        modifies += r.rowCount;
      } else {
        await db.query(
          `INSERT INTO frais_scolaires (school_id, academic_year_id, nom, montant, echeance, classes, obligatoire, categorie) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [ecole, annee?.id || null, c.nom, c.montant, c.echeance, c.classes, c.obligatoire, c.categorie]
        );
        crees += 1;
      }
    }
    res.json({ success: true, data: { crees, modifies } });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------- comptabilite (tableau de bord de l'etablissement)
// GET /comptabilite : synthese, par type de frais, par frais, par classe, par mode de paiement, par mois
router.get("/comptabilite", async (req, res, next) => {
  try {
    reserve(req);
    const ecole = ecoleDe(req);
    const annee = await assurerAnneeScolaire(ecole);
    const p = [ecole, annee?.id || null];
    const q = (sql) => db.query(sql, p).then((r) => r.rows);
    const [globale, categories, frais, classes, modes, mois, facultatifs, statuts] = await Promise.all([
      q(`SELECT COALESCE(SUM(montant),0)::bigint AS attendu, COALESCE(SUM(paye),0)::bigint AS encaisse, COUNT(DISTINCT id)::int AS eleves,
                COUNT(DISTINCT id) FILTER (WHERE en_retard)::int AS en_retard,
                COUNT(DISTINCT id) FILTER (WHERE reste = 0)::int AS soldes FROM (${SQL_DU}) x`),
      q(`SELECT categorie, SUM(montant)::bigint AS attendu, SUM(paye)::bigint AS encaisse, SUM(reste)::bigint AS reste, COUNT(DISTINCT id)::int AS eleves
         FROM (${SQL_DU}) x GROUP BY categorie ORDER BY SUM(montant) DESC`),
      q(`SELECT frais_id AS id, frais AS nom, categorie, echeance, SUM(montant)::bigint AS attendu, SUM(paye)::bigint AS encaisse, SUM(reste)::bigint AS reste,
                COUNT(DISTINCT id)::int AS eleves, COUNT(DISTINCT id) FILTER (WHERE en_retard)::int AS en_retard
         FROM (${SQL_DU}) x GROUP BY frais_id, frais, categorie, echeance ORDER BY categorie, echeance NULLS LAST, frais`),
      q(`SELECT classe, COUNT(DISTINCT id)::int AS effectif, SUM(montant)::bigint AS attendu, SUM(paye)::bigint AS encaisse, SUM(reste)::bigint AS reste,
                COUNT(DISTINCT id) FILTER (WHERE en_retard)::int AS en_retard FROM (${SQL_DU}) x GROUP BY classe ORDER BY classe`),
      db.query(
        `SELECT mode, COUNT(*)::int AS nb, SUM(montant)::bigint AS total FROM paiements_scolaires WHERE school_id = $1 AND statut = 'reussi' GROUP BY mode ORDER BY SUM(montant) DESC`,
        [ecole]
      ).then((r) => r.rows),
      db.query(
        `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS mois, SUM(montant)::bigint AS total, COUNT(*)::int AS nb FROM paiements_scolaires
         WHERE school_id = $1 AND statut = 'reussi' AND created_at > NOW() - INTERVAL '12 months' GROUP BY 1 ORDER BY 1`,
        [ecole]
      ).then((r) => r.rows),
      db.query(
        `SELECT f.id, f.nom, f.categorie, SUM(pa.montant)::bigint AS encaisse, COUNT(DISTINCT pa.student_id)::int AS eleves
         FROM paiements_scolaires pa JOIN frais_scolaires f ON f.id = pa.frais_id
         WHERE pa.school_id = $1 AND pa.statut = 'reussi' AND NOT f.obligatoire GROUP BY f.id, f.nom, f.categorie ORDER BY f.nom`,
        [ecole]
      ).then((r) => r.rows),
      // situation de chaque eleve sur les frais obligatoires : a jour, partiel, rien paye
      q(`SELECT COUNT(*) FILTER (WHERE r = 0)::int AS a_jour, COUNT(*) FILTER (WHERE r > 0 AND p > 0)::int AS partiels, COUNT(*) FILTER (WHERE p = 0 AND r > 0)::int AS non_payes
         FROM (SELECT id, SUM(reste) AS r, SUM(paye) AS p FROM (${SQL_DU}) x GROUP BY id) y`),
    ]);
    const g = globale[0] || { attendu: 0, encaisse: 0, eleves: 0, en_retard: 0, soldes: 0 };
    res.json({
      success: true,
      data: {
        annee: annee?.name || null,
        totaux: { attendu: Number(g.attendu), encaisse: Number(g.encaisse), reste: Number(g.attendu) - Number(g.encaisse), eleves: g.eleves, enRetard: g.en_retard, soldes: g.soldes },
        categories,
        frais,
        classes,
        modes,
        mois,
        facultatifs,
        statuts: statuts[0] || { a_jour: 0, partiels: 0, non_payes: 0 },
      },
    });
  } catch (e) {
    next(e);
  }
});

// GET /comptabilite/frais/:id : detail d'un frais (par classe, par mois, par moyen, situation des eleves)
router.get("/comptabilite/frais/:id", async (req, res, next) => {
  try {
    reserve(req);
    const ecole = ecoleDe(req);
    const annee = await assurerAnneeScolaire(ecole);
    const fid = entier(req.params.id);
    const f = (await db.query("SELECT id, nom, montant, echeance, categorie, obligatoire, classes FROM frais_scolaires WHERE id = $1 AND school_id = $2", [fid, ecole])).rows[0];
    if (!f) throw new ApiError(404, "Frais introuvable");
    const p = [ecole, annee?.id || null, fid];
    const [classes, mois, modes] = await Promise.all([
      db.query(
        `SELECT classe, COUNT(*)::int AS eleves, SUM(montant)::bigint AS attendu, SUM(paye)::bigint AS encaisse, SUM(reste)::bigint AS reste,
                COUNT(*) FILTER (WHERE reste = 0)::int AS soldes, COUNT(*) FILTER (WHERE paye = 0)::int AS rien,
                COUNT(*) FILTER (WHERE reste > 0 AND paye > 0)::int AS partiels, COUNT(*) FILTER (WHERE en_retard)::int AS retard
         FROM (${SQL_DU}) x WHERE frais_id = $3 GROUP BY classe ORDER BY classe`,
        p
      ),
      db.query(
        `SELECT to_char(COALESCE(confirme_le, created_at), 'YYYY-MM') AS mois, SUM(montant)::bigint AS total, COUNT(*)::int AS nb
         FROM paiements_scolaires WHERE school_id = $1 AND frais_id = $2 AND statut = 'reussi' GROUP BY 1 ORDER BY 1`,
        [ecole, fid]
      ),
      db.query(
        `SELECT mode, SUM(montant)::bigint AS total, COUNT(*)::int AS nb FROM paiements_scolaires
         WHERE school_id = $1 AND frais_id = $2 AND statut = 'reussi' GROUP BY mode ORDER BY 2 DESC`,
        [ecole, fid]
      ),
    ]);
    res.json({ success: true, data: { frais: f, classes: classes.rows, mois: mois.rows, modes: modes.rows } });
  } catch (e) {
    next(e);
  }
});

// GET /comptabilite/eleves[?classe=6e A] : le detail frais par frais de chaque eleve
router.get("/comptabilite/eleves", async (req, res, next) => {
  try {
    reserve(req);
    const ecole = ecoleDe(req);
    const annee = await assurerAnneeScolaire(ecole);
    const classe = texte(req.query.classe, 60);
    const { rows } = await db.query(
      `SELECT id, first_name, last_name, classe, frais, categorie, montant, paye, reste, echeance, en_retard
       FROM (${SQL_DU}) x ${classe ? "WHERE classe = $3" : ""} ORDER BY classe, last_name, first_name, categorie, echeance NULLS LAST`,
      classe ? [ecole, annee?.id || null, classe] : [ecole, annee?.id || null]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

// GET /api/scolarite/recouvrement[?classe=6e A] : par classe, ou les eleves d'une classe
router.get("/recouvrement", async (req, res, next) => {
  try {
    reserve(req);
    const ecole = ecoleDe(req);
    const annee = await assurerAnneeScolaire(ecole);
    // Export : tous les eleves, avec leur reste (pour Excel)
    if (req.query.tous) {
      const { rows } = await db.query(
        `SELECT id, first_name, last_name, classe, SUM(montant)::int AS du, SUM(paye)::int AS paye, SUM(reste)::int AS reste, bool_or(en_retard) AS en_retard
         FROM (${SQL_DU}) x GROUP BY id, first_name, last_name, classe ORDER BY classe, last_name, first_name`,
        [ecole, annee?.id || null]
      );
      return res.json({ success: true, data: rows });
    }
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

// GET /api/scolarite/relances : reglage des relances automatiques et dernieres relances envoyees
router.get("/relances", async (req, res, next) => {
  try {
    reserve(req);
    const ecole = ecoleDe(req);
    const s = (await db.query("SELECT relances_auto, derniere_relance FROM schools WHERE id = $1", [ecole])).rows[0] || {};
    const n = (
      await db.query(
        `SELECT COUNT(DISTINCT student_id)::int AS eleves, MAX(created_at) AS derniere FROM relances_frais
         WHERE school_id = $1 AND created_at > NOW() - INTERVAL '30 days'`,
        [ecole]
      )
    ).rows[0];
    res.json({ success: true, data: { auto: Boolean(s.relances_auto), derniereManuelle: s.derniere_relance, eleves30j: n.eleves, derniereAuto: n.derniere } });
  } catch (e) {
    next(e);
  }
});

// PUT /api/scolarite/relances { auto } : activer ou couper les relances automatiques
router.put("/relances", async (req, res, next) => {
  try {
    reserve(req);
    const ecole = ecoleDe(req);
    const auto = req.body?.auto === true;
    await db.query("UPDATE schools SET relances_auto = $2 WHERE id = $1", [ecole, auto]);
    res.json({ success: true, data: { auto } });
  } catch (e) {
    next(e);
  }
});

// GET /api/scolarite/avis-relance[?classe=6e A] : eleves en retard et leurs frais echus, pour imprimer les avis
router.get("/avis-relance", async (req, res, next) => {
  try {
    reserve(req);
    const ecole = ecoleDe(req);
    const annee = await assurerAnneeScolaire(ecole);
    const classe = texte(req.query.classe, 60) || null;
    const s = (await db.query("SELECT name, city, telephone FROM schools WHERE id = $1", [ecole])).rows[0] || {};
    const { rows } = await db.query(
      `SELECT x.id, x.first_name, x.last_name, x.classe, x.frais, x.echeance, x.montant, x.paye, x.reste
       FROM (${SQL_DU}) x WHERE x.en_retard AND ($3::text IS NULL OR x.classe = $3)
       ORDER BY x.classe, x.last_name, x.first_name, x.echeance`,
      [ecole, annee?.id || null, classe]
    );
    const eleves = [];
    const idx = new Map();
    for (const r of rows) {
      if (!idx.has(r.id)) {
        const e = { id: r.id, nom: `${r.last_name} ${r.first_name}`, classe: r.classe, frais: [] };
        idx.set(r.id, e);
        eleves.push(e);
      }
      idx.get(r.id).frais.push({ nom: r.frais, echeance: r.echeance, montant: r.montant, paye: r.paye, reste: r.reste });
    }
    res.json({ success: true, data: { ecole: { nom: s.name, ville: s.city, telephone: s.telephone }, annee: annee?.name || "", eleves } });
  } catch (e) {
    next(e);
  }
});

// GET /api/scolarite/reversements : paiements en ligne encaisses par Sùkûl pour l'etablissement
router.get("/reversements", async (req, res, next) => {
  try {
    reserve(req);
    const ecole = ecoleDe(req);
    const t = (
      await db.query(
        `SELECT COALESCE((SELECT SUM(montant) FROM paiements_scolaires WHERE school_id = $1 AND statut = 'reussi' AND encaisse_par = 'plateforme'), 0)::bigint AS encaisse,
                COALESCE((SELECT SUM(montant) FROM reversements WHERE school_id = $1), 0)::bigint AS reverse`,
        [ecole]
      )
    ).rows[0];
    const liste = (await db.query("SELECT montant, reference, note, created_at FROM reversements WHERE school_id = $1 ORDER BY created_at DESC LIMIT 50", [ecole])).rows;
    res.json({ success: true, data: { encaisse: Number(t.encaisse), reverse: Number(t.reverse), du: Number(t.encaisse) - Number(t.reverse), reversements: liste } });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
module.exports.verifierPaiement = verifierPaiement;
module.exports.situationEleve = situationEleve;
module.exports.elevesAccessibles = elevesAccessibles;
module.exports.SQL_DU = SQL_DU;
module.exports.apresPaiement = apresPaiement;
module.exports.moyensEcole = moyensEcole;
