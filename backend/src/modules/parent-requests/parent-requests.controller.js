// modules/parent-requests/parent-requests.controller.js
const bcrypt = require("bcryptjs");
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { ecoleFiltre } = require("../../utils/contexte");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const texte = (v, max = 100) => (v === undefined || v === null ? "" : String(v).trim().slice(0, max));
const parseId = (v) => {
  const id = parseInt(v, 10);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Identifiant invalide");
  return id;
};

// POST /api/demandes-parents/inscription (publique)
// { schoolId, firstName, lastName, email, phone, password,
//   enfant: { prenom, nom, classe, dateNaissance, lien } }
const inscription = async (req, res, next) => {
  // Une seule connexion pour la transaction (compte parent + demande)
  const client = await db.connect();
  const q = client.query.bind(client);
  try {
    const b = req.body || {};
    const enfant = b.enfant || {};
    const schoolId = parseId(b.schoolId);
    const email = texte(b.email, 255).toLowerCase();
    const prenom = texte(b.firstName);
    const nom = texte(b.lastName);
    if (!prenom || !nom) throw new ApiError(400, "Votre prénom et votre nom sont obligatoires");
    if (!EMAIL_RE.test(email)) throw new ApiError(400, "Adresse email invalide");
    if (typeof b.password !== "string" || b.password.length < 8 || b.password.length > 72) {
      throw new ApiError(400, "Mot de passe : 8 caractères minimum");
    }
    if (!texte(enfant.prenom) || !texte(enfant.nom)) throw new ApiError(400, "Le prénom et le nom de l'enfant sont obligatoires");
    if (!texte(enfant.classe)) throw new ApiError(400, "Indiquez la classe de l'enfant");

    const ecole = await q("SELECT id FROM schools WHERE id = $1 AND is_active = true", [schoolId]);
    if (!ecole.rows[0]) throw new ApiError(404, "Établissement introuvable");
    const dejaLa = await q("SELECT id FROM users WHERE email = $1", [email]);
    if (dejaLa.rows[0]) throw new ApiError(409, "Un compte existe déjà avec cet email");

    await q("BEGIN");
    const parent = await q(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, phone, school_id, status)
       VALUES ($1, $2, 'parent', $3, $4, $5, $6, 'pending') RETURNING id`,
      [email, await bcrypt.hash(b.password, 10), prenom, nom, texte(b.phone, 30) || null, schoolId]
    );
    const demande = await q(
      `INSERT INTO parent_requests (school_id, parent_id, child_first_name, child_last_name, child_class, child_birth_date, relationship, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        schoolId,
        parent.rows[0].id,
        texte(enfant.prenom),
        texte(enfant.nom),
        texte(enfant.classe),
        enfant.dateNaissance || null,
        texte(enfant.lien, 50) || "parent",
        texte(b.notes, 500) || null,
      ]
    );
    await q("COMMIT");
    res.status(201).json({
      success: true,
      message: "Demande envoyée. L'établissement doit valider votre compte avant votre première connexion.",
      data: { demandeId: demande.rows[0].id },
    });
  } catch (e) {
    try { await q("ROLLBACK"); } catch (_) {}
    next(e);
  } finally {
    client.release();
  }
};

// GET /api/demandes-parents?status=pending
const liste = async (req, res, next) => {
  try {
    const params = [];
    const where = [];
    const ecole = ecoleFiltre();
    if (ecole) {
      params.push(ecole);
      where.push(`pr.school_id = $${params.length}`);
    }
    const statut = ["pending", "approved", "rejected"].includes(req.query.status) ? req.query.status : "pending";
    params.push(statut);
    where.push(`pr.status = $${params.length}`);
    const { rows } = await db.query(
      `SELECT pr.*, u.email AS parent_email, u.first_name AS parent_first_name, u.last_name AS parent_last_name,
              u.phone AS parent_phone, s.name AS school_name,
              st.first_name AS student_first_name, st.last_name AS student_last_name
       FROM parent_requests pr
       JOIN users u ON u.id = pr.parent_id
       JOIN schools s ON s.id = pr.school_id
       LEFT JOIN users st ON st.id = pr.student_id
       WHERE ${where.join(" AND ")}
       ORDER BY pr.created_at DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
};

const chargerDemande = async (id) => {
  const { rows } = await db.query("SELECT * FROM parent_requests WHERE id = $1", [id]);
  const d = rows[0];
  const ecole = ecoleFiltre();
  if (!d || (ecole && d.school_id !== ecole)) throw new ApiError(404, "Demande introuvable");
  if (d.status !== "pending") throw new ApiError(400, "Cette demande a déjà été traitée");
  return d;
};

// POST /api/demandes-parents/:id/valider { studentId }
// Relie le parent a l'eleve (de son etablissement) et active son compte.
const valider = async (req, res, next) => {
  try {
    const d = await chargerDemande(parseId(req.params.id));
    const studentId = parseId((req.body || {}).studentId);
    const eleve = await db.query("SELECT id, school_id FROM users WHERE id = $1 AND role = 'student'", [studentId]);
    if (!eleve.rows[0] || eleve.rows[0].school_id !== d.school_id) {
      throw new ApiError(400, "Choisissez un élève de cet établissement");
    }
    await db.query(
      `INSERT INTO parent_student_links (parent_id, student_id, relationship, is_primary, created_by)
       SELECT $1, $2, $3, true, $4
       WHERE NOT EXISTS (SELECT 1 FROM parent_student_links WHERE parent_id = $1 AND student_id = $2)`,
      [d.parent_id, studentId, d.relationship || "parent", req.user.id]
    );
    await db.query("UPDATE users SET status = 'active', updated_at = NOW() WHERE id = $1", [d.parent_id]);
    await db.query(
      `UPDATE parent_requests SET status = 'approved', student_id = $2, decided_by = $3, decided_at = NOW() WHERE id = $1`,
      [d.id, studentId, req.user.id]
    );
    res.json({ success: true, message: "Parent validé et relié à l'élève" });
  } catch (e) {
    next(e);
  }
};

// POST /api/demandes-parents/:id/refuser { motif }
const refuser = async (req, res, next) => {
  try {
    const d = await chargerDemande(parseId(req.params.id));
    const motif = texte((req.body || {}).motif, 500) || null;
    await db.query("UPDATE users SET status = 'rejected', updated_at = NOW() WHERE id = $1", [d.parent_id]);
    await db.query(
      `UPDATE parent_requests SET status = 'rejected', decision_reason = $2, decided_by = $3, decided_at = NOW() WHERE id = $1`,
      [d.id, motif, req.user.id]
    );
    res.json({ success: true, message: "Demande refusée" });
  } catch (e) {
    next(e);
  }
};

module.exports = { inscription, liste, valider, refuser };
