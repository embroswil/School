// modules/familles/routes.js
// Parents, tuteurs et donateurs : apres l'inscription (sans etablissement ni
// enfant), ils cherchent un eleve dans un etablissement, puis :
// - « C'est mon enfant » : rattachement verifie (date de naissance), sinon
//   valide par l'etablissement — car il donne acces aux notes, absences, sanctions ;
// - « Payer sa scolarite » : ouvert a tous (donateur), qui ne voit que les frais.
// Par prudence (donnees d'enfants), pas de liste complete : une recherche par nom.
const express = require("express");
const router = express.Router();
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { authenticate } = require("../../middlewares/auth.middleware");
const { notifierEtablissement, notifierUtilisateur } = require("../../utils/notifier");
const S = require("../scolarite/routes");

router.use(authenticate);
const entier = (v) => parseInt(v, 10);
const texte = (v, max = 100) => String(v ?? "").trim().slice(0, max);
const LIENS = ["pere", "mere", "tuteur", "oncle_tante", "grand_parent", "frere_soeur", "parent", "autre"];
const LIBELLES = { pere: "Père", mere: "Mère", tuteur: "Tuteur", oncle_tante: "Oncle / tante", grand_parent: "Grand-parent", frere_soeur: "Frère / sœur", parent: "Parent", autre: "Proche" };
const SQL_CLASSE = `(SELECT c.name FROM class_students cs JOIN classes c ON c.id = cs.class_id
                     WHERE cs.student_id = u.id AND cs.status = 'active' ORDER BY cs.enrolled_at DESC LIMIT 1)`;
const reserveParent = (req) => {
  if (req.user.role !== "parent") throw new ApiError(403, "Réservé aux parents, tuteurs et donateurs");
};

// Relie le parent a l'eleve (et lui donne l'etablissement s'il n'en a pas encore)
const relier = async (parentId, studentId, lien) => {
  await db.query(
    `INSERT INTO parent_student_links (parent_id, student_id, relationship, is_primary)
     SELECT $1, $2, $3::varchar, $3::varchar IN ('pere', 'mere', 'parent', 'tuteur')
     WHERE NOT EXISTS (SELECT 1 FROM parent_student_links WHERE parent_id = $1 AND student_id = $2)`,
    [parentId, studentId, lien]
  );
  await db.query(
    "UPDATE users SET school_id = (SELECT school_id FROM users WHERE id = $2) WHERE id = $1 AND school_id IS NULL",
    [parentId, studentId]
  );
};

// GET /api/familles/ecoles?q= : etablissements actifs
router.get("/ecoles", async (req, res, next) => {
  try {
    const q = `%${texte(req.query.q, 60)}%`;
    const { rows } = await db.query(
      `SELECT id, name, city, type FROM schools WHERE is_active AND (name ILIKE $1 OR city ILIKE $1) ORDER BY name LIMIT 30`,
      [q]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

// GET /api/familles/ecoles/:id/eleves?q= : recherche d'un eleve (3 lettres minimum, 15 resultats)
router.get("/ecoles/:id/eleves", async (req, res, next) => {
  try {
    reserveParent(req);
    const q = texte(req.query.q, 60);
    if (q.replace(/\s/g, "").length < 3) return res.json({ success: true, data: [] });
    const mots = q.split(/\s+/).filter(Boolean).slice(0, 4);
    const conds = mots.map((_, i) => `(u.first_name || ' ' || u.last_name) ILIKE $${i + 2}`).join(" AND ");
    const { rows } = await db.query(
      `SELECT u.id, u.first_name, u.last_name, ${SQL_CLASSE} AS classe,
              EXISTS (SELECT 1 FROM parent_student_links l WHERE l.student_id = u.id AND l.parent_id = $${mots.length + 2}) AS deja_relie
       FROM users u WHERE u.school_id = $1 AND u.role = 'student' AND u.is_active AND ${conds}
       ORDER BY u.last_name, u.first_name LIMIT 15`,
      [entier(req.params.id), ...mots.map((m) => `%${m}%`), req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

// Consultation des listes de classes : reservee aux comptes dont l'email est confirme
const exigerEmailConfirme = async (u) => {
  const r = (await db.query("SELECT email_verifie, telephone_verifie FROM users WHERE id = $1", [u.id])).rows[0];
  if (!r?.email_verifie && !r?.telephone_verifie) throw new ApiError(403, "Confirmez d’abord votre compte (code reçu par WhatsApp ou par email) pour consulter les listes de classes");
};

// GET /api/familles/ecoles/:id/classes : classes de l'annee en cours, avec effectif
router.get("/ecoles/:id/classes", async (req, res, next) => {
  try {
    reserveParent(req);
    const { rows } = await db.query(
      `SELECT c.id, c.name, (SELECT COUNT(*)::int FROM class_students cs WHERE cs.class_id = c.id AND cs.status = 'active') AS effectif
       FROM classes c JOIN academic_years ay ON ay.id = c.academic_year_id AND ay.is_current
       WHERE ay.school_id = $1 ORDER BY c.name`,
      [entier(req.params.id)]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

// GET /api/familles/classes/:id/eleves : liste d'une classe (noms seulement)
router.get("/classes/:id/eleves", async (req, res, next) => {
  try {
    reserveParent(req);
    await exigerEmailConfirme(req.user);
    const { rows } = await db.query(
      `SELECT u.id, u.first_name, u.last_name, c.name AS classe,
              EXISTS (SELECT 1 FROM parent_student_links l WHERE l.student_id = u.id AND l.parent_id = $2) AS deja_relie
       FROM class_students cs JOIN users u ON u.id = cs.student_id JOIN classes c ON c.id = cs.class_id
       WHERE cs.class_id = $1 AND cs.status = 'active' AND u.is_active ORDER BY u.last_name, u.first_name`,
      [entier(req.params.id), req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

// POST /api/familles/relier { studentId, dateNaissance, lien } : « C'est mon enfant »
router.post("/relier", async (req, res, next) => {
  try {
    reserveParent(req);
    const studentId = entier(req.body?.studentId);
    const lien = LIENS.includes(req.body?.lien) ? req.body.lien : "parent";
    const e = (
      await db.query(
        `SELECT u.id, u.first_name, u.last_name, u.school_id, sr.date_of_birth, ${SQL_CLASSE} AS classe
         FROM users u LEFT JOIN student_records sr ON sr.student_id = u.id WHERE u.id = $1 AND u.role = 'student'`,
        [studentId]
      )
    ).rows[0];
    if (!e) throw new ApiError(404, "Élève introuvable");
    if ((await db.query("SELECT 1 FROM parent_student_links WHERE parent_id = $1 AND student_id = $2", [req.user.id, studentId])).rows[0]) {
      return res.json({ success: true, data: { statut: "relie" } });
    }
    const saisie = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.dateNaissance || "") ? req.body.dateNaissance : null;
    const connue = e.date_of_birth ? new Date(e.date_of_birth).toISOString().slice(0, 10) : null;
    if (saisie && connue && saisie === connue) {
      await relier(req.user.id, studentId, lien);
      return res.json({ success: true, data: { statut: "relie" } });
    }
    // Sinon : demande a l'etablissement (une seule en attente par eleve et par parent)
    const ex = await db.query("SELECT id FROM parent_requests WHERE parent_id = $1 AND student_id = $2 AND status = 'pending'", [req.user.id, studentId]);
    if (!ex.rows[0]) {
      await db.query(
        `INSERT INTO parent_requests (school_id, parent_id, child_first_name, child_last_name, child_class, child_birth_date, relationship, student_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [e.school_id, req.user.id, e.first_name, e.last_name, e.classe, saisie, lien, studentId]
      );
      const p = (await db.query("SELECT first_name, last_name FROM users WHERE id = $1", [req.user.id])).rows[0];
      await notifierEtablissement(e.school_id, {
        title: "Demande de rattachement d’un parent",
        message: `${p.first_name} ${p.last_name} (${LIBELLES[lien]}) demande à suivre ${e.first_name} ${e.last_name}${e.classe ? ` (${e.classe})` : ""}.`,
        type: "account",
        data: { lien: "/rattachements" },
      }).catch(() => {});
    }
    res.json({ success: true, data: { statut: "en_attente" } });
  } catch (e) {
    next(e);
  }
});

// GET /api/familles/eleves/:id/frais : frais et reste a payer (pour un parent ou un donateur)
router.get("/eleves/:id/frais", async (req, res, next) => {
  try {
    reserveParent(req);
    const id = entier(req.params.id);
    const e = (
      await db.query(
        `SELECT u.id, u.first_name, u.last_name, ${SQL_CLASSE} AS classe, s.name AS ecole, s.id AS school_id
         FROM users u JOIN schools s ON s.id = u.school_id WHERE u.id = $1 AND u.role = 'student' AND s.is_active`,
        [id]
      )
    ).rows[0];
    if (!e) throw new ApiError(404, "Élève introuvable");
    const sit = await S.situationEleve(id);
    const { public: moyens } = await S.moyensEcole(e.school_id);
    res.json({
      success: true,
      data: {
        eleve: { id: e.id, prenom: e.first_name, nom: e.last_name, classe: e.classe, ecole: e.ecole },
        frais: (sit?.frais || []).map((f) => ({ id: f.id, nom: f.nom, montant: f.montant, reste: f.reste, echeance: f.echeance, obligatoire: f.obligatoire, categorie: f.categorie })),
        moyens: { orange: moyens.orange, mtn: moyens.mtn, enLigne: moyens.enLigne },
      },
    });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------- cote etablissement

// GET /api/familles/demandes : demandes de rattachement a valider
router.get("/demandes", async (req, res, next) => {
  try {
    if (req.user.role !== "principal") throw new ApiError(403, "Réservé à l’établissement");
    const { rows } = await db.query(
      `SELECT r.id, r.relationship, r.child_birth_date, r.created_at, r.student_id,
              p.first_name AS parent_prenom, p.last_name AS parent_nom, p.phone AS parent_tel, p.email AS parent_email,
              u.first_name, u.last_name, ${SQL_CLASSE} AS classe, sr.date_of_birth
       FROM parent_requests r JOIN users p ON p.id = r.parent_id JOIN users u ON u.id = r.student_id
       LEFT JOIN student_records sr ON sr.student_id = u.id
       WHERE r.school_id = $1 AND r.status = 'pending' AND r.student_id IS NOT NULL ORDER BY r.created_at`,
      [req.user.schoolId]
    );
    res.json({ success: true, data: rows.map((r) => ({ ...r, lien: LIBELLES[r.relationship] || r.relationship })) });
  } catch (e) {
    next(e);
  }
});

// POST /api/familles/demandes/:id { accepter: true|false }
router.post("/demandes/:id", async (req, res, next) => {
  try {
    if (req.user.role !== "principal") throw new ApiError(403, "Réservé à l’établissement");
    const r = (
      await db.query("SELECT * FROM parent_requests WHERE id = $1 AND school_id = $2 AND status = 'pending'", [entier(req.params.id), req.user.schoolId])
    ).rows[0];
    if (!r) throw new ApiError(404, "Demande introuvable");
    const accepter = req.body?.accepter === true;
    if (accepter) await relier(r.parent_id, r.student_id, r.relationship || "parent");
    await db.query("UPDATE parent_requests SET status = $2, decided_by = $3, decided_at = NOW() WHERE id = $1", [
      r.id,
      accepter ? "approved" : "rejected",
      req.user.id,
    ]);
    await notifierUtilisateur(r.parent_id, {
      title: accepter ? "Rattachement accepté" : "Rattachement refusé",
      message: accepter
        ? `Vous suivez maintenant ${r.child_first_name} ${r.child_last_name}.`
        : `L’établissement n’a pas validé votre demande pour ${r.child_first_name} ${r.child_last_name}. Contactez-le si besoin.`,
      type: "account",
      data: { lien: "/" },
    }).catch(() => {});
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
