const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const env = require("../../config/env");
const ApiError = require("../../utils/ApiError");
const logger = require("../../utils/logger");
const userSql = require("./user.sql");

// admin : administrateur de la plateforme ; principal : administrateur d'un
// etablissement (une personne du personnel choisie par l'etablissement)
const ROLES = ["admin", "principal", "teacher", "parent", "student"];
// Roles qu'un administrateur d'etablissement peut attribuer
const ROLES_ETABLISSEMENT = ["teacher", "parent", "student"];
const { ecoleCourante } = require("../../utils/contexte");
const BCRYPT_ROUNDS = 10;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const MIN_PASSWORD_LENGTH = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Hash factice : on compare toujours un mot de passe, même si l'email n'existe pas.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const toPublicUser = (u) => ({
  id: u.id,
  email: u.email,
  role: u.role,
  firstName: u.first_name,
  lastName: u.last_name,
  phone: u.phone,
  address: u.address,
  profilePicture: u.profile_picture,
  isActive: u.is_active,
  lastLogin: u.last_login,
  createdAt: u.created_at,
  schoolId: u.school_id || null,
  status: u.status || "active",
});

const assertPassword = (password, label = "Password") => {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw new ApiError(400, `${label} must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (password.length > 72) {
    throw new ApiError(400, `${label} must be at most 72 characters`);
  }
};

const issueTokens = async (user, { ip, userAgent }) => {
  const accessToken = jwt.sign({ role: user.role, email: user.email, schoolId: user.school_id || null }, env.jwt.secret, {
    subject: String(user.id),
    expiresIn: env.jwt.expiresIn,
    algorithm: "HS256",
  });

  const refreshToken = crypto.randomBytes(48).toString("hex");
  await userSql.createSession({
    userId: user.id,
    tokenHash: sha256(refreshToken),
    days: env.jwt.refreshDays,
    ip,
    userAgent,
  });

  return { accessToken, refreshToken, expiresIn: env.jwt.expiresIn };
};

// --- authentification -------------------------------------------------------

const login = async ({ email, password, ip, userAgent }) => {
  const normalized = normalizeEmail(email);
  if (!normalized || typeof password !== "string" || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  const user = await userSql.findByEmail(normalized);

  if (user) {
    const failures = await userSql.countRecentFailures(user.id, LOCK_MINUTES);
    if (failures >= MAX_FAILED_LOGINS) {
      await userSql.addLoginAudit({ userId: user.id, ip, userAgent, status: "locked", reason: "Too many failed attempts" });
      throw new ApiError(429, `Too many failed attempts. Try again in ${LOCK_MINUTES} minutes`);
    }
  }

  const passwordOk = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

  if (!user || !passwordOk) {
    await userSql.addLoginAudit({
      userId: user ? user.id : null,
      ip,
      userAgent,
      status: "failed",
      reason: user ? "Wrong password" : "Unknown email",
    });
    throw new ApiError(401, "Invalid email or password");
  }

  if (!user.is_active) {
    await userSql.addLoginAudit({ userId: user.id, ip, userAgent, status: "failed", reason: "Account deactivated" });
    throw new ApiError(403, "Account is deactivated");
  }
  if (user.status === "pending") {
    await userSql.addLoginAudit({ userId: user.id, ip, userAgent, status: "failed", reason: "Pending validation" });
    throw new ApiError(403, "Votre compte est en attente de validation par l'établissement");
  }
  if (user.status === "rejected") {
    await userSql.addLoginAudit({ userId: user.id, ip, userAgent, status: "failed", reason: "Rejected" });
    throw new ApiError(403, "Votre demande d'inscription a été refusée par l'établissement");
  }

  await userSql.addLoginAudit({ userId: user.id, ip, userAgent, status: "success" });
  await userSql.touchLastLogin(user.id);

  const tokens = await issueTokens(user, { ip, userAgent });
  return { ...tokens, user: toPublicUser(user) };
};

const refresh = async ({ refreshToken, ip, userAgent }) => {
  if (typeof refreshToken !== "string" || !refreshToken) {
    throw new ApiError(400, "Refresh token is required");
  }

  const tokenHash = sha256(refreshToken);
  const session = await userSql.findActiveSession(tokenHash);
  if (!session) throw new ApiError(401, "Invalid or expired refresh token");

  // Rotation : l'ancien refresh token ne sert qu'une fois.
  await userSql.deleteSession(tokenHash);

  if (!session.is_active) throw new ApiError(403, "Account is deactivated");
  if (session.status && session.status !== "active") throw new ApiError(403, "Compte non validé");

  const tokens = await issueTokens(session, { ip, userAgent });
  return { ...tokens, user: toPublicUser(session) };
};

const logout = async ({ userId, refreshToken }) => {
  if (typeof refreshToken === "string" && refreshToken) {
    await userSql.deleteSession(sha256(refreshToken));
  } else {
    await userSql.deleteSessionsOfUser(userId);
  }
};

const getProfile = async (userId) => {
  const user = await userSql.findById(userId);
  if (!user) throw new ApiError(404, "User not found");
  return toPublicUser(user);
};

const changePassword = async ({ userId, currentPassword, newPassword, ip, userAgent }) => {
  if (typeof currentPassword !== "string" || !currentPassword) {
    throw new ApiError(400, "Current password is required");
  }
  assertPassword(newPassword, "New password");

  const user = await userSql.findWithPasswordById(userId);
  if (!user) throw new ApiError(404, "User not found");

  const ok = await bcrypt.compare(currentPassword, user.password_hash);
  if (!ok) throw new ApiError(401, "Current password is incorrect");

  await userSql.updatePassword(userId, await bcrypt.hash(newPassword, BCRYPT_ROUNDS));
  await userSql.deleteSessionsOfUser(userId);
  await userSql.addLoginAudit({ userId, ip, userAgent, status: "password_changed" });
};

// --- gestion des utilisateurs (admin) ---------------------------------------

const createUser = async (data) => {
  const email = normalizeEmail(data.email);
  const { role, firstName, lastName, phone, address, password } = data;

  if (!EMAIL_RE.test(email)) throw new ApiError(400, "A valid email is required");
  if (!ROLES.includes(role)) throw new ApiError(400, `Role must be one of: ${ROLES.join(", ")}`);

  // Administrateur d'etablissement : comptes de SON etablissement seulement,
  // et jamais administrateur. Administrateur de la plateforme : etablissement au choix.
  const ecole = ecoleCourante();
  if (ecole && !ROLES_ETABLISSEMENT.includes(role)) {
    throw new ApiError(403, "Vous pouvez créer des comptes enseignant, parent ou élève uniquement");
  }
  const schoolId = ecole || (data.schoolId ? Number(data.schoolId) : null);
  if (role !== "admin" && !schoolId) throw new ApiError(400, "Indiquez l'établissement");
  if (!firstName || !lastName) throw new ApiError(400, "First name and last name are required");
  assertPassword(password);

  if (await userSql.findByEmail(email)) throw new ApiError(409, "Email already in use");

  const created = await userSql.create({
    email,
    passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    role,
    firstName: String(firstName).trim(),
    lastName: String(lastName).trim(),
    phone,
    address,
    schoolId: role === "admin" ? null : schoolId,
    status: "active",
  });
  return toPublicUser(created);
};

// Verifie qu'un administrateur d'etablissement ne touche qu'a SON etablissement
const verifierMemeEcole = (user) => {
  const ecole = ecoleCourante();
  if (ecole && user.school_id !== ecole) throw new ApiError(404, "User not found");
};

const listUsers = async ({ role, isActive, search, status, page, limit }) => {
  if (role && !ROLES.includes(role)) throw new ApiError(400, `Role must be one of: ${ROLES.join(", ")}`);

  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const { rows, total } = await userSql.list({
    role,
    isActive: isActive === undefined ? undefined : isActive === "true" || isActive === true,
    search: search ? String(search).trim() : undefined,
    status: ["pending", "active", "rejected"].includes(status) ? status : undefined,
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit,
  });

  return {
    users: rows.map(toPublicUser),
    meta: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) },
  };
};

const getUser = async (id) => {
  const user = await userSql.findById(id);
  if (!user) throw new ApiError(404, "User not found");
  verifierMemeEcole(user);
  return toPublicUser(user);
};

const updateUser = async (id, data, actorId) => {
  const fields = {};
  const cible = await userSql.findById(id);
  if (!cible) throw new ApiError(404, "User not found");
  verifierMemeEcole(cible);

  if (data.firstName !== undefined) fields.first_name = String(data.firstName).trim();
  if (data.lastName !== undefined) fields.last_name = String(data.lastName).trim();
  if (data.phone !== undefined) fields.phone = data.phone;
  if (data.address !== undefined) fields.address = data.address;

  if (data.email !== undefined) {
    const email = normalizeEmail(data.email);
    if (!EMAIL_RE.test(email)) throw new ApiError(400, "A valid email is required");
    const existing = await userSql.findByEmail(email);
    if (existing && existing.id !== id) throw new ApiError(409, "Email already in use");
    fields.email = email;
  }

  if (data.role !== undefined) {
    if (!ROLES.includes(data.role)) throw new ApiError(400, `Role must be one of: ${ROLES.join(", ")}`);
    if (id === actorId && data.role !== cible.role) {
      throw new ApiError(400, "Vous ne pouvez pas modifier votre propre rôle");
    }
    if (data.role !== cible.role && ecoleCourante() && !ROLES_ETABLISSEMENT.includes(data.role)) {
      throw new ApiError(403, "Rôle non autorisé");
    }
    fields.role = data.role;
  }

  if ((fields.first_name !== undefined && !fields.first_name) || (fields.last_name !== undefined && !fields.last_name)) {
    throw new ApiError(400, "First name and last name cannot be empty");
  }

  const updated = await userSql.update(id, fields);
  if (!updated) throw new ApiError(404, "User not found");
  return toPublicUser(updated);
};

const setUserActive = async (id, isActive, actorId) => {
  if (typeof isActive !== "boolean") throw new ApiError(400, "isActive must be true or false");
  if (id === actorId && !isActive) throw new ApiError(400, "You cannot deactivate your own account");
  const cible = await userSql.findById(id);
  if (!cible) throw new ApiError(404, "User not found");
  verifierMemeEcole(cible);

  const updated = await userSql.update(id, { is_active: isActive });
  if (!updated) throw new ApiError(404, "User not found");
  if (!isActive) await userSql.deleteSessionsOfUser(id);
  return toPublicUser(updated);
};

// --- démarrage --------------------------------------------------------------

// Crée le premier admin depuis ADMIN_EMAIL / ADMIN_PASSWORD s'il n'existe pas.
const ensureAdmin = async () => {
  const email = normalizeEmail(env.admin.email);
  if (!email || !env.admin.password) return;

  if (await userSql.findByEmail(email)) return;

  assertPassword(env.admin.password, "ADMIN_PASSWORD");
  await userSql.create({
    email,
    passwordHash: await bcrypt.hash(env.admin.password, BCRYPT_ROUNDS),
    role: "admin",
    firstName: "System",
    lastName: "Administrator",
  });
  logger.info(`Admin account created for ${email}`);
};

module.exports = {
  login,
  refresh,
  logout,
  getProfile,
  changePassword,
  createUser,
  listUsers,
  getUser,
  updateUser,
  setUserActive,
  ensureAdmin,
};
