// utils/ia.js
// Lecture de documents (photos, scans, textes) par l'IA d'Anthropic.
// Necessite ANTHROPIC_API_KEY sur Render (ANTHROPIC_MODEL facultatif).
const ApiError = require("./ApiError");

/** images : data URLs ; texte : contenu deja extrait (Excel, PDF texte). Renvoie l'objet JSON produit. */
const lireDocument = async ({ images = [], texte = "", consigne }) => {
  const cle = process.env.ANTHROPIC_API_KEY;
  if (!cle) throw new ApiError(503, "La lecture automatique des documents n'est pas encore activée (clé ANTHROPIC_API_KEY manquante)");
  const blocs = [];
  for (const img of images.slice(0, 8)) {
    const m = String(img).match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/);
    if (!m) throw new ApiError(400, "Image invalide");
    blocs.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[3] } });
  }
  if (texte) blocs.push({ type: "text", text: `Contenu du document :\n${String(texte).slice(0, 60000)}` });
  if (!blocs.length) throw new ApiError(400, "Aucun document à lire");
  blocs.push({ type: "text", text: `${consigne}\nRéponds UNIQUEMENT avec un JSON valide, sans texte autour.` });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": cle, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: 8000, messages: [{ role: "user", content: blocs }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(502, j?.error?.message || "Le service de lecture ne répond pas");
  const sortie = (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
  try {
    return JSON.parse(sortie.replace(/```json|```/g, "").trim());
  } catch {
    throw new ApiError(422, "Le document n'a pas pu être lu. Essayez une photo plus nette, prise de face et bien éclairée.");
  }
};

// Comparaison de noms sans accents ni majuscules
const normaliser = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

module.exports = { lireDocument, normaliser };
