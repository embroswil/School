const env = require("../config/env");
const ApiError = require("../utils/ApiError");
const logger = require("../utils/logger");

const notFound = (req, res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

// Traduit les erreurs PostgreSQL / body-parser courantes en réponses propres.
const normalize = (err) => {
  if (err instanceof ApiError) return err;
  if (err.type === "entity.parse.failed") return new ApiError(400, "Invalid JSON body");
  if (err.type === "entity.too.large") return new ApiError(413, "Request body too large");

  switch (err.code) {
    case "23505": return new ApiError(409, "Resource already exists");
    case "23503": return new ApiError(409, "Operation conflicts with related records");
    case "23502": return new ApiError(400, "A required field is missing");
    case "23514": return new ApiError(400, "A value is not allowed");
    case "22P02": return new ApiError(400, "Invalid input format");
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
