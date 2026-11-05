// modules/push/routes.js
// Abonnement du telephone aux notifications « push ».
const express = require("express");
const router = express.Router();
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { authenticate } = require("../../middlewares/auth.middleware");
const W = require("../../utils/webpush");

// GET /api/push/cle : cle publique (null si les notifications push ne sont pas configurees)
router.get("/cle", (req, res) => res.json({ success: true, data: { cle: W.configuree() ? W.clePublique() : null } }));

router.use(authenticate);

// POST /api/push/abonnement { endpoint, keys: { p256dh, auth }, appareil }
router.post("/abonnement", async (req, res, next) => {
  try {
    const b = req.body || {};
    const endpoint = String(b.endpoint || "");
    if (!/^https:\/\//.test(endpoint) || !b.keys?.p256dh || !b.keys?.auth) throw new ApiError(400, "Abonnement invalide");
    await db.query(
      `INSERT INTO push_abonnements (user_id, endpoint, p256dh, auth, appareil) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [req.user.id, endpoint.slice(0, 1000), String(b.keys.p256dh).slice(0, 200), String(b.keys.auth).slice(0, 100), String(b.appareil || "").slice(0, 120) || null]
    );
    res.status(201).json({ success: true });
  } catch (e) {
    next(e);
  }
});

// DELETE /api/push/abonnement { endpoint }
router.delete("/abonnement", async (req, res, next) => {
  try {
    await db.query("DELETE FROM push_abonnements WHERE user_id = $1 AND endpoint = $2", [req.user.id, String(req.body?.endpoint || "")]);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
