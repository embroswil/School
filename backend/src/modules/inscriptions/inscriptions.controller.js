// modules/inscriptions/inscriptions.controller.js
const bcrypt = require("bcryptjs");
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { ecoleFiltre } = require("../../utils/contexte");
const { notifierEtablissement } = require("../../utils/notifier");
const { assurerAnneeScolaire } = require("../../utils/annees");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ["parent", "student", "teacher"];
const texte = (v, max = 100) => (v === undefined || v === null ? "" : String(v).trim().slice(0, max));
const parseId = (v) => {
  const id = parseInt(v, 10);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Identifiant invalide");
  return id;
};
const date = (v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null);

// Relie un parent a un eleve du meme etablissement, si le prenom et le nom concordent
const relierSiPossible = async (q, { parentRequestId, parentId, schoolId, prenom, nom }) => {
  const { rows } = await q(
    `SELECT id FROM users
     WHERE role = 'student' AND school_id = $1
       AND lower(trim(first_name)) = lower(trim($2)) AND lower(trim(last_name)) = lower(trim($3))
     ORDER BY id LIMIT 2`,
    [schoolId, prenom, nom]
  );
  if (rows.length !== 1) return null; // aucun ou plusieurs homonymes : rien d'automatique
  const studentId = rows[0].id;
  await q(
    `INSERT INTO parent_student_links (parent_id, student_id, relationship, is_primary)
     SELECT $1, $2, 'parent', true
     WHERE NOT EXISTS (SELECT 1 FROM parent_student_links WHERE parent_id = $1 AND student_id = $2)`,
    [parentId, studentId]
  );
  await q(`UPDATE parent_requests SET status = 'approved', student_id = $2, decided_at = NOW() WHERE id = $1`, [
    parentRequestId,
    studentId,
  ]);
  return studentId;
};

// POST /api/inscriptions
// { role: parent|student|teacher, schoolId, firstName, lastName, email, phone, password,
//   enfants: [{ prenom, nom, classe, dateNaissance }]          (parent)
//   classe, dateNaissance                                       (eleve)
//   matieres, diplome, experience, message                      (enseignant) }
const inscription = async (req, res, next) => {
  const client = await db.connect();
  const q = client.query.bind(client);
  try {
    const b = req.body || {};
    const role = ROLES.includes(b.role) ? b.role : null;
    if (!role) throw new ApiError(400, "Choisissez votre profil : parent, élève ou enseignant");
    const schoolId = parseId(b.schoolId);
    const email = texte(b.email, 255).toLowerCase();
    const prenom = texte(b.firstName);
    const nom = texte(b.lastName);
    if (!prenom || !nom) throw new ApiError(400, "Votre prénom et votre nom sont obligatoires");
    if (!EMAIL_RE.test(email)) throw new ApiError(400, "Adresse email invalide");
    if (typeof b.password !== "string" || b.password.length < 8 || b.password.length > 72) {
      throw new ApiError(400, "Mot de passe : 8 caractères minimum");
    }
    const ecole = await q("SELECT id, name FROM schools WHERE id = $1 AND is_active = true", [schoolId]);
    if (!ecole.rows[0]) throw new ApiError(404, "Établissement introuvable");
    if ((await q("SELECT 1 FROM users WHERE email = $1", [email])).rows[0]) {
      throw new ApiError(409, "Un compte existe déjà avec cet email");
    }
    // Enseignant : ses matieres et ses classes, choisies dans celles de l'etablissement
    let matieresChoisies = [];
    let classesChoisies = [];
    if (role === "teacher") {
      const ids = (v) => (Array.isArray(v) ? v.map((x) => parseInt(x, 10)).filter((x) => x > 0) : []);
      matieresChoisies = (
        await q("SELECT id, name FROM subjects WHERE id = ANY($1) AND school_id = $2 ORDER BY name", [ids(b.matiereIds), schoolId])
      ).rows;
      if (!matieresChoisies.length) throw new ApiError(400, "Choisissez la ou les matières que vous enseignez");
      const annee = await assurerAnneeScolaire(schoolId);
      classesChoisies = (
        await q("SELECT id, name FROM classes WHERE id = ANY($1) AND academic_year_id = $2 ORDER BY name", [ids(b.classeIds), annee.id])
      ).rows;
      const nbClasses = (await q("SELECT COUNT(*)::int AS n FROM classes WHERE academic_year_id = $1", [annee.id])).rows[0].n;
      if (nbClasses > 0 && !classesChoisies.length) throw new ApiError(400, "Choisissez les classes dans lesquelles vous enseignez");
    }
    if (role === "student" && !texte(b.classe)) throw new ApiError(400, "Indiquez votre classe");

    await q("BEGIN");
    const statut = role === "teacher" ? "pending" : "active";
    const hash = await bcrypt.hash(b.password, 10);
    // Eleve deja importe par l'etablissement (meme prenom et nom) : il reprend sa fiche
    const importe =
      role === "student"
        ? (
            await q(
              `SELECT id FROM users WHERE school_id = $1 AND role = 'student' AND email LIKE '%@inscrit.school'
                 AND lower(trim(first_name)) = lower($2) AND lower(trim(last_name)) = lower($3) LIMIT 1`,
              [schoolId, prenom, nom]
            )
          ).rows[0]
        : null;
    let userId;
    if (importe) {
      await q(`UPDATE users SET email = $2, password_hash = $3, phone = $4, updated_at = NOW() WHERE id = $1`, [
        importe.id,
        email,
        hash,
        texte(b.phone, 30) || null,
      ]);
      userId = importe.id;
    } else {
      const u = await q(
        `INSERT INTO users (email, password_hash, role, first_name, last_name, phone, school_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [email, hash, role, prenom, nom, texte(b.phone, 30) || null, schoolId, statut]
      );
      userId = u.rows[0].id;
    }
    const enfantsRelies = [];

    if (role === "student") {
      await q(
        `INSERT INTO student_records (student_id, admission_number, date_of_birth, declared_class)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (student_id) DO UPDATE SET date_of_birth = COALESCE(EXCLUDED.date_of_birth, student_records.date_of_birth)`,
        [userId, `ELV-${schoolId}-${userId}`, date(b.dateNaissance), texte(b.classe)]
      );
      // Parents deja inscrits qui ont declare cet enfant : on les relie
      const attente = await q(
        `SELECT id, parent_id FROM parent_requests
         WHERE status = 'pending' AND school_id = $1
           AND lower(trim(child_first_name)) = lower(trim($2)) AND lower(trim(child_last_name)) = lower(trim($3))`,
        [schoolId, prenom, nom]
      );
      for (const d of attente.rows) {
        await q(
          `INSERT INTO parent_student_links (parent_id, student_id, relationship, is_primary)
           SELECT $1, $2, 'parent', true
           WHERE NOT EXISTS (SELECT 1 FROM parent_student_links WHERE parent_id = $1 AND student_id = $2)`,
          [d.parent_id, userId]
        );
        await q(`UPDATE parent_requests SET status = 'approved', student_id = $2, decided_at = NOW() WHERE id = $1`, [d.id, userId]);
      }
    }

    if (role === "parent") {
      const enfants = Array.isArray(b.enfants) ? b.enfants.slice(0, 10) : [];
      for (const e of enfants) {
        if (!texte(e.prenom) || !texte(e.nom)) continue;
        const d = await q(
          `INSERT INTO parent_requests (school_id, parent_id, child_first_name, child_last_name, child_class, child_birth_date)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [schoolId, userId, texte(e.prenom), texte(e.nom), texte(e.classe) || null, date(e.dateNaissance)]
        );
        const relie = await relierSiPossible(q, {
          parentRequestId: d.rows[0].id,
          parentId: userId,
          schoolId,
          prenom: texte(e.prenom),
          nom: texte(e.nom),
        });
        if (relie) enfantsRelies.push(`${texte(e.prenom)} ${texte(e.nom)}`);
      }
    }

    if (role === "teacher") {
      await q(
        `INSERT INTO teacher_requests (school_id, user_id, subjects, subject_ids, class_ids)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          schoolId,
          userId,
          matieresChoisies.map((m) => m.name).join(", ").slice(0, 1000),
          matieresChoisies.map((m) => m.id),
          classesChoisies.map((c) => c.id),
        ]
      );
    }
    await q("COMMIT");

    if (role === "teacher") {
      await notifierEtablissement(schoolId, {
        title: "Nouvel enseignant à valider",
        message: `${prenom} ${nom} (${matieresChoisies.map((m) => m.name).join(", ")}) a créé un compte enseignant.`,
        type: "account",
        priority: "high",
        data: { lien: "/enseignants" },
      }).catch(() => {});
    }

    res.status(201).json({
      success: true,
      message:
        role === "teacher"
          ? `Compte créé. ${ecole.rows[0].name} doit valider votre compte enseignant avant votre première connexion.`
          : "Compte créé. Vous pouvez vous connecter.",
      data: { role, enAttente: role === "teacher", enfantsRelies },
    });
  } catch (e) {
    try {
      await q("ROLLBACK");
    } catch (_) {}
    next(e);
  } finally {
    client.release();
  }
};

// GET /api/inscriptions/enseignants?status=pending
const listeEnseignants = async (req, res, next) => {
  try {
    const params = [];
    const where = [];
    const ecole = ecoleFiltre();
    if (ecole) {
      params.push(ecole);
      where.push(`tr.school_id = $${params.length}`);
    }
    const statut = ["pending", "approved", "rejected"].includes(req.query.status) ? req.query.status : "pending";
    params.push(statut);
    where.push(`tr.status = $${params.length}`);
    const { rows } = await db.query(
      `SELECT tr.id, tr.subjects, tr.qualification, tr.experience, tr.message, tr.status, tr.created_at,
              (SELECT string_agg(c.name, ', ' ORDER BY c.name) FROM classes c WHERE c.id = ANY(tr.class_ids)) AS classes,
              tr.decision_reason, u.id AS user_id, u.email, u.first_name, u.last_name, u.phone, s.name AS school_name
       FROM teacher_requests tr
       JOIN users u ON u.id = tr.user_id
       JOIN schools s ON s.id = tr.school_id
       WHERE ${where.join(" AND ")}
       ORDER BY tr.created_at DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
};

const chargerDemande = async (id) => {
  const { rows } = await db.query("SELECT * FROM teacher_requests WHERE id = $1", [id]);
  const d = rows[0];
  const ecole = ecoleFiltre();
  if (!d || (ecole && d.school_id !== ecole)) throw new ApiError(404, "Demande introuvable");
  if (d.status !== "pending") throw new ApiError(400, "Cette demande a déjà été traitée");
  return d;
};

const validerEnseignant = async (req, res, next) => {
  try {
    const d = await chargerDemande(parseId(req.params.id));
    await db.query("UPDATE users SET status = 'active', updated_at = NOW() WHERE id = $1", [d.user_id]);
    // Affectations choisies par l'enseignant : chaque matiere dans chaque classe
    // (sans retirer un collegue deja affecte a la meme matiere dans la meme classe)
    if (d.subject_ids?.length && d.class_ids?.length) {
      await db.query(
        `INSERT INTO class_subjects (class_id, subject_id, teacher_id, academic_year_id, is_active)
         SELECT c.id, s.id, $3, c.academic_year_id, true
         FROM classes c CROSS JOIN subjects s
         WHERE c.id = ANY($1) AND s.id = ANY($2)
         ON CONFLICT (class_id, subject_id, academic_year_id)
         DO UPDATE SET teacher_id = COALESCE(class_subjects.teacher_id, EXCLUDED.teacher_id), is_active = true`,
        [d.class_ids, d.subject_ids, d.user_id]
      );
    }
    await db.query(`UPDATE teacher_requests SET status = 'approved', decided_by = $2, decided_at = NOW() WHERE id = $1`, [
      d.id,
      req.user.id,
    ]);
    res.json({ success: true, message: "Enseignant validé" });
  } catch (e) {
    next(e);
  }
};

const refuserEnseignant = async (req, res, next) => {
  try {
    const d = await chargerDemande(parseId(req.params.id));
    const motif = texte((req.body || {}).motif, 500) || null;
    await db.query("UPDATE users SET status = 'rejected', updated_at = NOW() WHERE id = $1", [d.user_id]);
    await db.query(
      `UPDATE teacher_requests SET status = 'rejected', decision_reason = $2, decided_by = $3, decided_at = NOW() WHERE id = $1`,
      [d.id, motif, req.user.id]
    );
    res.json({ success: true, message: "Demande refusée" });
  } catch (e) {
    next(e);
  }
};

// GET /api/inscriptions/mes-enfants (parent)
const mesEnfants = async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT pr.id, pr.child_first_name, pr.child_last_name, pr.child_class, pr.status, pr.student_id
       FROM parent_requests pr WHERE pr.parent_id = $1 ORDER BY pr.created_at`,
      [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
};

module.exports = { inscription, listeEnseignants, validerEnseignant, refuserEnseignant, mesEnfants };
