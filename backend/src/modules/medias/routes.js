// modules/medias/routes.js
// Photos et videos des publications : stockees dans Supabase Storage (bucket « medias »).
// Le serveur delivre une adresse d'envoi signee ; le telephone envoie le fichier
// directement au stockage (le serveur ne transporte pas les videos).
// Variables Render : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.
const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const ApiError = require("../../utils/ApiError");
const { authenticate } = require("../../middlewares/auth.middleware");

router.use(authenticate);
const BUCKET = "medias";
const TYPES = {
  "image/jpeg": ["image", "jpg", 10],
  "image/png": ["image", "png", 10],
  "image/webp": ["image", "webp", 10],
  "video/mp4": ["video", "mp4", 50],
  "video/quicktime": ["video", "mov", 50],
  "video/webm": ["video", "webm", 50],
};
const base = () => String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const prefixePublic = () => `${base()}/storage/v1/object/public/${BUCKET}/`;

// POST /api/medias/signer { mime, taille } -> { envoi, url, type }
router.post("/signer", async (req, res, next) => {
  try {
    if (!["principal", "teacher", "admin"].includes(req.user.role)) throw new ApiError(403, "Réservé aux établissements et aux enseignants");
    const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!base() || !cle) throw new ApiError(503, "L’envoi de photos et de vidéos n’est pas encore activé (stockage à configurer)");
    const t = TYPES[req.body?.mime];
    if (!t) throw new ApiError(400, "Format non pris en charge : JPEG, PNG, WebP, MP4, MOV ou WebM");
    const taille = Number(req.body?.taille || 0);
    if (!(taille > 0) || taille > t[2] * 1024 * 1024) throw new ApiError(400, `Fichier trop lourd : ${t[2]} Mo maximum pour une ${t[0] === "video" ? "vidéo" : "photo"}`);
    const chemin = `${req.user.schoolId || "plateforme"}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${t[1]}`;
    const r = await fetch(`${base()}/storage/v1/object/upload/sign/${BUCKET}/${chemin}`, {
      method: "POST",
      headers: { apikey: cle, Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 3600 }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) throw new ApiError(502, j.message || "Le stockage n’a pas répondu");
    res.json({ success: true, data: { envoi: `${base()}/storage/v1${j.url}`, url: `${prefixePublic()}${chemin}`, type: t[0] } });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
module.exports.prefixePublic = prefixePublic;
