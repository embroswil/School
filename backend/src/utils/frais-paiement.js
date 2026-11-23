// utils/frais-paiement.js
// Montant a envoyer pour un paiement direct (Orange Money, MTN MoMo) vers le numero de l'etablissement.
// - Frais de retrait : 1 % (fixe pour toute la plateforme, l'etablissement ne peut pas le changer). Le parent les envoie
//   pour que l'etablissement, une fois l'argent retire, garde exactement les frais de scolarite et le frais de service.
// - Frais de service : 200 FCFA par paiement, entierement pour l'etablissement (pas pour les familles abonnees a Sùkûl).
// Meme calcul cote application (frontend/src/fraisPaiement.js).
const TAUX_RETRAIT = 0.01;
const FRAIS_SERVICE = 200;
const auDessus5 = (n) => Math.ceil(n / 5) * 5;

function fraisPaiementDirect(montant, { abonne = false } = {}) {
  const m = Math.max(0, Math.round(Number(montant) || 0));
  const service = abonne ? 0 : FRAIS_SERVICE;
  const net = m + service; // ce que l'etablissement doit garder apres son retrait
  const retrait = net ? auDessus5(Math.ceil(net / (1 - TAUX_RETRAIT)) - net) : 0;
  return { montant: m, fraisService: service, fraisRetrait: retrait, total: net + retrait };
}

module.exports = { fraisPaiementDirect, TAUX_RETRAIT, FRAIS_SERVICE };
