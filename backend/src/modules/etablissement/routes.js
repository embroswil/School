// modules/etablissement/routes.js
// Espace de l'administrateur d'un etablissement : tableau de bord, eleves,
// enseignants. Tout est limite a SON etablissement.
const express = require("express");
const router = express.Router();
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { authenticate, authorize } = require("../../middlewares/auth.middleware");
const { assurerAnneeScolaire } = require("../../utils/annees");
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
      `SELECT u.id, u.first_name, u.last_name, u.email, sr.declared_class, sr.date_of_birth,
              c.id AS class_id, c.name AS class_name,
              (SELECT COUNT(*)::int FROM parent_student_links p WHERE p.student_id = u.id) AS parents
       FROM users u
       LEFT JOIN student_records sr ON sr.student_id = u.id
       LEFT JOIN class_students cs ON cs.student_id = u.id AND cs.status = 'active' AND cs.academic_year_id = $2
       LEFT JOIN classes c ON c.id = cs.class_id
       WHERE u.school_id = $1 AND u.role = 'student'
         AND ($3 = '' OR (u.first_name || ' ' || u.last_name) ILIKE '%' || $3 || '%')
       ORDER BY c.name NULLS FIRST, u.last_name, u.first_name
       LIMIT 300`,
      [ecole, annee?.id || null, q]
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
              (SELECT tr.subjects FROM teacher_requests tr WHERE tr.user_id = u.id ORDER BY tr.id DESC LIMIT 1) AS matieres
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
router.post("/import-eleves", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    const annee = await assurerAnneeScolaire(ecole);
    const liste = Array.isArray(req.body?.eleves) ? req.body.eleves.slice(0, 2000) : [];
    if (!liste.length) throw new ApiError(400, "Aucun élève à importer");
    const defaut = String(req.body?.classeParDefaut || "").trim();
    let crees = 0;
    let existants = 0;
    let places = 0;
    const erreurs = [];
    const motDePasse = await bcrypt.hash(crypto.randomBytes(18).toString("hex"), 8);

    for (const [i, e] of liste.entries()) {
      try {
        const nom = String(e.nom || "").trim().slice(0, 100);
        const prenom = String(e.prenom || "").trim().slice(0, 100) || "-";
        if (!nom) continue;
        const classe = String(e.classe || defaut).trim();
        let eleve = (
          await db.query(
            `SELECT id FROM users WHERE school_id = $1 AND role = 'student'
               AND lower(trim(last_name)) = lower($2) AND lower(trim(first_name)) = lower($3) LIMIT 1`,
            [ecole, nom, prenom]
          )
        ).rows[0];
        if (eleve) existants++;
        else {
          const email = `eleve.${ecole}.${crypto.randomBytes(6).toString("hex")}@${DOMAINE_IMPORT}`;
          eleve = (
            await db.query(
              `INSERT INTO users (email, password_hash, role, first_name, last_name, school_id, status)
               VALUES ($1, $2, 'student', $3, $4, $5, 'active') RETURNING id`,
              [email, motDePasse, prenom, nom, ecole]
            )
          ).rows[0];
          crees++;
        }
        const matricule = String(e.matricule || "").trim().slice(0, 50);
        await db.query(
          `INSERT INTO student_records (student_id, admission_number, date_of_birth, gender, declared_class)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (student_id) DO UPDATE SET
             date_of_birth = COALESCE(EXCLUDED.date_of_birth, student_records.date_of_birth),
             gender = COALESCE(EXCLUDED.gender, student_records.gender),
             declared_class = COALESCE(EXCLUDED.declared_class, student_records.declared_class)`,
          [eleve.id, matricule ? `${ecole}-${matricule}` : `ELV-${ecole}-${eleve.id}`, DATE(e.dateNaissance), GENRE(e.sexe), classe || null]
        );
        if (classe && annee) {
          const classId = await classeParNom(annee.id, classe);
          await db.query(
            "UPDATE class_students SET status = 'transferred' WHERE student_id = $1 AND academic_year_id = $2 AND status = 'active' AND class_id <> $3",
            [eleve.id, annee.id, classId]
          );
          await db.query(
            `INSERT INTO class_students (class_id, student_id, academic_year_id, status) VALUES ($1, $2, $3, 'active')
             ON CONFLICT (class_id, student_id, academic_year_id) DO UPDATE SET status = 'active'`,
            [classId, eleve.id, annee.id]
          );
          places++;
        }
      } catch (err) {
        erreurs.push(`Ligne ${i + 1} : ${err.message}`);
      }
    }
    res.json({ success: true, data: { crees, existants, places, erreurs: erreurs.slice(0, 20) } });
  } catch (e) {
    next(e);
  }
});

// POST /api/etablissement/lire-images { images: [dataUrl, ...] }
// Reconnaissance d'ecriture : photos ou scans de listes (imprimees ou ecrites a
// la main) lus par l'IA (API Anthropic), qui renvoie la liste des eleves.
router.post("/lire-images", async (req, res, next) => {
  try {
    ecoleDe(req);
    const cle = process.env.ANTHROPIC_API_KEY;
    if (!cle) throw new ApiError(503, "La lecture des photos n'est pas encore activée (clé ANTHROPIC_API_KEY manquante)");
    const images = Array.isArray(req.body?.images) ? req.body.images.slice(0, 8) : [];
    if (!images.length) throw new ApiError(400, "Aucune image");
    const blocs = [];
    for (const img of images) {
      const m = String(img).match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/);
      if (!m) throw new ApiError(400, "Image invalide");
      blocs.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[3] } });
    }
    blocs.push({
      type: "text",
      text: `Ces images sont une liste d'élèves d'un établissement scolaire camerounais (imprimée ou écrite à la main, éventuellement sur plusieurs pages).
Extrais TOUS les élèves, dans l'ordre. Pour chacun : nom (nom de famille, souvent en MAJUSCULES), prenom, classe (si indiquée sur la ligne ou en titre de la liste, ex. "6e A", "Tle C"), dateNaissance (format JJ/MM/AAAA si présente), sexe ("M" ou "F" si présent), matricule (si présent).
Ignore les en-têtes, signatures, totaux et cachets. Si un champ est absent ou illisible, mets une chaîne vide.
Réponds UNIQUEMENT avec un JSON valide, sans texte autour : {"classe": "classe du titre ou vide", "eleves": [{"nom":"","prenom":"","classe":"","dateNaissance":"","sexe":"","matricule":""}]}`,
    });
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": cle,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
        max_tokens: 8000,
        messages: [{ role: "user", content: blocs }],
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new ApiError(502, j?.error?.message || "Le service de lecture ne répond pas");
    const texteIA = (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
    let donnees;
    try {
      donnees = JSON.parse(texteIA.replace(/```json|```/g, "").trim());
    } catch {
      throw new ApiError(422, "La liste n'a pas pu être lue. Essayez une photo plus nette, bien éclairée et prise de face.");
    }
    const classeTitre = String(donnees.classe || "").trim();
    const eleves = (Array.isArray(donnees.eleves) ? donnees.eleves : [])
      .map((e) => ({
        nom: String(e.nom || "").trim(),
        prenom: String(e.prenom || "").trim(),
        classe: String(e.classe || classeTitre || "").trim(),
        dateNaissance: String(e.dateNaissance || "").trim(),
        sexe: String(e.sexe || "").trim(),
        matricule: String(e.matricule || "").trim(),
      }))
      .filter((e) => e.nom);
    res.json({ success: true, data: eleves });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------- matieres et affectations

// Matieres courantes au Cameroun, proposees a chaque etablissement
const MATIERES_PAR_DEFAUT = [
  "Mathématiques", "Français", "Anglais", "Histoire", "Géographie", "Éducation civique (ECM)",
  "Sciences de la vie et de la Terre (SVT)", "Physique", "Chimie", "Technologie (PCT)", "Informatique",
  "Philosophie", "Espagnol", "Allemand", "Langues et cultures nationales", "Littérature",
  "Économie", "Éducation physique et sportive (EPS)", "Travail manuel", "Arts plastiques",
];
const slug = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "").toUpperCase().slice(0, 10);

const matieresEcole = async (ecole) => {
  let { rows } = await db.query("SELECT id, name FROM subjects WHERE school_id = $1 AND is_active = true ORDER BY name", [ecole]);
  if (!rows.length) {
    for (const nom of MATIERES_PAR_DEFAUT) {
      await db.query(
        "INSERT INTO subjects (name, code, school_id, is_active) VALUES ($1, $2, $3, true) ON CONFLICT (code) DO NOTHING",
        [nom, `${ecole}-${slug(nom)}`, ecole]
      );
    }
    ({ rows } = await db.query("SELECT id, name FROM subjects WHERE school_id = $1 AND is_active = true ORDER BY name", [ecole]));
  }
  return rows;
};

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
    res.json({ success: true, data: rows, annee });
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
