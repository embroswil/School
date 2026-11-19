// modules/demandes-etablissements/routes.js
// « Inscrire mon etablissement » : l'etablissement et le compte de son responsable sont crees
// immediatement (aucune validation par l'equipe Sùkûl). L'inscription reste enregistree pour le suivi.
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { authenticate, isPlatformAdmin } = require("../../middlewares/auth.middleware");
const { assurerAnneeScolaire } = require("../../utils/annees");
const { notifierUtilisateur } = require("../../utils/notifier");

const TYPES = ["maternelle", "primaire", "college", "lycee"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const texte = (v, max = 100) => (v === undefined || v === null ? "" : String(v).trim().slice(0, max));
const parseId = (v) => {
  const id = parseInt(v, 10);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Identifiant invalide");
  return id;
};

// Publique
router.post("/", async (req, res, next) => {
  try {
    const b = req.body || {};
    const nom = texte(b.name, 255);
    const email = texte(b.contactEmail, 255).toLowerCase();
    if (!nom) throw new ApiError(400, "Le nom de l'établissement est obligatoire");
    if (!TYPES.includes(b.type)) throw new ApiError(400, "Choisissez le type d'établissement");
    if (!texte(b.contactFirstName) || !texte(b.contactLastName)) throw new ApiError(400, "Le prénom et le nom du responsable sont obligatoires");
    if (!EMAIL_RE.test(email)) throw new ApiError(400, "Adresse email invalide");
    if (!texte(b.contactPhone, 30)) throw new ApiError(400, "Le téléphone du responsable est obligatoire");
    if (typeof b.password !== "string" || b.password.length < 8 || b.password.length > 72) {
      throw new ApiError(400, "Mot de passe : 8 caractères minimum");
    }
    if ((await db.query("SELECT 1 FROM users WHERE email = $1", [email])).rows[0]) {
      throw new ApiError(409, "Un compte existe déjà avec cette adresse e-mail : connectez-vous, ou utilisez « Mot de passe oublié ».");
    }
    const client = await db.connect();
    let ecoleId;
    let responsableId;
    try {
      await client.query("BEGIN");
      const hash = await bcrypt.hash(b.password, 10);
      ecoleId = (await client.query("INSERT INTO schools (name, type, city, is_active) VALUES ($1, $2, $3, true) RETURNING id", [nom, b.type, texte(b.city) || null])).rows[0].id;
      responsableId = (await client.query(
        `INSERT INTO users (email, password_hash, role, first_name, last_name, phone, school_id, status)
         VALUES ($1, $2, 'principal', $3, $4, $5, $6, 'active') RETURNING id`,
        [email, hash, texte(b.contactFirstName), texte(b.contactLastName), texte(b.contactPhone, 30), ecoleId]
      )).rows[0].id;
      await client.query(
        `INSERT INTO school_requests (name, type, city, address, student_count, contact_first_name, contact_last_name,
           contact_function, contact_email, contact_phone, password_hash, message, status, school_id, decided_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'approved',$13,NOW())`,
        [
          nom,
          b.type,
          texte(b.city) || null,
          texte(b.address, 500) || null,
          texte(b.studentCount, 50) || null,
          texte(b.contactFirstName),
          texte(b.contactLastName),
          texte(b.contactFunction) || null,
          email,
          texte(b.contactPhone, 30),
          hash,
          texte(b.message, 1000) || null,
          ecoleId,
        ]
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      if (e.code === "23505") throw new ApiError(409, "Un compte existe déjà avec cette adresse e-mail : connectez-vous, ou utilisez « Mot de passe oublié ».");
      throw e;
    } finally {
      client.release();
    }
    await assurerAnneeScolaire(ecoleId).catch(() => {});
    // l'equipe Sùkûl est simplement informee
    const admins = (await db.query("SELECT id FROM users WHERE role = 'admin' AND is_active")).rows;
    for (const a of admins)
      await notifierUtilisateur(a.id, { title: "Nouvel établissement inscrit", message: `${nom}${texte(b.city) ? ` · ${texte(b.city)}` : ""} · ${texte(b.contactFirstName)} ${texte(b.contactLastName)}`, type: "system" }).catch(() => {});
    // Confirmation de l'adresse e-mail du responsable, des l'inscription (code a 6 chiffres)
    let envoi = null;
    try {
      const { envoyerCode } = require("../codes/routes");
      envoi = await envoyerCode({ id: responsableId, email, first_name: texte(b.contactFirstName) }, "verification");
    } catch (_) {
      // l'etablissement reste cree ; un nouveau code pourra etre demande depuis l'ecran de confirmation
    }
    res.status(201).json({
      success: true,
      data: { schoolId: ecoleId, codeEnvoye: Boolean(envoi), canal: envoi?.canal || null, destination: envoi?.destination || null },
      message: "Établissement créé : bienvenue sur Sùkûl.",
    });
  } catch (e) {
    next(e);
  }
});

// Administrateur de la plateforme
router.get("/", authenticate, isPlatformAdmin, async (req, res, next) => {
  try {
    const statut = ["pending", "approved", "rejected"].includes(req.query.status) ? req.query.status : "pending";
    const { rows } = await db.query(
      `SELECT id, name, type, city, address, student_count, contact_first_name, contact_last_name, contact_function,
              contact_email, contact_phone, message, status, decision_reason, created_at
       FROM school_requests WHERE status = $1 ORDER BY created_at DESC`,
      [statut]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

const charger = async (id) => {
  const { rows } = await db.query("SELECT * FROM school_requests WHERE id = $1", [id]);
  if (!rows[0]) throw new ApiError(404, "Demande introuvable");
  if (rows[0].status !== "pending") throw new ApiError(400, "Cette demande a déjà été traitée");
  return rows[0];
};

router.post("/:id/valider", authenticate, isPlatformAdmin, async (req, res, next) => {
  const client = await db.connect();
  try {
    const d = await charger(parseId(req.params.id));
    if ((await client.query("SELECT 1 FROM users WHERE email = $1", [d.contact_email])).rows[0]) {
      throw new ApiError(409, "Un compte existe déjà avec l'email du responsable");
    }
    await client.query("BEGIN");
    const ecole = await client.query(
      "INSERT INTO schools (name, type, city, is_active) VALUES ($1, $2, $3, true) RETURNING id",
      [d.name, d.type, d.city]
    );
    await client.query(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, phone, school_id, status)
       VALUES ($1, $2, 'principal', $3, $4, $5, $6, 'active')`,
      [d.contact_email, d.password_hash, d.contact_first_name, d.contact_last_name, d.contact_phone, ecole.rows[0].id]
    );
    await client.query(
      "UPDATE school_requests SET status = 'approved', school_id = $2, decided_at = NOW() WHERE id = $1",
      [d.id, ecole.rows[0].id]
    );
    await client.query("COMMIT");
    await assurerAnneeScolaire(ecole.rows[0].id).catch(() => {});
    res.json({ success: true, message: "Établissement activé : le responsable peut se connecter avec son email et son mot de passe." });
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}
    next(e);
  } finally {
    client.release();
  }
});

router.post("/:id/refuser", authenticate, isPlatformAdmin, async (req, res, next) => {
  try {
    const d = await charger(parseId(req.params.id));
    await db.query(
      "UPDATE school_requests SET status = 'rejected', decision_reason = $2, decided_at = NOW() WHERE id = $1",
      [d.id, texte((req.body || {}).motif, 500) || null]
    );
    res.json({ success: true, message: "Demande refusée" });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
