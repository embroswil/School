const jwt = require("jsonwebtoken");
const env = require("../config/env");
const ApiError = require("../utils/ApiError");

const authenticate = (req, res, next) => {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return next(new ApiError(401, "Authentication required"));
  }

  try {
    const payload = jwt.verify(token, env.jwt.secret, { algorithms: ["HS256"] });
    req.user = { id: Number(payload.sub), role: payload.role, email: payload.email };
    next();
  } catch (err) {
    const message = err.name === "TokenExpiredError" ? "Token expired" : "Invalid token";
    next(new ApiError(401, message));
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return next(new ApiError(401, "Authentication required"));
  }
  if (!roles.includes(req.user.role)) {
    return next(new ApiError(403, "You do not have permission to perform this action"));
  }
  next();
};

module.exports = { authenticate, authorize };
