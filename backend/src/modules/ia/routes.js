// modules/ia/routes.js
// Plafond mensuel de lectures automatiques (IA) : consultation par l'etablissement, reglage par l'administrateur de la plateforme.
const express = require("express");
const router = express.Router();
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { authenticate, isPlatformAdmin } = require("../../middlewares/auth.middleware");
const Q = require("../../utils/quota-ia");

router.use(authenticate);

// GET /api/ia/quota : lectures utilisees / plafond du mois, pour l'etablissement de l'utilisateur
router.get("/quota", async (req, res, next) => {
  try {
    if (!req.user.schoolId) return res.json({ success: true, data: null });
    res.json({ success: true, data: await Q.etat(req.user.schoolId) });
  } catch (e) {
    next(e);
  }
});

// GET /api/ia/admin : tous les etablissements (plateforme)
router.get("/admin", isPlatformAdmin, async (req, res, next) => {
  try {
    const defaut = await Q.defaut();
    const { rows } = await db.query(
      `SELECT s.id, s.name, s.city, s.quota_ia,
              COALESCE((SELECT SUM(poids) FROM ia_usage u WHERE u.school_id = s.id AND u.created_at >= date_trunc('month', NOW() AT TIME ZONE 'Africa/Douala') AT TIME ZONE 'Africa/Douala'), 0)::int AS ce_mois,
              COALESCE((SELECT SUM(poids) FROM ia_usage u WHERE u.school_id = s.id), 0)::int AS total
       FROM schools s ORDER BY s.name`
    );
    const ecoles = rows.map((x) => ({ ...x, limite: x.quota_ia === null ? defaut : x.quota_ia, parDefaut: x.quota_ia === null }));
    const parType = (await db.query(`SELECT type, SUM(poids)::int AS n FROM ia_usage WHERE created_at >= date_trunc('month', NOW()) GROUP BY type ORDER BY n DESC`)).rows;
    res.json({ success: true, data: { defaut, ecoles, parType, total: ecoles.reduce((s, x) => s + x.ce_mois, 0) } });
  } catch (e) {
    next(e);
  }
});

// PUT /api/ia/admin/defaut { quota }
router.put("/admin/defaut", isPlatformAdmin, async (req, res, next) => {
  try {
    const q = Math.floor(Number(req.body?.quota));
    if (!(q >= 0 && q <= 100000)) throw new ApiError(400, "Plafond invalide");
    await db.query("INSERT INTO plateforme_reglages (cle, valeur) VALUES ('quota_ia_defaut', $1) ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur", [JSON.stringify(q)]);
    res.json({ success: true, data: { defaut: q } });
  } catch (e) {
    next(e);
  }
});

// PUT /api/ia/admin/ecoles/:id { quota } : plafond propre a un etablissement (null / vide : limite par defaut ; 0 : desactive)
router.put("/admin/ecoles/:id", isPlatformAdmin, async (req, res, next) => {
  try {
    const brut = req.body?.quota;
    const q = brut === null || brut === "" || brut === undefined ? null : Math.floor(Number(brut));
    if (q !== null && !(q >= 0 && q <= 100000)) throw new ApiError(400, "Plafond invalide");
    const r = await db.query("UPDATE schools SET quota_ia = $2 WHERE id = $1", [parseInt(req.params.id, 10), q]);
    if (!r.rowCount) throw new ApiError(404, "Établissement introuvable");
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
