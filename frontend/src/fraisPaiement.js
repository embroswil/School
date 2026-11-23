// Montant a envoyer pour un paiement direct (meme calcul que le serveur : backend/src/utils/frais-paiement.js)
// Frais de retrait 1 % (fixe) et frais de service 200 FCFA (pour l'etablissement), en plus des frais de scolarite.
const TAUX_RETRAIT = 0.01
const FRAIS_SERVICE = 200
const auDessus5 = (n) => Math.ceil(n / 5) * 5

export function fraisPaiementDirect(montant) {
  const m = Math.max(0, Math.round(Number(String(montant ?? '').replace(/\s/g, '')) || 0))
  const service = FRAIS_SERVICE
  const net = m + service
  const retrait = net ? auDessus5(Math.ceil(net / (1 - TAUX_RETRAIT)) - net) : 0
  return { montant: m, fraisService: service, fraisRetrait: retrait, total: net + retrait }
}
