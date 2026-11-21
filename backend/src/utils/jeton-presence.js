// utils/jeton-presence.js
// Jeton joint a la notification « Confirmez votre presence » : il permet de repondre Oui / Non
// directement depuis la notification (ecran verrouille), sans ouvrir Sùkûl ni etre connecte.
// Il ne vaut que pour ce cours, cet enseignant, et jusqu'a la fin de la journee.
const crypto = require("crypto");
const b64 = (s) => Buffer.from(s).toString("base64url");
const signe = (p) => crypto.createHmac("sha256", `presence|${process.env.JWT_SECRET || "sukul"}`).update(p).digest("base64url");

function creerJeton({ teacherId, schoolId, classId, date, debut }) {
  const p = b64(JSON.stringify({ t: teacherId, s: schoolId, c: classId, d: date, h: debut, exp: Date.now() + 18 * 3600 * 1000 }));
  return `${p}.${signe(p)}`;
}

function lireJeton(jeton) {
  const [p, sig] = String(jeton || "").split(".");
  if (!p || !sig) return null;
  const attendu = signe(p);
  if (sig.length !== attendu.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(attendu))) return null;
  try {
    const v = JSON.parse(Buffer.from(p, "base64url").toString());
    return v.exp > Date.now() ? v : null;
  } catch {
    return null;
  }
}

module.exports = { creerJeton, lireJeton };
