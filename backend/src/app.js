const express = require("express");
const cors = require("cors");

const env = require("./config/env");
const db = require("./config/db");
const { notFound, errorHandler } = require("./middlewares/error.middleware");

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1); // derrière le proxy de Render : req.ip = vraie IP du client

const allowedOrigins = env.frontendUrl
  ? env.frontendUrl.split(",").map((o) => o.trim()).filter(Boolean)
  : null;

app.use(cors(allowedOrigins ? { origin: allowedOrigins } : {}));
// Lecture de photos de listes : images plus lourdes acceptees sur cette seule route
app.use("/api/etablissement/lire-images", express.json({ limit: "15mb" }));
app.use(express.json({ limit: "1mb" }));

// --- santé ------------------------------------------------------------------
app.get("/", (req, res) => res.json({ success: true, message: "School API is running" }));
app.get("/health", (req, res) => res.json({ status: "ok" }));
app.get("/health/db", async (req, res, next) => {
  try {
    await db.query("SELECT 1");
    res.json({ status: "ok", database: "up" });
  } catch (error) {
    next(error);
  }
});

// --- routes -----------------------------------------------------------------
app.use("/api/auth", require("./modules/users/auth.routes"));
app.use("/api/codes", require("./modules/codes/routes").router);
app.use("/api/schools", require("./modules/schools/schools.routes"));
app.use("/api/inscriptions", require("./modules/inscriptions/inscriptions.routes"));
app.use("/api/demandes-etablissements", require("./modules/demandes-etablissements/routes"));
app.use("/api/etablissement", require("./modules/etablissement/routes"));
app.use("/api/boite", require("./modules/boite/routes"));
app.use("/api/actualites", require("./modules/actualites/routes"));
app.use("/api/scolarite", require("./modules/scolarite/routes"));
app.use("/api/notes", require("./modules/notes/routes"));
app.use("/api/suivi", require("./modules/suivi/routes"));
app.use("/api/vie-scolaire", require("./modules/vie-scolaire/routes"));
app.use("/api/users", require("./modules/users/user.routes"));
// Les anciens modules du projet d'origine (eleves, notes, presences, paiements
// Paystack, emplois du temps, rapports…) ne sont plus exposes : ils ne
// separaient pas les etablissements. Les nouveaux modules ci-dessus les remplacent.

// Ces routeurs définissent déjà leur préfixe (/classes, /timetable, ...).

app.use(notFound);
app.use(errorHandler);

module.exports = app;
