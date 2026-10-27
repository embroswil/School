// utils/email.js
// Envoi d'emails par l'API Brevo (variables BREVO_API_KEY et EMAIL_FROM sur Render).
// Sans cle Brevo, l'email n'est pas envoye : son contenu est ecrit dans les journaux.
const logger = require("./logger");

const expediteur = () => {
  const brut = process.env.EMAIL_FROM || "School <school@1hemall.site>";
  const m = brut.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  return m ? { name: m[1] || "School", email: m[2] } : { name: "School", email: brut.trim() };
};

const envoyerEmail = async ({ a, nom, sujet, html, texte }) => {
  const cle = process.env.BREVO_API_KEY;
  if (!cle) {
    logger.info(`[email non envoye : BREVO_API_KEY absente] a=${a} sujet="${sujet}" texte="${texte}"`);
    return { envoye: false };
  }
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": cle, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: expediteur(),
      to: [{ email: a, name: nom || a }],
      subject: sujet,
      htmlContent: html,
      textContent: texte,
    }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    logger.error(`Envoi d'email echoue (${r.status}) : ${j.message || ""}`);
    throw new Error("L'email n'a pas pu être envoyé. Réessayez dans un instant.");
  }
  return { envoye: true };
};

// Gabarit : un code a 6 chiffres
const emailCode = ({ prenom, code, titre, intro, minutes }) => ({
  texte: `${titre}\n\nBonjour ${prenom || ""},\n${intro}\n\nVotre code : ${code}\n\nIl est valable ${minutes} minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.\n\nSchool`,
  html: `<!doctype html><html><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#0f1a3c">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e3e8f4">
    <tr><td style="background:#2446d8;padding:20px 24px;color:#ffffff;font-size:22px;font-weight:bold">School<span style="color:#ffb020">.</span></td></tr>
    <tr><td style="padding:24px">
      <h1 style="margin:0 0 12px;font-size:20px">${titre}</h1>
      <p style="margin:0 0 6px;font-size:15px;line-height:1.5">Bonjour ${prenom || ""},</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.5">${intro}</p>
      <div style="text-align:center;margin:0 0 18px">
        <span style="display:inline-block;font-size:34px;letter-spacing:10px;font-weight:bold;background:#e8edff;color:#2446d8;padding:14px 22px;border-radius:14px">${code}</span>
      </div>
      <p style="margin:0;font-size:13px;color:#5d6789;line-height:1.5">Ce code est valable ${minutes} minutes. Si vous n’êtes pas à l’origine de cette demande, ignorez simplement ce message.</p>
    </td></tr>
    <tr><td style="padding:14px 24px;border-top:1px solid #e3e8f4;font-size:12px;color:#5d6789">School by Embroswil · la vie scolaire, simplement</td></tr>
  </table></td></tr></table></body></html>`,
});

module.exports = { envoyerEmail, emailCode };
