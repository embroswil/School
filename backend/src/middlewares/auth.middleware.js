const jwt = require("jsonwebtoken");
const env = require("../config/env");
const ApiError = require("../utils/ApiError");
const { executerAvec } = require("../utils/contexte");

const authenticate = (req, res, next) => {
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
  // Le reste de la requete connait l'etablissement de l'utilisateur
  executerAvec({ role: req.user.role, schoolId: req.user.schoolId }, () => next());
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
