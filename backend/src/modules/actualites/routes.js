// modules/actualites/routes.js
// Fil d'actualites de l'etablissement : annonces, evenements, conseils de
// discipline, resultats… Publie par l'administrateur de l'etablissement,
// visible par les utilisateurs de l'etablissement des la connexion.
const express = require("express");
const router = express.Router();
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { authenticate } = require("../../middlewares/auth.middleware");

const TYPES = ["annonce", "evenement", "conseil_discipline", "resultats", "autre"];
const PUBLICS = ["tous", "parents", "eleves", "enseignants"];
const PUBLIC_DU_ROLE = { parent: "parents", student: "eleves", teacher: "enseignants" };
const LIBELLES = {
  annonce: "Annonce",
  evenement: "Événement",
  conseil_discipline: "Conseil de discipline",
  resultats: "Résultats",
  autre: "Information",
};
const texte = (v, max) => (v === undefined || v === null ? "" : String(v).trim().slice(0, max));

router.use(authenticate);

const ecoleDe = (req) => {
  const id = req.user.role === "admin" ? parseInt(req.query.ecole, 10) : req.user.schoolId;
  if (!id) throw new ApiError(400, "Aucun établissement associé à votre compte");
  return id;
};
const peutPublier = (u) => u.role === "principal" || u.role === "admin";

// GET /api/actualites?limite=20
router.get("/", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    const limite = Math.min(50, Math.max(1, parseInt(req.query.limite, 10) || 30));
    const publicRole = PUBLIC_DU_ROLE[req.user.role];
    const { rows } = await db.query(
      `SELECT p.id, p.type, p.title, p.body, p.event_date, p.event_place, p.students, p.image, p.audience,
              p.pinned, p.created_at, s.name AS school_name
       FROM publications p JOIN schools s ON s.id = p.school_id
       WHERE p.school_id = $1 AND ($2::text IS NULL OR p.audience IN ('tous', $2))
       ORDER BY p.pinned DESC, p.created_at DESC LIMIT $3`,
      [ecole, peutPublier(req.user) ? null : publicRole || "tous", limite]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

// POST /api/actualites (administrateur de l'etablissement)
router.post("/", async (req, res, next) => {
  try {
    if (!peutPublier(req.user)) throw new ApiError(403, "Seul l'établissement peut publier");
    const ecole = ecoleDe(req);
    const b = req.body || {};
    const type = TYPES.includes(b.type) ? b.type : "annonce";
    const titre = texte(b.title, 200);
    if (!titre) throw new ApiError(400, "Le titre est obligatoire");
    const audience = PUBLICS.includes(b.audience) ? b.audience : "tous";
    const eleves = Array.isArray(b.students)
      ? b.students
          .slice(0, 200)
          .map((x) => ({ nom: texte(x.nom, 120), classe: texte(x.classe, 50), motif: texte(x.motif, 300) }))
          .filter((x) => x.nom)
      : null;
    if (type === "conseil_discipline" && (!eleves || !eleves.length)) {
      throw new ApiError(400, "Ajoutez au moins un élève");
    }
    let image = null;
    if (b.image) {
      image = String(b.image);
      if (!/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > 600000) throw new ApiError(400, "Image invalide ou trop lourde");
    }
    const { rows } = await db.query(
      `INSERT INTO publications (school_id, author_id, type, title, body, event_date, event_place, students, image, audience, pinned)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [
        ecole,
        req.user.id,
        type,
        titre,
        texte(b.body, 10000) || null,
        b.eventDate || null,
        texte(b.eventPlace, 200) || null,
        eleves && eleves.length ? JSON.stringify(eleves) : null,
        image,
        audience,
        Boolean(b.pinned),
      ]
    );
    // Notification aux utilisateurs concernes de l'etablissement
    const roles = { tous: ["parent", "student", "teacher"], parents: ["parent"], eleves: ["student"], enseignants: ["teacher"] }[audience];
    await db
      .query(
        `INSERT INTO notifications (user_id, title, message, type, data)
         SELECT id, $2, $3, 'announcement', $4 FROM users
         WHERE school_id = $1 AND role = ANY($5) AND status = 'active' AND is_active = true`,
        [ecole, `${LIBELLES[type]} : ${titre}`, texte(b.body, 140) || titre, JSON.stringify({ lien: "/actualites" }), roles]
      )
      .catch(() => {});
    res.status(201).json({ success: true, data: { id: rows[0].id } });
  } catch (e) {
    next(e);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    if (!peutPublier(req.user)) throw new ApiError(403, "Action réservée à l'établissement");
    const ecole = ecoleDe(req);
    const r = await db.query("DELETE FROM publications WHERE id = $1 AND school_id = $2", [parseInt(req.params.id, 10), ecole]);
    if (!r.rowCount) throw new ApiError(404, "Publication introuvable");
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
