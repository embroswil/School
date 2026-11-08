const jwt = require("jsonwebtoken");
const env = require("../config/env");
const ApiError = require("../utils/ApiError");
const { executerAvec } = require("../utils/contexte");

// Compte toujours existant et actif ? (verifie au plus une fois par minute et par compte)
// Un compte supprime ou desactive est deconnecte, meme si son jeton est encore valide.
const comptesVus = new Map();
const compteValide = async (id) => {
  const c = comptesVus.get(id);
  if (c && c.expire > Date.now()) return c.ok;
  const { rows } = await require("../config/db").query("SELECT is_active, langue FROM users WHERE id = $1", [id]);
  const ok = Boolean(rows[0]?.is_active);
  comptesVus.set(id, { ok, langue: rows[0]?.langue || "fr", expire: Date.now() + 60 * 1000 });
  if (comptesVus.size > 5000) comptesVus.clear();
  return ok;
};
// Memorise la langue choisie dans l'application (pour les notifications, alertes et emails)
const noterLangue = (id, req) => {
  const l = String(req.headers["x-langue"] || "").slice(0, 2);
  const c = comptesVus.get(id);
  if (!["fr", "en"].includes(l) || !c || c.langue === l) return;
  c.langue = l;
  require("../config/db").query("UPDATE users SET langue = $2 WHERE id = $1", [id, l]).catch(() => {});
};

const authenticate = (req, res, next) => {
  const suiteAuth = authenticateJeton.bind(null, req, res);
  const header = req.headers.authorization || "";
  const [, token] = header.split(" ");
  let id = null;
  try {
    id = Number(jwt.verify(token, env.jwt.secret, { algorithms: ["HS256"] }).sub);
  } catch (_) {
    return suiteAuth(next);
  }
  compteValide(id)
    .then((ok) => {
      if (!ok) return next(new ApiError(401, "Ce compte n’existe plus ou a été désactivé. Reconnectez-vous."));
      noterLangue(id, req);
      return suiteAuth(next);
    })
    .catch(() => suiteAuth(next));
};

const authenticateJeton = (req, res, next) => {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return next(new ApiError(401, "Authentication required"));
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwt.secret, { algorithms: ["HS256"] });
  } catch (err) {
    const message = err.name === "TokenExpiredError" ? "Token expired" : "Invalid token";
    return next(new ApiError(401, message));
  }
  req.user = {
    id: Number(payload.sub),
    role: payload.role,
    email: payload.email,
    schoolId: payload.schoolId ? Number(payload.schoolId) : null,
  };
  const suite = () => executerAvec({ role: req.user.role, schoolId: req.user.schoolId }, () => next());
  // Abonnement impaye au-dela du delai : l'etablissement passe en lecture seule
  // (consultation possible ; plus de saisie, sauf le paiement, le compte et la messagerie).
  const ecriture = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  // Les parents et eleves peuvent toujours payer leurs frais de scolarite
  const exempte =
    ["/api/abonnement", "/api/auth", "/api/codes", "/api/boite"].some((p) => (req.originalUrl || "").startsWith(p)) ||
    (["parent", "student"].includes(req.user.role) && (req.originalUrl || "").startsWith("/api/scolarite")) ||
    (req.originalUrl || "").startsWith("/api/scolarite/ordres");
  if (ecriture && !exempte && req.user.schoolId && req.user.role !== "admin") {
    return require("../modules/abonnement/service")
      .estEnLectureSeule(req.user.schoolId)
      .then((bloque) =>
        bloque
          ? next(new ApiError(402, "L’abonnement de l’établissement n’est pas réglé : School est en lecture seule jusqu’au paiement."))
          : suite()
      )
      .catch(() => suite());
  }
  // Le reste de la requete connait l'etablissement de l'utilisateur
  suite();
};

// L'administrateur d'un etablissement (« principal ») a, dans SON
// etablissement, les memes droits qu'un administrateur : toute route ouverte
// a « admin » lui est aussi ouverte (les listes sont filtrees par etablissement).
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return next(new ApiError(401, "Authentication required"));
  }
  const ok = roles.includes(req.user.role) || (req.user.role === "principal" && roles.includes("admin"));
  if (!ok) {
    return next(new ApiError(403, "You do not have permission to perform this action"));
  }
  next();
};

// Reserve a l'administrateur de la plateforme (creation des etablissements…)
const isPlatformAdmin = (req, res, next) => {
  if (!req.user) return next(new ApiError(401, "Authentication required"));
  if (req.user.role !== "admin") return next(new ApiError(403, "Réservé à l'administrateur de la plateforme"));
  next();
};

// Raccourcis importés par attendance.routes.js
const isAdmin = authorize("admin");
const isAdminOrTeacher = authorize("admin", "teacher");

module.exports = { authenticate, authorize, isAdmin, isAdminOrTeacher, isPlatformAdmin };
