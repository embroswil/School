const { Pool } = require("pg");
const env = require("./env");

const config = env.databaseUrl
  ? { connectionString: env.databaseUrl }
  : {
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      database: env.db.database,
    };

if (env.dbSsl) {
  config.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(config);

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err.message);
});

module.exports = pool;
