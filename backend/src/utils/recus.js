// utils/recus.js
// Code de verification d'un recu : il prouve que le recu a bien ete emis par Sùkûl
// (le QR code du recu ouvre la page publique de verification avec ce code).
const crypto = require("crypto");
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sans 0/O, 1/I/L

function codeRecu(numero, montant) {
  const h = crypto.createHmac("sha256", String(process.env.JWT_SECRET || "sukul")).update(`${numero}|${Number(montant)}`).digest();
  let code = "";
  for (let i = 0; i < 8; i++) code += ALPHABET[h[i] % ALPHABET.length];
  return code;
}

// Numero du recu d'une commande de la boutique payee (alias c = boutique_commandes), ex. SB-2026-0000001
const SQL_NUMERO_BOUTIQUE = "'SB-' || to_char(c.payee_le, 'YYYY') || '-' || lpad(c.id::text, 7, '0')";

module.exports = { codeRecu, SQL_NUMERO_BOUTIQUE };
