// modules/classeurs/routes.js
// Classeurs des conseils (fin d'annee, conseil d'enseignement) : les tableaux sont calcules par Sùkûl,
// l'etablissement les modifie comme un tableur. On garde seulement ses modifications (cellules, lignes,
// colonnes, titres), appliquees par-dessus les calculs a chaque ouverture.
const express = require("express");
const router = express.Router();
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { authenticate } = require("../../middlewares/auth.middleware");

router.use(authenticate);
const CLE = /^(conseil-annuel:\d{1,9}|rapport-ens:\d{1,9}:[123])$/;
const ecoleDe = (req) => {
  if (!["principal", "teacher"].includes(req.user.role) || !req.user.schoolId) throw new ApiError(403, "Réservé à l’établissement");
  const cle = String(req.params.cle || "");
  if (!CLE.test(cle)) throw new ApiError(400, "Classeur inconnu");
  return [req.user.schoolId, cle];
};

// GET /api/classeurs/:cle
router.get("/:cle", async (req, res, next) => {
  try {
    const [ecole, cle] = ecoleDe(req);
    const r = (await db.query("SELECT modifs, updated_at FROM classeurs WHERE school_id = $1 AND cle = $2", [ecole, cle])).rows[0];
    res.json({ success: true, data: r || { modifs: {}, updated_at: null } });
  } catch (e) {
    next(e);
  }
});

// PUT /api/classeurs/:cle { modifs }
router.put("/:cle", async (req, res, next) => {
  try {
    const [ecole, cle] = ecoleDe(req);
    const m = req.body?.modifs;
    if (!m || typeof m !== "object" || Array.isArray(m)) throw new ApiError(400, "Modifications invalides");
    const texte = JSON.stringify(m);
    if (texte.length > 300000) throw new ApiError(400, "Classeur trop volumineux");
    await db.query(
      `INSERT INTO classeurs (school_id, cle, modifs, modifie_par, updated_at) VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (school_id, cle) DO UPDATE SET modifs = EXCLUDED.modifs, modifie_par = EXCLUDED.modifie_par, updated_at = NOW()`,
      [ecole, cle, texte, req.user.id]
    );
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
