// modules/etablissement/routes.js
// Espace de l'administrateur d'un etablissement : tableau de bord, eleves,
// enseignants. Tout est limite a SON etablissement.
const express = require("express");
const router = express.Router();
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { authenticate, authorize } = require("../../middlewares/auth.middleware");
const { assurerAnneeScolaire } = require("../../utils/annees");
const { notifierUtilisateur } = require("../../utils/notifier");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

// Email technique des eleves importes (sans compte de connexion). Quand l'eleve
// cree son compte avec les memes prenom et nom, il « reprend » cette fiche.
const DOMAINE_IMPORT = "inscrit.school";

router.use(authenticate, authorize("admin"));

// Etablissement concerne : celui de l'utilisateur (ou ?ecole= pour l'admin de la plateforme)
const ecoleDe = (req) => {
  const id = req.user.role === "admin" ? parseInt(req.query.ecole, 10) : req.user.schoolId;
  if (!id) throw new ApiError(400, "Établissement non précisé");
  return id;
};
const anneeCourante = async (ecole) =>
  (
    await db.query(
      "SELECT id, name FROM academic_years WHERE school_id = $1 ORDER BY is_current DESC, start_date DESC LIMIT 1",
      [ecole]
    )
  ).rows[0] || null;

router.get("/tableau", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    await assurerAnneeScolaire(ecole); // annee scolaire en cours, creee automatiquement
    const annee = await anneeCourante(ecole);
    const { rows } = await db.query(
      `SELECT
        (SELECT name FROM schools WHERE id = $1) AS nom,
        (SELECT photo FROM schools WHERE id = $1) AS photo,
        (SELECT COUNT(*)::int FROM users WHERE school_id = $1 AND role = 'student') AS eleves,
        (SELECT COUNT(*)::int FROM users WHERE school_id = $1 AND role = 'teacher' AND status = 'active') AS enseignants,
        (SELECT COUNT(*)::int FROM users WHERE school_id = $1 AND role = 'teacher' AND status = 'pending') AS enseignants_attente,
        (SELECT COUNT(*)::int FROM users WHERE school_id = $1 AND role = 'parent') AS parents,
        (SELECT COUNT(*)::int FROM classes c JOIN academic_years ay ON ay.id = c.academic_year_id WHERE ay.school_id = $1 AND ($2::int IS NULL OR ay.id = $2)) AS classes,
        (SELECT COUNT(*)::int FROM users u WHERE u.school_id = $1 AND u.role = 'student'
           AND NOT EXISTS (SELECT 1 FROM class_students cs WHERE cs.student_id = u.id AND cs.status = 'active' AND ($2::int IS NULL OR cs.academic_year_id = $2))) AS eleves_sans_classe`,
      [ecole, annee?.id || null]
    );
    res.json({ success: true, data: { ...rows[0], annee } });
  } catch (e) {
    next(e);
  }
});

// Eleves de l'etablissement, avec la classe declaree a l'inscription et la classe reelle
router.get("/eleves", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    const annee = await anneeCourante(ecole);
    const q = String(req.query.q || "").trim();
    const { rows } = await db.query(
      `SELECT u.id, u.first_name, u.last_name, (u.email NOT LIKE '%@inscrit.school') AS a_un_compte, sr.declared_class, sr.date_of_birth,
              c.id AS class_id, c.name AS class_name,
              (SELECT COUNT(*)::int FROM parent_student_links p WHERE p.student_id = u.id) AS parents
       FROM users u
       LEFT JOIN student_records sr ON sr.student_id = u.id
       LEFT JOIN class_students cs ON cs.student_id = u.id AND cs.status = 'active' AND cs.academic_year_id = $2
       LEFT JOIN classes c ON c.id = cs.class_id
       WHERE u.school_id = $1 AND u.role = 'student'
         AND ($3 = '' OR (u.first_name || ' ' || u.last_name) ILIKE '%' || $3 || '%' OR (u.last_name || ' ' || u.first_name) ILIKE '%' || $3 || '%')
         AND ($4::int IS NULL OR c.id = $4 OR ($4 = 0 AND c.id IS NULL))
       ORDER BY c.name NULLS FIRST, u.last_name, u.first_name
       LIMIT 2000`,
      [ecole, annee?.id || null, q, req.query.classe !== undefined && req.query.classe !== "" ? parseInt(req.query.classe, 10) : null]
    );
    res.json({ success: true, data: rows, annee });
  } catch (e) {
    next(e);
  }
});

// Placer un eleve dans une classe (de l'annee courante de l'etablissement)
router.post("/eleves/:id/classe", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    const eleveId = parseInt(req.params.id, 10);
    const classId = parseInt((req.body || {}).classId, 10);
    const eleve = await db.query("SELECT id FROM users WHERE id = $1 AND role = 'student' AND school_id = $2", [eleveId, ecole]);
    if (!eleve.rows[0]) throw new ApiError(404, "Élève introuvable");
    const classe = await db.query(
      `SELECT c.id, c.academic_year_id FROM classes c JOIN academic_years ay ON ay.id = c.academic_year_id
       WHERE c.id = $1 AND ay.school_id = $2`,
      [classId, ecole]
    );
    if (!classe.rows[0]) throw new ApiError(400, "Classe introuvable dans cet établissement");
    const anneeId = classe.rows[0].academic_year_id;
    // Une seule classe active par annee
    await db.query(
      "UPDATE class_students SET status = 'transferred' WHERE student_id = $1 AND academic_year_id = $2 AND status = 'active' AND class_id <> $3",
      [eleveId, anneeId, classId]
    );
    await db.query(
      `INSERT INTO class_students (class_id, student_id, academic_year_id, status)
       SELECT $1, $2, $3, 'active'
       WHERE NOT EXISTS (SELECT 1 FROM class_students WHERE class_id = $1 AND student_id = $2 AND academic_year_id = $3)`,
      [classId, eleveId, anneeId]
    );
    await db.query(
      "UPDATE class_students SET status = 'active' WHERE class_id = $1 AND student_id = $2 AND academic_year_id = $3",
      [classId, eleveId, anneeId]
    );
    res.json({ success: true, message: "Élève placé dans la classe" });
  } catch (e) {
    next(e);
  }
});

// Enseignants actifs de l'etablissement (avec les matieres declarees)
router.get("/enseignants", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    const { rows } = await db.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone,
              (SELECT tr.subjects FROM teacher_requests tr WHERE tr.user_id = u.id ORDER BY tr.id DESC LIMIT 1) AS matieres,
              (SELECT string_agg(DISTINCT c.name, ', ' ORDER BY c.name) FROM class_subjects cs JOIN classes c ON c.id = cs.class_id
               WHERE cs.teacher_id = u.id) AS classes
       FROM users u WHERE u.school_id = $1 AND u.role = 'teacher' AND u.status = 'active'
       ORDER BY u.last_name, u.first_name`,
      [ecole]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

// Classe de l'annee : retrouvee par son nom, ou creee (ex. « 3e A » : niveau 3e, section A)
const classeParNom = async (anneeId, nom) => {
  const n = String(nom || "").trim().replace(/\s+/g, " ").slice(0, 50);
  if (!n) return null;
  const ex = await db.query("SELECT id FROM classes WHERE academic_year_id = $1 AND lower(name) = lower($2)", [anneeId, n]);
  if (ex.rows[0]) return ex.rows[0].id;
  const m = n.match(/^(.*\S)\s+([A-Za-z0-9]{1,3})$/);
  const niveau = (m ? m[1] : n).slice(0, 50);
  const section = m ? m[2].toUpperCase() : null;
  const { rows } = await db.query(
    `INSERT INTO classes (name, academic_year_id, level, section, capacity, is_active)
     VALUES ($1, $2, $3, $4, 80, true)
     ON CONFLICT (academic_year_id, level, section) DO UPDATE SET name = classes.name
     RETURNING id`,
    [n, anneeId, niveau, section]
  );
  return rows[0].id;
};

const GENRE = (v) => {
  const s = String(v || "").trim().toLowerCase();
  if (/^(m|g|garçon|garcon|masculin|male)$/.test(s)) return "male";
  if (/^(f|fille|féminin|feminin|female)$/.test(s)) return "female";
  return null;
};
const DATE = (v) => {
  const s = String(v || "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
};

// POST /api/etablissement/import-eleves
// { eleves: [{ nom, prenom, classe, dateNaissance, sexe, matricule }], classeParDefaut }
// Import en lots : quelques requetes seulement, meme pour 1 000 eleves.
router.post("/import-eleves", async (req, res, next) => {
  const client = await db.connect();
  try {
    const ecole = ecoleDe(req);
    const annee = await assurerAnneeScolaire(ecole);
    const defaut = String(req.body?.classeParDefaut || "").trim();
    const cle = (n, p) => `${n}|${p}`.toLowerCase().replace(/\s+/g, " ").trim();

    // 1. Nettoyage et dedoublonnage de la liste recue
    const vus = new Set();
    const liste = [];
    for (const e of Array.isArray(req.body?.eleves) ? req.body.eleves.slice(0, 3000) : []) {
      const nom = String(e.nom || "").trim().slice(0, 100);
      const prenom = String(e.prenom || "").trim().slice(0, 100) || "-";
      if (!nom || vus.has(cle(nom, prenom))) continue;
      vus.add(cle(nom, prenom));
      liste.push({
        nom,
        prenom,
        classe: String(e.classe || defaut).trim().replace(/\s+/g, " ").slice(0, 50),
        date: DATE(e.dateNaissance),
        genre: GENRE(e.sexe),
        matricule: String(e.matricule || "").trim().slice(0, 40),
      });
    }
    if (!liste.length) throw new ApiError(400, "Aucun élève à importer");

    await client.query("BEGIN");
    // 2. Eleves deja presents dans l'etablissement
    const deja = await client.query(
      "SELECT id, lower(trim(last_name)) AS n, lower(trim(first_name)) AS p FROM users WHERE school_id = $1 AND role = 'student'",
      [ecole]
    );
    const ids = new Map(deja.rows.map((r) => [cle(r.n, r.p), r.id]));
    const nouveaux = liste.filter((e) => !ids.has(cle(e.nom, e.prenom)));

    // 3. Creation des nouveaux eleves en une seule requete
    if (nouveaux.length) {
      const motDePasse = await bcrypt.hash(crypto.randomBytes(18).toString("hex"), 8);
      const { rows } = await client.query(
        `INSERT INTO users (email, password_hash, role, first_name, last_name, school_id, status)
         SELECT 'eleve.' || $1::int || '.' || md5(random()::text || x.nom || x.prenom) || '@${DOMAINE_IMPORT}', $2, 'student', x.prenom, x.nom, $1::int, 'active'
         FROM unnest($3::text[], $4::text[]) AS x(nom, prenom)
         RETURNING id, lower(trim(last_name)) AS n, lower(trim(first_name)) AS p`,
        [ecole, motDePasse, nouveaux.map((e) => e.nom), nouveaux.map((e) => e.prenom)]
      );
      rows.forEach((r) => ids.set(cle(r.n, r.p), r.id));
    }
    const avecId = liste.map((e) => ({ ...e, id: ids.get(cle(e.nom, e.prenom)) })).filter((e) => e.id);

    // 4. Fiches eleves (matricule, naissance, sexe, classe declaree)
    await client.query(
      `INSERT INTO student_records (student_id, admission_number, date_of_birth, gender, declared_class)
       SELECT x.id, CASE WHEN x.mat <> '' THEN $1::text || '-' || x.mat ELSE 'ELV-' || $1::text || '-' || x.id END,
              x.dn::date, NULLIF(x.g, ''), NULLIF(x.cl, '')
       FROM unnest($2::int[], $3::text[], $4::text[], $5::text[], $6::text[]) AS x(id, mat, dn, g, cl)
       ON CONFLICT (student_id) DO UPDATE SET
         date_of_birth = COALESCE(EXCLUDED.date_of_birth, student_records.date_of_birth),
         gender = COALESCE(EXCLUDED.gender, student_records.gender),
         declared_class = COALESCE(EXCLUDED.declared_class, student_records.declared_class)`,
      [
        ecole,
        avecId.map((e) => e.id),
        avecId.map((e) => e.matricule),
        avecId.map((e) => e.date),
        avecId.map((e) => e.genre || ""),
        avecId.map((e) => e.classe),
      ]
    );

    // 5. Classes (creees au besoin) puis placement des eleves
    let places = 0;
    const avecClasse = avecId.filter((e) => e.classe);
    if (avecClasse.length && annee) {
      const classes = new Map();
      for (const nom of [...new Set(avecClasse.map((e) => e.classe))]) classes.set(nom, await classeParNom(annee.id, nom));
      const eleves = avecClasse.map((e) => e.id);
      const cls = avecClasse.map((e) => classes.get(e.classe));
      await client.query(
        `UPDATE class_students cs SET status = 'transferred'
         FROM unnest($1::int[], $2::int[]) AS x(eleve, classe)
         WHERE cs.student_id = x.eleve AND cs.academic_year_id = $3 AND cs.status = 'active' AND cs.class_id <> x.classe`,
        [eleves, cls, annee.id]
      );
      const r = await client.query(
        `INSERT INTO class_students (class_id, student_id, academic_year_id, status)
         SELECT x.classe, x.eleve, $3, 'active' FROM unnest($1::int[], $2::int[]) AS x(eleve, classe)
         ON CONFLICT (class_id, student_id, academic_year_id) DO UPDATE SET status = 'active'`,
        [eleves, cls, annee.id]
      );
      places = r.rowCount;
    }
    await client.query("COMMIT");
    res.json({
      success: true,
      data: { crees: nouveaux.length, existants: liste.length - nouveaux.length, places, erreurs: [] },
    });
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}
    next(e);
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------- matieres et affectations

const { matieresEcole, slug } = require("../../utils/matieres");

router.get("/matieres", async (req, res, next) => {
  try {
    res.json({ success: true, data: await matieresEcole(ecoleDe(req)) });
  } catch (e) {
    next(e);
  }
});

router.post("/matieres", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    const nom = String(req.body?.nom || "").trim().slice(0, 100);
    if (!nom) throw new ApiError(400, "Nom de la matière obligatoire");
    const ex = await db.query("SELECT id, name FROM subjects WHERE school_id = $1 AND lower(name) = lower($2)", [ecole, nom]);
    if (ex.rows[0]) return res.json({ success: true, data: ex.rows[0] });
    const { rows } = await db.query(
      "INSERT INTO subjects (name, code, school_id, is_active) VALUES ($1, $2, $3, true) RETURNING id, name",
      [nom, `${ecole}-${slug(nom)}-${Date.now().toString(36).slice(-4)}`, ecole]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) {
    next(e);
  }
});

// Affectations de l'annee : quel enseignant, quelle matiere, quelle classe
router.get("/affectations", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    const annee = await assurerAnneeScolaire(ecole);
    const { rows } = await db.query(
      `SELECT cs.id, cs.teacher_id, cs.class_id, cs.subject_id, c.name AS classe, s.name AS matiere
       FROM class_subjects cs JOIN classes c ON c.id = cs.class_id JOIN subjects s ON s.id = cs.subject_id
       WHERE cs.academic_year_id = $1 AND cs.teacher_id IS NOT NULL
       ORDER BY s.name, c.name`,
      [annee.id]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

// POST { teacherId, subjectId, classIds: [] }
router.post("/affectations", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    const annee = await assurerAnneeScolaire(ecole);
    const teacherId = parseInt(req.body?.teacherId, 10);
    const subjectId = parseInt(req.body?.subjectId, 10);
    const classIds = (Array.isArray(req.body?.classIds) ? req.body.classIds : []).map((x) => parseInt(x, 10)).filter(Boolean);
    const prof = await db.query("SELECT 1 FROM users WHERE id = $1 AND school_id = $2 AND role = 'teacher' AND status = 'active'", [teacherId, ecole]);
    if (!prof.rows[0]) throw new ApiError(404, "Enseignant introuvable");
    const mat = await db.query("SELECT 1 FROM subjects WHERE id = $1 AND school_id = $2", [subjectId, ecole]);
    if (!mat.rows[0]) throw new ApiError(400, "Choisissez une matière");
    if (!classIds.length) throw new ApiError(400, "Choisissez au moins une classe");
    const classes = await db.query("SELECT id FROM classes WHERE id = ANY($1) AND academic_year_id = $2", [classIds, annee.id]);
    for (const { id } of classes.rows) {
      await db.query(
        `INSERT INTO class_subjects (class_id, subject_id, teacher_id, academic_year_id, is_active)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (class_id, subject_id, academic_year_id) DO UPDATE SET teacher_id = EXCLUDED.teacher_id, is_active = true`,
        [id, subjectId, teacherId, annee.id]
      );
    }
    res.status(201).json({ success: true, data: { affectees: classes.rows.length } });
  } catch (e) {
    next(e);
  }
});

router.delete("/affectations/:id", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    const annee = await assurerAnneeScolaire(ecole);
    const r = await db.query("UPDATE class_subjects SET teacher_id = NULL WHERE id = $1 AND academic_year_id = $2", [
      parseInt(req.params.id, 10),
      annee.id,
    ]);
    if (!r.rowCount) throw new ApiError(404, "Affectation introuvable");
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// Classes de l'annee en cours (pour les listes de choix)
router.get("/classes", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    const annee = await assurerAnneeScolaire(ecole);
    const { rows } = await db.query(
      `SELECT c.id, c.name,
         (SELECT COUNT(*)::int FROM class_students cs WHERE cs.class_id = c.id AND cs.status = 'active') AS eleves
       FROM classes c WHERE c.academic_year_id = $1 ORDER BY c.name`,
      [annee.id]
    );
    const t = await db.query("SELECT type FROM schools WHERE id = $1", [ecole]);
    res.json({ success: true, data: rows, annee, meta: { annee, type: t.rows[0]?.type || null } });
  } catch (e) {
    next(e);
  }
});

// POST /classes { noms: ["6e A", "6e B", ...] } : creation rapide de plusieurs classes
router.post("/classes", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    const annee = await assurerAnneeScolaire(ecole);
    const noms = (Array.isArray(req.body?.noms) ? req.body.noms : String(req.body?.noms || "").split(","))
      .map((n) => String(n).trim())
      .filter(Boolean)
      .slice(0, 60);
    if (!noms.length) throw new ApiError(400, "Indiquez au moins une classe");
    for (const n of noms) await classeParNom(annee.id, n);
    res.status(201).json({ success: true, data: { creees: noms.length } });
  } catch (e) {
    next(e);
  }
});

// Detail d'une classe : eleves et enseignants par matiere
router.get("/classes/:id", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    const id = parseInt(req.params.id, 10);
    const c = await db.query(
      `SELECT c.id, c.name, ay.name AS annee, c.class_teacher_id,
              pp.first_name AS pp_prenom, pp.last_name AS pp_nom, pp.phone AS pp_tel
       FROM classes c JOIN academic_years ay ON ay.id = c.academic_year_id
       LEFT JOIN users pp ON pp.id = c.class_teacher_id
       WHERE c.id = $1 AND ay.school_id = $2`,
      [id, ecole]
    );
    if (!c.rows[0]) throw new ApiError(404, "Classe introuvable");
    const eleves = await db.query(
      `SELECT u.id, u.first_name, u.last_name, sr.gender, sr.date_of_birth, sr.admission_number,
              (u.email NOT LIKE '%@inscrit.school') AS a_un_compte,
              (SELECT COUNT(*)::int FROM parent_student_links p WHERE p.student_id = u.id) AS parents
       FROM class_students cs JOIN users u ON u.id = cs.student_id
       LEFT JOIN student_records sr ON sr.student_id = u.id
       WHERE cs.class_id = $1 AND cs.status = 'active'
       ORDER BY u.last_name, u.first_name`,
      [id]
    );
    const profs = await db.query(
      `SELECT cs.id, s.name AS matiere, u.first_name, u.last_name, u.phone
       FROM class_subjects cs JOIN subjects s ON s.id = cs.subject_id JOIN users u ON u.id = cs.teacher_id
       WHERE cs.class_id = $1 AND cs.teacher_id IS NOT NULL ORDER BY s.name`,
      [id]
    );
    res.json({ success: true, data: { classe: c.rows[0], eleves: eleves.rows, enseignants: profs.rows } });
  } catch (e) {
    next(e);
  }
});

// Professeur principal d'une classe (gere coefficients et bulletins)
router.put("/classes/:id/professeur-principal", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    const id = parseInt(req.params.id, 10);
    const teacherId = req.body?.teacherId ? parseInt(req.body.teacherId, 10) : null;
    if (teacherId) {
      const t = await db.query("SELECT 1 FROM users WHERE id = $1 AND school_id = $2 AND role = 'teacher' AND status = 'active'", [teacherId, ecole]);
      if (!t.rows[0]) throw new ApiError(400, "Enseignant introuvable");
    }
    const r = await db.query(
      `UPDATE classes c SET class_teacher_id = $3 FROM academic_years ay
       WHERE c.id = $1 AND ay.id = c.academic_year_id AND ay.school_id = $2`,
      [id, ecole, teacherId]
    );
    if (!r.rowCount) throw new ApiError(404, "Classe introuvable");
    if (teacherId) {
      const c = await db.query("SELECT name FROM classes WHERE id = $1", [id]);
      await notifierUtilisateur(teacherId, {
        title: "Professeur principal",
        message: `Vous êtes professeur principal de la ${c.rows[0].name}.`,
        type: "account",
        data: { lien: `/classes/${id}/notes` },
      }).catch(() => {});
    }
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// Fiche d'un eleve
router.get("/eleves/:id", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    const id = parseInt(req.params.id, 10);
    const e = await db.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.created_at,
              (u.email NOT LIKE '%@inscrit.school') AS a_un_compte,
              sr.admission_number, sr.date_of_birth, sr.gender, sr.declared_class,
              (SELECT c.name FROM class_students cs JOIN classes c ON c.id = cs.class_id
                WHERE cs.student_id = u.id AND cs.status = 'active' ORDER BY cs.enrolled_at DESC LIMIT 1) AS classe
       FROM users u LEFT JOIN student_records sr ON sr.student_id = u.id
       WHERE u.id = $1 AND u.school_id = $2 AND u.role = 'student'`,
      [id, ecole]
    );
    if (!e.rows[0]) throw new ApiError(404, "Élève introuvable");
    const parents = await db.query(
      `SELECT u.id, u.first_name, u.last_name, u.phone, u.email, l.relationship
       FROM parent_student_links l JOIN users u ON u.id = l.parent_id WHERE l.student_id = $1`,
      [id]
    );
    res.json({ success: true, data: { ...e.rows[0], email: e.rows[0].a_un_compte ? e.rows[0].email : null, parents: parents.rows } });
  } catch (err) {
    next(err);
  }
});

// Photo de l'etablissement (image redimensionnee par le telephone, en data URL)
router.put("/photo", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    const photo = String((req.body || {}).photo || "");
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(photo)) throw new ApiError(400, "Image invalide");
    if (photo.length > 600000) throw new ApiError(400, "Image trop lourde");
    await db.query("UPDATE schools SET photo = $2, updated_at = NOW() WHERE id = $1", [ecole, photo]);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
