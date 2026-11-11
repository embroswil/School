// modules/comptes/routes.js
// Suppression de comptes :
// - chacun peut supprimer son propre compte (mot de passe demande) ;
// - l'administrateur de la plateforme supprime n'importe quel compte (sauf un autre administrateur de la plateforme) ;
// - l'administrateur d'un etablissement supprime les enseignants et les autres administrateurs de son etablissement.
const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { authenticate } = require("../../middlewares/auth.middleware");

router.use(authenticate);

// Supprime un compte et detache ce qui le reference
const supprimer = async (id) => {
  await db.query("UPDATE parent_student_links SET created_by = NULL WHERE created_by = $1", [id]);
  await db.query("UPDATE attendance SET locked_by = NULL WHERE locked_by = $1", [id]);
  await db.query("UPDATE student_grades SET locked_by = NULL WHERE locked_by = $1", [id]);
  await db.query("UPDATE payment_reconciliations SET prepared_by = NULL WHERE prepared_by = $1", [id]);
  await db.query("DELETE FROM users WHERE id = $1", [id]);
};

// PUT /api/comptes/photo { photo } : photo de profil (image recadree par l'application, en data URL)
router.put("/photo", async (req, res, next) => {
  try {
    const photo = String(req.body?.photo || "");
    if (photo !== "" && !/^data:image\/(jpeg|png|webp);base64,/.test(photo)) throw new ApiError(400, "Image invalide");
    if (photo.length > 250000) throw new ApiError(400, "Image trop lourde");
    await db.query("UPDATE users SET profile_picture = $2, updated_at = NOW() WHERE id = $1", [req.user.id, photo || null]);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// DELETE /api/comptes/moi { password }
router.delete("/moi", async (req, res, next) => {
  try {
    const u = (await db.query("SELECT id, role, password_hash, school_id FROM users WHERE id = $1", [req.user.id])).rows[0];
    if (!u) throw new ApiError(404, "Compte introuvable");
    if (u.role === "admin") throw new ApiError(403, "Le compte administrateur de la plateforme ne peut pas être supprimé ici");
    if (!(await bcrypt.compare(String(req.body?.password || ""), u.password_hash))) throw new ApiError(400, "Mot de passe incorrect");
    if (u.role === "principal") {
      const n = (await db.query("SELECT COUNT(*)::int AS n FROM users WHERE school_id = $1 AND role = 'principal' AND is_active = true", [u.school_id])).rows[0].n;
      if (n <= 1) throw new ApiError(400, "Vous êtes le seul administrateur de l’établissement : ajoutez-en un autre avant de supprimer votre compte");
    }
    await supprimer(u.id);
    res.json({ success: true, message: "Compte supprimé" });
  } catch (e) {
    next(e);
  }
});

// DELETE /api/comptes/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) throw new ApiError(400, "Identifiant invalide");
    if (id === req.user.id) throw new ApiError(400, "Pour supprimer votre propre compte, utilisez le Profil");
    const cible = (await db.query("SELECT id, role, school_id FROM users WHERE id = $1", [id])).rows[0];
    if (!cible) throw new ApiError(404, "Compte introuvable");
    if (cible.role === "admin") throw new ApiError(403, "Impossible de supprimer un administrateur de la plateforme");
    if (req.user.role === "admin") {
      // administrateur de la plateforme : tout est permis
    } else if (req.user.role === "principal") {
      if (cible.school_id !== req.user.schoolId || !["teacher", "principal"].includes(cible.role)) {
        throw new ApiError(403, "Vous pouvez supprimer les enseignants et les administrateurs de votre établissement");
      }
      if (cible.role === "principal") {
        const n = (await db.query("SELECT COUNT(*)::int AS n FROM users WHERE school_id = $1 AND role = 'principal' AND is_active = true", [cible.school_id])).rows[0].n;
        if (n <= 1) throw new ApiError(400, "Il faut au moins un administrateur");
      }
    } else {
      throw new ApiError(403, "Action non autorisée");
    }
    await supprimer(id);
    res.json({ success: true, message: "Compte supprimé" });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
