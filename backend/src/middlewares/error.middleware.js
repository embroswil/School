const env = require("../config/env");
const ApiError = require("../utils/ApiError");
const logger = require("../utils/logger");

const notFound = (req, res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

// Traduit les erreurs PostgreSQL / body-parser courantes en réponses propres.
const normalize = (err) => {
  if (err instanceof ApiError) return err;
  if (err.type === "entity.parse.failed") return new ApiError(400, "Données envoyées illisibles");
  if (err.type === "entity.too.large") return new ApiError(413, "Fichier trop volumineux : découpez-le ou gardez seulement les feuilles utiles, puis réessayez.");

  switch (err.code) {
    case "23505": return new ApiError(409, "Cet élément existe déjà");
    case "23503": return new ApiError(409, "Opération impossible : des données liées existent");
    case "23502": return new ApiError(400, "Un champ obligatoire est manquant");
    case "23514": return new ApiError(400, "Une valeur n’est pas autorisée");
    case "22P02": return new ApiError(400, "Format de donnée invalide");
    default: return null;
  }
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const known = normalize(err);
  const statusCode = known ? known.statusCode : 500;

  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl}`, err);
  }

  const body = {
    success: false,
    message: known ? known.message : "Internal server error",
  };
  if (known && known.details) body.details = known.details;
  if (!known && !env.isProd) body.error = err.message;

  res.status(statusCode).json(body);
};

module.exports = { notFound, errorHandler };
