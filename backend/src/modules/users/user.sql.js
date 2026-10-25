const db = require("../../config/db");
const { ecoleFiltre } = require("../../utils/contexte");

const USER_COLUMNS = `id, email, role, first_name, last_name, phone, address,
  profile_picture, is_active, last_login, created_at, updated_at, school_id, status`;

const findByEmail = async (email) => {
  const { rows } = await db.query(
    `SELECT id, email, password_hash, role, first_name, last_name, phone, address,
            profile_picture, is_active, last_login, created_at, updated_at, school_id, status,
            (SELECT name FROM schools s WHERE s.id = users.school_id) AS school_name
     FROM users WHERE email = $1`,
    [email]
  );
  return rows[0] || null;
};

const findWithPasswordById = async (id) => {
  const { rows } = await db.query(
    "SELECT id, password_hash FROM users WHERE id = $1",
    [id]
  );
  return rows[0] || null;
};

const findById = async (id) => {
  const { rows } = await db.query(
    `SELECT ${USER_COLUMNS}, (SELECT name FROM schools s WHERE s.id = users.school_id) AS school_name
     FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
};

const create = async ({ email, passwordHash, role, firstName, lastName, phone, address, schoolId, status }) => {
  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, role, first_name, last_name, phone, address, school_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${USER_COLUMNS}`,
    [email, passwordHash, role, firstName, lastName, phone || null, address || null, schoolId || null, status || "active"]
  );
  return rows[0];
};

const list = async ({ role, isActive, search, status, limit, offset }) => {
  const where = [];
  const params = [];

  // Administrateur d'etablissement, enseignant… : uniquement son etablissement
  const ecole = ecoleFiltre();
  if (ecole) {
    params.push(ecole);
    where.push(`school_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }

  if (role) {
    params.push(role);
    where.push(`role = $${params.length}`);
  }
  if (isActive !== undefined) {
    params.push(isActive);
    where.push(`is_active = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(
      `(email ILIKE $${params.length} OR first_name ILIKE $${params.length} OR last_name ILIKE $${params.length})`
    );
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const count = await db.query(`SELECT COUNT(*)::int AS total FROM users ${clause}`, params);
  const rows = await db.query(
    `SELECT ${USER_COLUMNS} FROM users ${clause}
     ORDER BY created_at DESC, id DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  return { rows: rows.rows, total: count.rows[0].total };
};

// fields : { colonne_sql: valeur } — les noms de colonnes viennent du service (liste blanche).
const update = async (id, fields) => {
  const cols = Object.keys(fields);
  if (!cols.length) return findById(id);

  const sets = cols.map((c, i) => `${c} = $${i + 1}`);
  const { rows } = await db.query(
    `UPDATE users SET ${sets.join(", ")}, updated_at = NOW()
     WHERE id = $${cols.length + 1}
     RETURNING ${USER_COLUMNS}`,
    [...cols.map((c) => fields[c]), id]
  );
  return rows[0] || null;
};

const updatePassword = async (id, passwordHash) => {
  await db.query(
    `UPDATE users
     SET password_hash = $1, password_changed_at = NOW(), updated_at = NOW()
     WHERE id = $2`,
    [passwordHash, id]
  );
};

const touchLastLogin = async (id) => {
  await db.query("UPDATE users SET last_login = NOW() WHERE id = $1", [id]);
};

// --- journal de connexion -------------------------------------------------

const addLoginAudit = async ({ userId, ip, userAgent, status, reason }) => {
  await db.query(
    `INSERT INTO login_audit (user_id, ip_address, user_agent, login_status, failure_reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId || null, ip ? String(ip).slice(0, 45) : null, userAgent || null, status, reason || null]
  );
};

const countRecentFailures = async (userId, minutes) => {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n FROM login_audit
     WHERE user_id = $1 AND login_status = 'failed'
       AND created_at > NOW() - make_interval(mins => $2::int)
       AND created_at > COALESCE(
         (SELECT MAX(created_at) FROM login_audit WHERE user_id = $1 AND login_status IN ('success', 'password_changed')),
         '-infinity'::timestamp)`,
    [userId, minutes]
  );
  return rows[0].n;
};

// --- sessions (refresh tokens hachés) ---------------------------------------

const createSession = async ({ userId, tokenHash, days, ip, userAgent }) => {
  await db.query(
    `INSERT INTO sessions (user_id, refresh_token, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + make_interval(days => $5::int))`,
    [userId, tokenHash, ip ? String(ip).slice(0, 45) : null, userAgent || null, days]
  );
};

const findActiveSession = async (tokenHash) => {
  const { rows } = await db.query(
    `SELECT s.id AS session_id, u.id, u.email, u.role, u.first_name, u.last_name, u.phone,
            u.address, u.profile_picture, u.is_active, u.last_login, u.created_at, u.updated_at,
            u.school_id, u.status, (SELECT name FROM schools sc WHERE sc.id = u.school_id) AS school_name
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.refresh_token = $1 AND s.expires_at > NOW()`,
    [tokenHash]
  );
  return rows[0] || null;
};

const deleteSession = async (tokenHash) => {
  await db.query("DELETE FROM sessions WHERE refresh_token = $1", [tokenHash]);
};

const deleteSessionsOfUser = async (userId) => {
  await db.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
};

// --- fonctions attendues par les autres modules ---------------------------

// students, attendance, classes, payments et timetable appellent findUserById
// (et une fois getUserById) pour vérifier qu'un utilisateur existe et a le bon rôle.
const findUserById = findById;
const getUserById = findById;

// payments : parents à notifier après un paiement.
const getParentsByStudent = async (studentId) => {
  const { rows } = await db.query(
    `SELECT psl.parent_id, psl.relationship, psl.is_primary, u.email, u.first_name, u.last_name
     FROM parent_student_links psl
     JOIN users u ON u.id = psl.parent_id
     WHERE psl.student_id = $1`,
    [studentId]
  );
  return rows;
};

// classes / timetable l'appellent (via ce module) pour vérifier une matière.
const getSubjectById = async (id) => {
  const { rows } = await db.query(
    "SELECT id, name, code, description, is_active FROM subjects WHERE id = $1",
    [id]
  );
  return rows[0] || null;
};

module.exports = {
  findUserById,
  getUserById,
  getParentsByStudent,
  getSubjectById,
  findByEmail,
  findWithPasswordById,
  findById,
  create,
  list,
  update,
  updatePassword,
  touchLastLogin,
  addLoginAudit,
  countRecentFailures,
  createSession,
  findActiveSession,
  deleteSession,
  deleteSessionsOfUser,
};
