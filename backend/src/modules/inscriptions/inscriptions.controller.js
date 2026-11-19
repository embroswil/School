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
const LIENS = ["pere", "mere", "tuteur", "oncle_tante", "grand_parent", "frere_soeur", "parent", "autre"];
const relierSiPossible = async (q, { parentRequestId, parentId, schoolId, prenom, nom, lien = "parent" }) => {
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
     SELECT $1, $2, $3::varchar, $3::varchar IN ('pere', 'mere', 'parent', 'tuteur')
     WHERE NOT EXISTS (SELECT 1 FROM parent_student_links WHERE parent_id = $1 AND student_id = $2)`,
    [parentId, studentId, lien]
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
    // Le parent et l'enseignant s'inscrivent sans etablissement : le parent retrouve ses enfants une fois
    // connecte, l'enseignant rejoint son ou ses etablissements une fois connecte
    const schoolId = role === "student" ? parseId(b.schoolId) : null;
    const WA = require("../../utils/whatsapp");
    let email = texte(b.email, 255).toLowerCase();
    const prenom = texte(b.firstName);
    const nom = texte(b.lastName);
    if (!prenom || !nom) throw new ApiError(400, "Votre prénom et votre nom sont obligatoires");
    // Parent sans email : il s'inscrit avec son numero WhatsApp (adresse technique interne)
    const tel = WA.normaliserTel(b.phone);
    if (!email && role === "parent" && WA.configure()) {
      if (!tel) throw new ApiError(400, "Indiquez votre numéro WhatsApp (ou une adresse email)");
      const pris = await q(
        "SELECT 1 FROM users WHERE right(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g'), 9) = right($1, 9) AND email NOT LIKE '%@inscrit.school' LIMIT 1",
        [tel]
      );
      if (pris.rows[0]) throw new ApiError(409, "Un compte existe déjà avec ce numéro : connectez-vous, ou utilisez « Mot de passe oublié »");
      email = `t${tel}@tel.school`;
    }
    if (!EMAIL_RE.test(email)) throw new ApiError(400, "Adresse email invalide");
    if (typeof b.password !== "string" || b.password.length < 8 || b.password.length > 72) {
      throw new ApiError(400, "Mot de passe : 8 caractères minimum");
    }
    // Seul l'eleve choisit son etablissement a l'inscription
    if (role === "student") {
      const ecole = await q("SELECT id FROM schools WHERE id = $1 AND is_active = true", [schoolId]);
      if (!ecole.rows[0]) throw new ApiError(404, "Établissement introuvable");
    }
    if ((await q("SELECT 1 FROM users WHERE email = $1", [email])).rows[0]) {
      throw new ApiError(409, "Un compte existe déjà avec cette adresse e-mail : connectez-vous, ou utilisez « Mot de passe oublié ».");
    }
    if (role === "student" && !texte(b.classe)) throw new ApiError(400, "Indiquez votre classe");

    await q("BEGIN");
    const statut = "active";
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
        `SELECT id, parent_id, COALESCE(relationship, 'parent') AS lien FROM parent_requests
         WHERE status = 'pending' AND school_id = $1
           AND lower(trim(child_first_name)) = lower(trim($2)) AND lower(trim(child_last_name)) = lower(trim($3))`,
        [schoolId, prenom, nom]
      );
      for (const d of attente.rows) {
        await q(
          `INSERT INTO parent_student_links (parent_id, student_id, relationship, is_primary)
           SELECT $1, $2, $3::varchar, $3::varchar IN ('pere', 'mere', 'parent', 'tuteur')
           WHERE NOT EXISTS (SELECT 1 FROM parent_student_links WHERE parent_id = $1 AND student_id = $2)`,
          [d.parent_id, userId, d.lien]
        );
        await q(`UPDATE parent_requests SET status = 'approved', student_id = $2, decided_at = NOW() WHERE id = $1`, [d.id, userId]);
      }
    }

    if (role === "parent" && schoolId) {
      const enfants = Array.isArray(b.enfants) ? b.enfants.slice(0, 10) : [];
      for (const e of enfants) {
        if (!texte(e.prenom) || !texte(e.nom)) continue;
        const lien = LIENS.includes(e.lien) ? e.lien : "parent";
        const d = await q(
          `INSERT INTO parent_requests (school_id, parent_id, child_first_name, child_last_name, child_class, child_birth_date, relationship)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [schoolId, userId, texte(e.prenom), texte(e.nom), texte(e.classe) || null, date(e.dateNaissance), lien]
        );
        const relie = await relierSiPossible(q, {
          parentRequestId: d.rows[0].id,
          parentId: userId,
          schoolId,
          prenom: texte(e.prenom),
          nom: texte(e.nom),
          lien,
        });
        if (relie) enfantsRelies.push(`${texte(e.prenom)} ${texte(e.nom)}`);
      }
    }

    await q("COMMIT");

    // Code de verification de l'adresse email
    let codeEnvoye = false;
    let envoi = null;
    try {
      const { envoyerCode } = require("../codes/routes");
      envoi = await envoyerCode({ id: userId, email, phone: texte(b.phone, 30) || null, first_name: prenom }, "verification");
      codeEnvoye = true;
    } catch (_) {
      // l'inscription reste valable ; un nouveau code pourra etre demande
    }

    res.status(201).json({
      success: true,
      message: "Compte créé. Confirmez votre adresse e-mail avec le code reçu.",
      data: { role, enfantsRelies, codeEnvoye, canal: envoi?.canal || null, destination: envoi?.destination || null, identifiant: email.endsWith("@tel.school") ? texte(b.phone, 30) : email },
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
    // L'enseignant inscrit sans etablissement est rattache a celui qui le valide
    await db.query("UPDATE users SET status = 'active', school_id = COALESCE(school_id, $2), updated_at = NOW() WHERE id = $1", [d.user_id, d.school_id]);
    // membre de l'etablissement qui le valide (en plus de ses autres etablissements)
    await db.query("INSERT INTO enseignant_ecoles (user_id, school_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [d.user_id, d.school_id]);
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
    // Un enseignant inscrit sans etablissement garde son compte (il peut rejoindre un autre etablissement)
    await db.query("UPDATE users SET status = 'rejected', updated_at = NOW() WHERE id = $1 AND school_id = $2", [d.user_id, d.school_id]);
    await db.query(
      `UPDATE teacher_requests SET status = 'rejected', decision_reason = $2, decided_by = $3, decided_at = NOW() WHERE id = $1`,
      [d.id, motif, req.user.id]
    );
    res.json({ success: true, message: "Demande refusée" });
  } catch (e) {
    next(e);
  }
};

// Enseignant : rejoindre un etablissement une fois connecte (choix des matieres et des classes).
// Si son nom figure dans la liste des enseignants fournie par l'etablissement, il est accepte tout de suite ;
// sinon l'etablissement valide la demande.
// GET /api/inscriptions/mes-etablissements
// { membres: etablissements ou il est accepte (ouvert = celui de la session), demandes en attente ou refusees,
//   declares: etablissements pas encore sur Sukul }
const mesEtablissements = async (req, res, next) => {
  try {
    const moi = (await db.query("SELECT school_id FROM users WHERE id = $1", [req.user.id])).rows[0];
    const membres = (
      await db.query(
        `SELECT s.id AS school_id, s.name AS ecole, s.city, s.type FROM enseignant_ecoles ee JOIN schools s ON s.id = ee.school_id
         WHERE ee.user_id = $1 ORDER BY ee.created_at`,
        [req.user.id]
      )
    ).rows.map((m) => ({ ...m, ouvert: m.school_id === moi?.school_id }));
    const demandes = (
      await db.query(
        `SELECT DISTINCT ON (tr.school_id) tr.id, tr.status, tr.created_at, tr.decision_reason, s.id AS school_id, s.name AS ecole, s.city
         FROM teacher_requests tr JOIN schools s ON s.id = tr.school_id
         WHERE tr.user_id = $1 AND tr.status <> 'approved'
           AND tr.school_id NOT IN (SELECT school_id FROM enseignant_ecoles WHERE user_id = $1)
         ORDER BY tr.school_id, tr.created_at DESC`,
        [req.user.id]
      )
    ).rows;
    const declares = (
      await db.query("SELECT id, nom, ville, type FROM etablissements_declares WHERE user_id = $1 AND school_id IS NULL ORDER BY created_at", [req.user.id])
    ).rows;
    res.json({ success: true, data: { membres, demandes, declares } });
  } catch (e) {
    next(e);
  }
};

// POST /api/inscriptions/declarer { nom, ville, type } : etablissement pas encore sur Sukul
const declarer = async (req, res, next) => {
  try {
    const b = req.body || {};
    const nom = texte(b.nom, 255);
    if (!nom) throw new ApiError(400, "Indiquez le nom de l’établissement");
    const n = (await db.query("SELECT COUNT(*)::int AS n FROM etablissements_declares WHERE user_id = $1", [req.user.id])).rows[0].n;
    if (n >= 10) throw new ApiError(400, "Vous avez déjà déclaré 10 établissements");
    const { rows } = await db.query(
      "INSERT INTO etablissements_declares (user_id, nom, ville, type) VALUES ($1, $2, $3, $4) RETURNING id, nom, ville, type",
      [req.user.id, nom, texte(b.ville, 120) || null, ["maternelle", "primaire", "college", "lycee"].includes(b.type) ? b.type : null]
    );
    res.status(201).json({ success: true, data: rows[0], message: "Établissement ajouté" });
  } catch (e) {
    next(e);
  }
};

// DELETE /api/inscriptions/declares/:id
const retirerDeclare = async (req, res, next) => {
  try {
    await db.query("DELETE FROM etablissements_declares WHERE id = $1 AND user_id = $2", [parseId(req.params.id), req.user.id]);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
};

// Enseignant : quitter un etablissement (il reste membre des autres)
// DELETE /api/inscriptions/mes-etablissements/:schoolId
const quitter = async (req, res, next) => {
  try {
    const ecole = parseId(req.params.schoolId);
    await require("../../utils/membres").retirerDeLEcole(req.user.id, ecole);
    res.json({ success: true, message: "Vous ne faites plus partie de cet établissement" });
  } catch (e) {
    next(e);
  }
};

// POST /api/inscriptions/rejoindre { schoolId, matiereIds, classeIds }
const rejoindre = async (req, res, next) => {
  try {
    const b = req.body || {};
    const schoolId = parseId(b.schoolId);
    const ecole = (await db.query("SELECT id, name FROM schools WHERE id = $1 AND is_active = true", [schoolId])).rows[0];
    if (!ecole) throw new ApiError(404, "Établissement introuvable");
    const moi = (await db.query("SELECT id, first_name, last_name, school_id FROM users WHERE id = $1", [req.user.id])).rows[0];
    if (await require("../../utils/membres").estMembre(req.user.id, schoolId)) throw new ApiError(400, "Vous faites déjà partie de cet établissement");
    const deja = await db.query("SELECT 1 FROM teacher_requests WHERE user_id = $1 AND school_id = $2 AND status = 'pending'", [req.user.id, schoolId]);
    if (deja.rows[0]) throw new ApiError(409, "Votre demande est déjà en attente auprès de cet établissement");
    const ids = (v) => (Array.isArray(v) ? v.map((x) => parseInt(x, 10)).filter((x) => x > 0) : []);
    const matieres = (await db.query("SELECT id, name FROM subjects WHERE id = ANY($1) AND school_id = $2 ORDER BY name", [ids(b.matiereIds), schoolId])).rows;
    if (!matieres.length) throw new ApiError(400, "Choisissez la ou les matières que vous enseignez");
    const annee = await assurerAnneeScolaire(schoolId);
    const classes = (await db.query("SELECT id, name FROM classes WHERE id = ANY($1) AND academic_year_id = $2 ORDER BY name", [ids(b.classeIds), annee.id])).rows;
    const nbClasses = (await db.query("SELECT COUNT(*)::int AS n FROM classes WHERE academic_year_id = $1", [annee.id])).rows[0].n;
    if (nbClasses > 0 && !classes.length) throw new ApiError(400, "Choisissez les classes dans lesquelles vous enseignez");
    await db.query(
      `INSERT INTO teacher_requests (school_id, user_id, subjects, subject_ids, class_ids) VALUES ($1, $2, $3, $4, $5)`,
      [schoolId, req.user.id, matieres.map((m) => m.name).join(", ").slice(0, 1000), matieres.map((m) => m.id), classes.map((c) => c.id)]
    );
    let reconnu = false;
    try {
      reconnu = Boolean(await require("../../utils/enseignants-attendus").reconnaitre(schoolId, req.user.id, moi.last_name, moi.first_name));
    } catch (_) {
      reconnu = false;
    }
    if (!reconnu) {
      await notifierEtablissement(schoolId, {
        title: "Nouvel enseignant à valider",
        message: `${moi.first_name} ${moi.last_name} (${matieres.map((m) => m.name).join(", ")}) souhaite rejoindre l’établissement.`,
        type: "account",
        priority: "high",
        data: { lien: "/enseignants" },
      }).catch(() => {});
    }
    res.status(201).json({
      success: true,
      data: { reconnu },
      message: reconnu
        ? `Vous figurez dans la liste de ${ecole.name} : vous êtes accepté et vos classes sont affectées.`
        : `Demande envoyée à ${ecole.name}. Vous serez prévenu dès sa validation.`,
    });
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

module.exports = { inscription, listeEnseignants, validerEnseignant, refuserEnseignant, mesEnfants, mesEtablissements, rejoindre, declarer, retirerDeclare, quitter };
