require("dotenv").config();

const nodeEnv = process.env.NODE_ENV || "development";

const env = {
  nodeEnv,
  isProd: nodeEnv === "production",
  port: parseInt(process.env.PORT, 10) || 3000,

  // Base de données : DATABASE_URL en priorité, sinon DB_HOST/DB_USER/...
  databaseUrl: process.env.DATABASE_URL || null,
  db: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
  dbSsl: process.env.DB_SSL === "true", // à mettre à true pour Supabase / Render

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || "1h",
    refreshDays: parseInt(process.env.REFRESH_TOKEN_DAYS, 10) || 30,
  },

  frontendUrl: process.env.FRONTEND_URL || null,

  // Admin créé au démarrage s'il n'existe pas encore
  admin: {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  },

  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY,
    publicKey: process.env.PAYSTACK_PUBLIC_KEY,
    callbackUrl: process.env.PAYSTACK_CALLBACK_URL,
  },
};

// Appelée par server.js : on échoue tôt avec un message clair.
env.validate = () => {
  const problems = [];
  if (!env.jwt.secret) problems.push("JWT_SECRET is required");
  if (env.isProd && env.jwt.secret && env.jwt.secret.length < 32) {
    problems.push("JWT_SECRET must be at least 32 characters in production");
  }
  if (!env.databaseUrl && !(env.db.user && env.db.database)) {
    problems.push("DATABASE_URL (or DB_USER + DB_NAME) is required");
  }
  if (problems.length) {
    throw new Error("Invalid configuration: " + problems.join("; "));
  }
};

module.exports = env;
