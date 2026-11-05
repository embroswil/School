// utils/webpush.js
// Notifications « push » (ecran verrouille du telephone), sans dependance externe :
// signature VAPID (RFC 8292) et chiffrement du message aes128gcm (RFC 8291).
// Variables Render : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…).
const crypto = require("crypto");

const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deB64u = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");
const hmac = (cle, donnees) => crypto.createHmac("sha256", cle).update(donnees).digest();

const configuree = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
const clePublique = () => process.env.VAPID_PUBLIC_KEY || "";

// Jeton VAPID (JWT ES256) pour le service de push du navigateur
let cleSignature = null;
const jetonVapid = (audience) => {
  if (!cleSignature) {
    const pub = deB64u(process.env.VAPID_PUBLIC_KEY);
    cleSignature = crypto.createPrivateKey({
      key: { kty: "EC", crv: "P-256", d: process.env.VAPID_PRIVATE_KEY, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
      format: "jwk",
    });
  }
  const entete = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const corps = b64u(
    JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: process.env.VAPID_SUBJECT || "mailto:contact@school.cm" })
  );
  const signature = crypto.sign("sha256", Buffer.from(`${entete}.${corps}`), { key: cleSignature, dsaEncoding: "ieee-p1363" });
  return `${entete}.${corps}.${b64u(signature)}`;
};

// Chiffrement du message pour un abonnement (cles p256dh et auth du navigateur)
const chiffrer = (abonnement, texte) => {
  const uaPublic = deB64u(abonnement.p256dh);
  const auth = deB64u(abonnement.auth);
  const ecdh = crypto.createECDH("prime256v1");
  const asPublic = ecdh.generateKeys();
  const secret = ecdh.computeSecret(uaPublic);
  const prkCle = hmac(auth, secret);
  const ikm = hmac(prkCle, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])])).subarray(0, 32);
  const sel = crypto.randomBytes(16);
  const prk = hmac(sel, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: aes128gcm\0"), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: nonce\0"), Buffer.from([1])])).subarray(0, 12);
  const chiffre = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const contenu = Buffer.concat([chiffre.update(Buffer.concat([Buffer.from(texte), Buffer.from([2])])), chiffre.final(), chiffre.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([sel, rs, Buffer.from([asPublic.length]), asPublic, contenu]);
};

/** Envoie une notification. Renvoie le code HTTP (404 / 410 : abonnement expire, a supprimer). */
const envoyer = async (abonnement, message) => {
  const url = new URL(abonnement.endpoint);
  const r = await fetch(abonnement.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jetonVapid(url.origin)}, k=${clePublique()}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "high",
    },
    body: chiffrer(abonnement, JSON.stringify(message)),
  });
  return r.status;
};

module.exports = { configuree, clePublique, envoyer, chiffrer, b64u, deB64u };
