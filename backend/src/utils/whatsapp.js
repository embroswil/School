// utils/whatsapp.js
// Codes de verification par WhatsApp (API Cloud de Meta, modele « authentification »).
// Variables Render : WHATSAPP_TOKEN (jeton d'acces), WHATSAPP_PHONE_ID (identifiant du numero),
// WHATSAPP_TEMPLATE (nom du modele, par defaut « code_school »), WHATSAPP_LANGUE (par defaut « fr »),
// WHATSAPP_BOUTON (« non » si le modele n'a pas de bouton « Copier le code »).
const configure = () => Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);

// Numero au format international, chiffres seulement (Cameroun par defaut : 6XXXXXXXX -> 2376XXXXXXXX)
const normaliserTel = (t) => {
  let c = String(t || "").replace(/\D/g, "");
  if (c.startsWith("00")) c = c.slice(2);
  if (c.length === 9 && /^[2-6]/.test(c)) c = `237${c}`;
  return c.length >= 11 && c.length <= 15 ? c : null;
};
const masquer = (t) => {
  const c = String(t || "");
  return c.length > 6 ? `+${c.slice(0, 3)} ${c.slice(3, 4)}•• •• ${c.slice(-4, -2)} ${c.slice(-2)}` : c;
};

// Envoie le code ; leve une erreur si WhatsApp refuse (le code part alors par email, si possible)
const envoyerCodeWhatsApp = async (telephone, code) => {
  const composants = [{ type: "body", parameters: [{ type: "text", text: code }] }];
  if ((process.env.WHATSAPP_BOUTON || "oui") !== "non") {
    composants.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] });
  }
  const r = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: telephone,
      type: "template",
      template: { name: process.env.WHATSAPP_TEMPLATE || "code_school", language: { code: process.env.WHATSAPP_LANGUE || "fr" }, components: composants },
    }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j?.error?.message || `WhatsApp : erreur ${r.status}`);
  }
};

module.exports = { configure, normaliserTel, masquer, envoyerCodeWhatsApp };
