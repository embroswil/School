// modules/codes/routes.js
// Codes a 6 chiffres envoyes par email :
// - verification de l'adresse email apres l'inscription ;
// - mot de passe oublie (reinitialisation).
// Routes publiques ; les reponses ne revelent jamais si un compte existe.
const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { envoyerEmail, emailCode } = require("../../utils/email");

const DUREE = { verification: 30, reinitialisation: 15 }; // minutes
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normaliser = (e) => String(e || "").trim().toLowerCase();
const nouveauCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, "0");

const compteParEmail = async (email) =>
  (
    await db.query(
      "SELECT id, email, first_name, email_verifie, is_active FROM users WHERE email = $1 AND email NOT LIKE '%@inscrit.school'",
      [email]
    )
  ).rows[0] || null;

// Cree et envoie un code (limite : 1 par minute, 5 par heure)
const envoyerCode = async (u, type) => {
  const recents = await db.query(
    `SELECT COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 minute')::int AS minute,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')::int AS heure
     FROM codes_email WHERE user_id = $1 AND type = $2`,
    [u.id, type]
  );
  if (recents.rows[0].minute > 0) throw new ApiError(429, "Patientez une minute avant de demander un nouveau code");
  if (recents.rows[0].heure >= 5) throw new ApiError(429, "Trop de demandes : réessayez dans une heure");
  const code = nouveauCode();
  await db.query("UPDATE codes_email SET utilise = true WHERE user_id = $1 AND type = $2 AND NOT utilise", [u.id, type]);
  await db.query(
    `INSERT INTO codes_email (user_id, type, code_hash, expire_le) VALUES ($1, $2, $3, NOW() + ($4 || ' minutes')::interval)`,
    [u.id, type, await bcrypt.hash(code, 8), String(DUREE[type])]
  );
  const contenu =
    type === "verification"
      ? emailCode({ prenom: u.first_name, code, minutes: DUREE[type], titre: "Confirmez votre adresse email", intro: "Voici votre code pour confirmer votre adresse email sur School." })
      : emailCode({ prenom: u.first_name, code, minutes: DUREE[type], titre: "Réinitialisation du mot de passe", intro: "Vous avez demandé à changer votre mot de passe School. Voici votre code." });
  await envoyerEmail({
    a: u.email,
    nom: u.first_name,
    sujet: type === "verification" ? `${code} est votre code School` : `Code de réinitialisation School : ${code}`,
    ...contenu,
  });
};

// Verifie un code ; le marque utilise si correct (5 essais au maximum)
const verifierCode = async (u, type, code) => {
  const { rows } = await db.query(
    `SELECT id, code_hash, tentatives FROM codes_email
     WHERE user_id = $1 AND type = $2 AND NOT utilise AND expire_le > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [u.id, type]
  );
  const c = rows[0];
  if (!c) throw new ApiError(400, "Code expiré : demandez un nouveau code");
  if (c.tentatives >= 5) throw new ApiError(400, "Trop d'essais : demandez un nouveau code");
  if (!(await bcrypt.compare(String(code || "").replace(/\s/g, ""), c.code_hash))) {
    await db.query("UPDATE codes_email SET tentatives = tentatives + 1 WHERE id = $1", [c.id]);
    throw new ApiError(400, `Code incorrect (${4 - c.tentatives} essai(s) restant(s))`);
  }
  await db.query("UPDATE codes_email SET utilise = true WHERE id = $1", [c.id]);
};

// POST /api/codes/verification/envoyer { email }
router.post("/verification/envoyer", async (req, res, next) => {
  try {
    const u = await compteParEmail(normaliser(req.body?.email));
    if (u && !u.email_verifie) await envoyerCode(u, "verification");
    res.json({ success: true, message: "Si un compte non vérifié existe avec cet email, un code vient d'être envoyé." });
  } catch (e) {
    next(e);
  }
});

// POST /api/codes/verification/confirmer { email, code }
router.post("/verification/confirmer", async (req, res, next) => {
  try {
    const u = await compteParEmail(normaliser(req.body?.email));
    if (!u) throw new ApiError(400, "Code incorrect");
    if (u.email_verifie) return res.json({ success: true, message: "Adresse email déjà confirmée" });
    await verifierCode(u, "verification", req.body?.code);
    await db.query("UPDATE users SET email_verifie = true, updated_at = NOW() WHERE id = $1", [u.id]);
    res.json({ success: true, message: "Adresse email confirmée" });
  } catch (e) {
    next(e);
  }
});

// POST /api/codes/mot-de-passe/envoyer { email }
router.post("/mot-de-passe/envoyer", async (req, res, next) => {
  try {
    const email = normaliser(req.body?.email);
    if (!EMAIL_RE.test(email)) throw new ApiError(400, "Adresse email invalide");
    const u = await compteParEmail(email);
    if (u && u.is_active) await envoyerCode(u, "reinitialisation");
    // Meme reponse dans tous les cas : on ne revele pas l'existence d'un compte
    res.json({ success: true, message: "Si un compte existe avec cet email, un code vient de lui être envoyé." });
  } catch (e) {
    next(e);
  }
});

// POST /api/codes/mot-de-passe/changer { email, code, motDePasse }
router.post("/mot-de-passe/changer", async (req, res, next) => {
  try {
    const mdp = String(req.body?.motDePasse || "");
    if (mdp.length < 8 || mdp.length > 72) throw new ApiError(400, "Mot de passe : 8 caractères minimum");
    const u = await compteParEmail(normaliser(req.body?.email));
    if (!u) throw new ApiError(400, "Code incorrect");
    await verifierCode(u, "reinitialisation", req.body?.code);
    // Le code recu par email prouve aussi l'adresse
    await db.query("UPDATE users SET password_hash = $2, email_verifie = true, updated_at = NOW() WHERE id = $1", [
      u.id,
      await bcrypt.hash(mdp, 10),
    ]);
    // Deconnexion de tous les appareils
    await db.query("DELETE FROM sessions WHERE user_id = $1", [u.id]);
    res.json({ success: true, message: "Mot de passe modifié : vous pouvez vous connecter." });
  } catch (e) {
    next(e);
  }
});

module.exports = { router, envoyerCode };
