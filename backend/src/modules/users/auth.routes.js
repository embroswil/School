const express = require("express");
const router = express.Router();
const userController = require("./user.controller");
const authMiddleware = require("../../middlewares/auth.middleware");

router.post("/login", userController.login);
router.post("/refresh", userController.refresh);

router.post("/logout", authMiddleware.authenticate, userController.logout);
router.get("/me", authMiddleware.authenticate, userController.me);
router.post("/change-password", authMiddleware.authenticate, userController.changePassword);

// Mise a jour de son propre profil (prenom, nom, telephone)
router.put("/me", authMiddleware.authenticate, async (req, res, next) => {
  try {
    const db = require("../../config/db");
    const ApiError = require("../../utils/ApiError");
    const t = (v, m) => (v === undefined || v === null ? undefined : String(v).trim().slice(0, m));
    const prenom = t(req.body?.firstName, 100);
    const nom = t(req.body?.lastName, 100);
    const tel = t(req.body?.phone, 30);
    if (prenom === "" || nom === "") throw new ApiError(400, "Le prénom et le nom sont obligatoires");
    const { rows } = await db.query(
      `UPDATE users SET first_name = COALESCE($2, first_name), last_name = COALESCE($3, last_name),
         phone = CASE WHEN $4::text IS NULL THEN phone ELSE NULLIF($4, '') END, updated_at = NOW()
       WHERE id = $1 RETURNING first_name, last_name, phone`,
      [req.user.id, prenom ?? null, nom ?? null, tel ?? null]
    );
    res.json({ success: true, data: { firstName: rows[0].first_name, lastName: rows[0].last_name, phone: rows[0].phone } });
  } catch (e) {
    next(e);
  }
});

// L'inscription publique est désactivée : seul un admin crée des comptes.
router.post("/register", authMiddleware.authenticate, authMiddleware.authorize("admin"), userController.createUser);

module.exports = router;
