// modules/travaux/routes.js
// Travaux en arriere-plan : l'application prepare les elements, le serveur les traite (voir taches/travaux.js).
const express = require("express");
const router = express.Router();
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { authenticate } = require("../../middlewares/auth.middleware");

router.use(authenticate);
const entier = (v) => {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const ROLES = ["photo", "eleves", "enseignants", "emplois", "frais", "paiements", "compta", "appel", "discipline", "publier", "interne"];

const monTravail = async (req) => {
  const t = (await db.query("SELECT * FROM travaux WHERE id = $1 AND user_id = $2", [entier(req.params.id), req.user.id])).rows[0];
  if (!t) throw new ApiError(404, "Travail introuvable");
  return t;
};

// Etat d'un travail : avancement global et resume par role (compteurs additionnes)
async function etat(t) {
  const { rows } = await db.query("SELECT role, statut, resultat FROM travaux_elements WHERE travail_id = $1 ORDER BY ordre, id", [t.id]);
  const roles = {};
  for (const e of rows) {
    const r = (roles[e.role] ||= { total: 0, faits: 0, erreurs: 0, n: {}, alertes: [], messages: [] });
    r.total++;
    if (e.statut === "fait") r.faits++;
    if (e.statut === "erreur") {
      r.erreurs++;
      if (r.messages.length < 3 && e.resultat?.erreur) r.messages.push(e.resultat.erreur);
    }
    for (const [k, v] of Object.entries(e.resultat?.n || {})) r.n[k] = (r.n[k] || 0) + Number(v || 0);
    for (const a of e.resultat?.alertes || []) if (r.alertes.length < 4 && !r.alertes.includes(a)) r.alertes.push(a);
  }
  const total = rows.length;
  const traites = rows.filter((e) => e.statut !== "a_faire").length;
  return { id: t.id, type: t.type, titre: t.titre, statut: t.statut, created_at: t.created_at, termine_le: t.termine_le, total, traites, roles };
}

// POST /api/travaux { type, titre }
router.post("/", async (req, res, next) => {
  try {
    const type = String(req.body?.type || "").slice(0, 40);
    const titre = String(req.body?.titre || "").trim().slice(0, 120);
    if (!type || !titre) throw new ApiError(400, "Travail invalide");
    const { rows } = await db.query("INSERT INTO travaux (school_id, user_id, type, titre) VALUES ($1, $2, $3, $4) RETURNING id", [req.user.schoolId || null, req.user.id, type, titre]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) {
    next(e);
  }
});

// POST /api/travaux/:id/elements { elements: [{ role, ordre, libelle, donnees }] }
router.post("/:id/elements", async (req, res, next) => {
  try {
    const t = await monTravail(req);
    if (t.statut !== "preparation") throw new ApiError(409, "Ce travail est déjà lancé");
    const elements = Array.isArray(req.body?.elements) ? req.body.elements.slice(0, 500) : [];
    for (const e of elements) {
      if (!ROLES.includes(e.role) || !e.donnees || typeof e.donnees !== "object") throw new ApiError(400, "Élément invalide");
      await db.query("INSERT INTO travaux_elements (travail_id, role, ordre, libelle, donnees) VALUES ($1, $2, $3, $4, $5)", [
        t.id,
        e.role,
        Number(e.ordre) || 0,
        String(e.libelle || "").slice(0, 200),
        JSON.stringify(e.donnees),
      ]);
    }
    res.json({ success: true, data: { ajoutes: elements.length } });
  } catch (e) {
    next(e);
  }
});

// POST /api/travaux/:id/lancer : le serveur prend le relais
router.post("/:id/lancer", async (req, res, next) => {
  try {
    const t = await monTravail(req);
    if (t.statut === "preparation") await db.query("UPDATE travaux SET statut = 'en_cours', updated_at = NOW() WHERE id = $1", [t.id]);
    require("../../taches/travaux").reveiller();
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// GET /api/travaux/actifs : travaux en cours, et ceux termines dont le resultat n'a pas encore ete vu
router.get("/actifs", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM travaux WHERE user_id = $1 AND (statut = 'en_cours' OR (statut IN ('termine', 'erreur') AND NOT vu AND termine_le > NOW() - INTERVAL '2 days'))
       ORDER BY id DESC LIMIT 5`,
      [req.user.id]
    );
    res.json({ success: true, data: await Promise.all(rows.map(etat)) });
  } catch (e) {
    next(e);
  }
});

// GET /api/travaux/:id
router.get("/:id", async (req, res, next) => {
  try {
    res.json({ success: true, data: await etat(await monTravail(req)) });
  } catch (e) {
    next(e);
  }
});

// POST /api/travaux/:id/vu : le resultat a ete consulte
router.post("/:id/vu", async (req, res, next) => {
  try {
    const t = await monTravail(req);
    await db.query("UPDATE travaux SET vu = true WHERE id = $1", [t.id]);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// POST /api/travaux/:id/annuler : les elements restants ne sont pas traites
router.post("/:id/annuler", async (req, res, next) => {
  try {
    const t = await monTravail(req);
    await db.query("UPDATE travaux SET statut = 'annule', updated_at = NOW(), termine_le = NOW(), vu = true WHERE id = $1 AND statut IN ('preparation', 'en_cours')", [t.id]);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
