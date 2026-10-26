// modules/schools/schools.controller.js
const bcrypt = require("bcryptjs");
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { assurerAnneeScolaire } = require("../../utils/annees");

const TYPES = ["maternelle", "primaire", "college", "lycee"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const parseId = (v) => {
  const id = parseInt(v, 10);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Identifiant invalide");
  return id;
};

const versPublic = (e) => ({
  id: e.id,
  name: e.name,
  type: e.type,
  city: e.city,
  code: e.code,
  isActive: e.is_active,
  photo: e.photo || null,
  administrateurs: e.administrateurs || undefined,
  nbUtilisateurs: e.nb_utilisateurs ?? undefined,
});

const listePublique = async (req, res, next) => {
  try {
    const { rows } = await db.query(
      "SELECT id, name, type, city, code, is_active, photo FROM schools WHERE is_active = true ORDER BY name"
    );
    res.json({ success: true, data: rows.map(versPublic) });
  } catch (e) {
    next(e);
  }
};

const liste = async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT s.*,
         (SELECT COUNT(*)::int FROM users u WHERE u.school_id = s.id) AS nb_utilisateurs,
         (SELECT COALESCE(json_agg(json_build_object('id', u.id, 'email', u.email, 'firstName', u.first_name, 'lastName', u.last_name)), '[]')
            FROM users u WHERE u.school_id = s.id AND u.role = 'principal') AS administrateurs
       FROM schools s ORDER BY s.name`
    );
    res.json({ success: true, data: rows.map(versPublic) });
  } catch (e) {
    next(e);
  }
};

const valider = (b, partiel = false) => {
  const name = b.name !== undefined ? String(b.name).trim() : undefined;
  if (!partiel && !name) throw new ApiError(400, "Le nom de l'établissement est obligatoire");
  if (b.type !== undefined && !TYPES.includes(b.type)) throw new ApiError(400, `Type : ${TYPES.join(", ")}`);
  if (!partiel && !b.type) throw new ApiError(400, "Le type d'établissement est obligatoire");
  return {
    name,
    type: b.type,
    city: b.city !== undefined ? String(b.city).trim() || null : undefined,
    code: b.code !== undefined ? String(b.code).trim().toUpperCase() || null : undefined,
    isActive: typeof b.isActive === "boolean" ? b.isActive : undefined,
  };
};

const creer = async (req, res, next) => {
  try {
    const d = valider(req.body || {});
    const { rows } = await db.query(
      `INSERT INTO schools (name, type, city, code, is_active) VALUES ($1, $2, $3, $4, true) RETURNING *`,
      [d.name, d.type, d.city || null, d.code || null]
    );
    await assurerAnneeScolaire(rows[0].id).catch(() => {});
    res.status(201).json({ success: true, data: versPublic(rows[0]) });
  } catch (e) {
    if (e.code === "23505") return next(new ApiError(409, "Ce code d'établissement existe déjà"));
    next(e);
  }
};

const modifier = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const d = valider(req.body || {}, true);
    const { rows } = await db.query(
      `UPDATE schools SET name = COALESCE($2, name), type = COALESCE($3, type), city = COALESCE($4, city),
         code = COALESCE($5, code), is_active = COALESCE($6, is_active), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, d.name ?? null, d.type ?? null, d.city ?? null, d.code ?? null, d.isActive ?? null]
    );
    if (!rows[0]) throw new ApiError(404, "Établissement introuvable");
    res.json({ success: true, data: versPublic(rows[0]) });
  } catch (e) {
    next(e);
  }
};

// Designe l'administrateur d'un etablissement : un compte existant (par son
// email) ou un nouveau compte (email, prenom, nom, mot de passe).
const definirAdministrateur = async (req, res, next) => {
  try {
    const schoolId = parseId(req.params.id);
    const b = req.body || {};
    const email = String(b.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new ApiError(400, "Email invalide");

    const ecole = await db.query("SELECT id FROM schools WHERE id = $1", [schoolId]);
    if (!ecole.rows[0]) throw new ApiError(404, "Établissement introuvable");

    const existant = await db.query("SELECT id, role FROM users WHERE email = $1", [email]);
    let utilisateur;
    if (existant.rows[0]) {
      if (existant.rows[0].role === "admin") throw new ApiError(400, "Ce compte est administrateur de la plateforme");
      const { rows } = await db.query(
        `UPDATE users SET role = 'principal', school_id = $2, status = 'active', is_active = true, updated_at = NOW()
         WHERE id = $1 RETURNING id, email, first_name, last_name, role, school_id`,
        [existant.rows[0].id, schoolId]
      );
      utilisateur = rows[0];
    } else {
      if (!b.firstName || !b.lastName) throw new ApiError(400, "Prénom et nom obligatoires");
      if (typeof b.password !== "string" || b.password.length < 8) {
        throw new ApiError(400, "Mot de passe : 8 caractères minimum");
      }
      const { rows } = await db.query(
        `INSERT INTO users (email, password_hash, role, first_name, last_name, phone, school_id, status)
         VALUES ($1, $2, 'principal', $3, $4, $5, $6, 'active')
         RETURNING id, email, first_name, last_name, role, school_id`,
        [email, await bcrypt.hash(b.password, 10), String(b.firstName).trim(), String(b.lastName).trim(), b.phone || null, schoolId]
      );
      utilisateur = rows[0];
    }
    res.status(201).json({ success: true, data: utilisateur });
  } catch (e) {
    next(e);
  }
};

module.exports = { listePublique, liste, creer, modifier, definirAdministrateur };
