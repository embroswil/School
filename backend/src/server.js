const env = require("./config/env");
env.validate();

const app = require("./app");
const db = require("./config/db");
const logger = require("./utils/logger");
const { ensureAdmin } = require("./modules/users/user.service");

const start = async () => {
  await db.query("SELECT 1"); // échoue tôt si la base est injoignable
  await ensureAdmin();

  const server = app.listen(env.port, "0.0.0.0", () => {
    logger.info(`Backend running on port ${env.port} (${env.nodeEnv})`);
  });

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => db.end().finally(() => process.exit(0)));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

start().catch((err) => {
  logger.error("Failed to start server", err);
  process.exit(1);
});
