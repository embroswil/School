// modules/codes/routes.js
// Codes a 6 chiffres envoyes par WhatsApp (si configure et si le compte a un numero),
// sinon par email :
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
const WA = require("../../utils/whatsapp");

const DUREE = { verification: 30, reinitialisation: 15 }; // minutes
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normaliser = (e) => String(e || "").trim().toLowerCase();
const nouveauCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, "0");

const compteParEmail = async (email) =>
  (
    await db.query(
      "SELECT id, email, phone, first_name, email_verifie, telephone_verifie, is_active FROM users WHERE email = $1 AND email NOT LIKE '%@inscrit.school'",
      [email]
    )
  ).rows[0] || null;
// Compte retrouve par son email OU son numero de telephone
const compteParIdentifiant = async (identifiant) => {
  const v = String(identifiant || "").trim();
  if (v.includes("@")) return compteParEmail(normaliser(v));
  const tel = WA.normaliserTel(v);
  if (!tel) return null;
  return (
    (
      await db.query(
        `SELECT id, email, phone, first_name, email_verifie, telephone_verifie, is_active FROM users
         WHERE right(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g'), 9) = right($1, 9) AND email NOT LIKE '%@inscrit.school'
         ORDER BY is_active DESC, id DESC LIMIT 1`,
        [tel]
      )
    ).rows[0] || null
  );
};
const emailReel = (e) => Boolean(e) && !/@(inscrit|tel)\.school$/.test(e);

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
  // Canal : WhatsApp en priorite (si configure et numero valide), sinon email
  const tel = WA.configure() ? WA.normaliserTel(u.phone) : null;
  let canal = tel ? "whatsapp" : emailReel(u.email) ? "email" : null;
  if (!canal) throw new ApiError(400, "Aucun moyen d’envoyer le code : ajoutez un email ou un numéro WhatsApp");
  await db.query("UPDATE codes_email SET utilise = true WHERE user_id = $1 AND type = $2 AND NOT utilise", [u.id, type]);
  const ins = await db.query(
    `INSERT INTO codes_email (user_id, type, code_hash, expire_le, canal) VALUES ($1, $2, $3, NOW() + ($4 || ' minutes')::interval, $5) RETURNING id`,
    [u.id, type, await bcrypt.hash(code, 8), String(DUREE[type]), canal]
  );
  if (canal === "whatsapp") {
    try {
      await WA.envoyerCodeWhatsApp(tel, code);
      return { canal, destination: WA.masquer(tel) };
    } catch (e) {
      if (!emailReel(u.email)) throw new ApiError(502, "Le code n’a pas pu être envoyé sur WhatsApp. Vérifiez le numéro et réessayez.");
      canal = "email"; // repli sur l'email
      await db.query("UPDATE codes_email SET canal = 'email' WHERE id = $1", [ins.rows[0].id]);
    }
  }
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
  return { canal: "email", destination: u.email };
};

// Verifie un code ; le marque utilise si correct (5 essais au maximum)
const verifierCode = async (u, type, code) => {
  const { rows } = await db.query(
    `SELECT id, code_hash, tentatives, canal FROM codes_email
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
  // Le code prouve le moyen par lequel il a ete recu
  await db.query(c.canal === "whatsapp" ? "UPDATE users SET telephone_verifie = true WHERE id = $1" : "UPDATE users SET email_verifie = true WHERE id = $1", [u.id]);
  return c.canal;
};

// POST /api/codes/verification/envoyer { email }
router.post("/verification/envoyer", async (req, res, next) => {
  try {
    const u = await compteParIdentifiant(req.body?.email || req.body?.telephone);
    let envoi = null;
    if (u && !u.email_verifie && !u.telephone_verifie) envoi = await envoyerCode(u, "verification");
    res.json({ success: true, data: envoi, message: "Si un compte non vérifié existe, un code vient d'être envoyé." });
  } catch (e) {
    next(e);
  }
});

// POST /api/codes/verification/confirmer { email, code }
router.post("/verification/confirmer", async (req, res, next) => {
  try {
    const u = await compteParIdentifiant(req.body?.email || req.body?.telephone);
    if (!u) throw new ApiError(400, "Code incorrect");
    if (u.email_verifie || u.telephone_verifie) return res.json({ success: true, message: "Compte déjà confirmé" });
    const canal = await verifierCode(u, "verification", req.body?.code);
    res.json({ success: true, message: canal === "whatsapp" ? "Numéro WhatsApp confirmé" : "Adresse email confirmée" });
  } catch (e) {
    next(e);
  }
});

// POST /api/codes/mot-de-passe/envoyer { email }
router.post("/mot-de-passe/envoyer", async (req, res, next) => {
  try {
    const id = String(req.body?.email || req.body?.telephone || "").trim();
    if (!EMAIL_RE.test(id) && !WA.normaliserTel(id)) throw new ApiError(400, "Indiquez votre email ou votre numéro de téléphone");
    const u = await compteParIdentifiant(id);
    let envoi = null;
    if (u && u.is_active) envoi = await envoyerCode(u, "reinitialisation").catch(() => null);
    // Meme reponse dans tous les cas : on ne revele pas l'existence d'un compte
    res.json({ success: true, data: envoi ? { canal: envoi.canal } : null, message: "Si un compte existe, un code vient de lui être envoyé (WhatsApp ou email)." });
  } catch (e) {
    next(e);
  }
});

// POST /api/codes/mot-de-passe/changer { email, code, motDePasse }
router.post("/mot-de-passe/changer", async (req, res, next) => {
  try {
    const mdp = String(req.body?.motDePasse || "");
    if (mdp.length < 8 || mdp.length > 72) throw new ApiError(400, "Mot de passe : 8 caractères minimum");
    const u = await compteParIdentifiant(req.body?.email || req.body?.telephone);
    if (!u) throw new ApiError(400, "Code incorrect");
    await verifierCode(u, "reinitialisation", req.body?.code);
    await db.query("UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1", [
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
