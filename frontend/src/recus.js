// recus.js
// Outils des recus de scolarite : montant en lettres (francais) et lien de verification du QR code.

const UNITES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize']
const DIZAINES = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt']

const moinsDeCent = (n) => {
  if (n <= 16) return UNITES[n]
  if (n < 20) return `dix-${UNITES[n - 10]}`
  const d = Math.floor(n / 10)
  let u = n % 10
  if (d === 7 || d === 9) u += 10
  const base = DIZAINES[d]
  if (u === 0) return d === 8 ? 'quatre-vingts' : base
  if ((u === 1 || u === 11) && d < 8) return `${base} et ${UNITES[u]}`
  return `${base}-${moinsDeCent(u)}`
}
const moinsDeMille = (n, finale = true) => {
  const c = Math.floor(n / 100)
  const r = n % 100
  let t = ''
  if (c) t = c === 1 ? 'cent' : `${UNITES[c]} cent${r === 0 && finale ? 's' : ''}`
  if (r) {
    let m = moinsDeCent(r)
    if (!finale && m === 'quatre-vingts') m = 'quatre-vingt'
    t = t ? `${t} ${m}` : m
  }
  return t
}

/** 125000 -> "cent vingt-cinq mille" */
export function enLettres(montant) {
  let n = Math.round(Math.abs(Number(montant) || 0))
  if (n === 0) return 'zéro'
  const parties = []
  const milliards = Math.floor(n / 1e9)
  n %= 1e9
  const millions = Math.floor(n / 1e6)
  n %= 1e6
  const milliers = Math.floor(n / 1000)
  const reste = n % 1000
  if (milliards) parties.push(`${moinsDeMille(milliards)} milliard${milliards > 1 ? 's' : ''}`)
  if (millions) parties.push(`${moinsDeMille(millions)} million${millions > 1 ? 's' : ''}`)
  if (milliers) parties.push(milliers === 1 ? 'mille' : `${moinsDeMille(milliers, false)} mille`)
  if (reste) parties.push(moinsDeMille(reste))
  return parties.join(' ')
}

const EN_U = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const EN_D = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const enCent = (n) => {
  const c = Math.floor(n / 100)
  const r = n % 100
  const d = r < 20 ? EN_U[r] : `${EN_D[Math.floor(r / 10)]}${r % 10 ? `-${EN_U[r % 10]}` : ''}`
  return [c ? `${EN_U[c]} hundred` : '', r ? d : ''].filter(Boolean).join(' ')
}
/** 125000 -> "one hundred twenty-five thousand" */
export function inWords(montant) {
  let n = Math.round(Math.abs(Number(montant) || 0))
  if (n === 0) return 'zero'
  const p = []
  for (const [v, mot] of [
    [1e9, 'billion'],
    [1e6, 'million'],
    [1e3, 'thousand'],
  ]) {
    if (n >= v) {
      p.push(`${enCent(Math.floor(n / v))} ${mot}`)
      n %= v
    }
  }
  if (n) p.push(enCent(n))
  return p.join(' ')
}

/** Adresse ouverte par le QR code du recu (page publique de verification). */
export const lienVerification = (numero, code) => `${window.location.origin}${window.location.pathname}#/verifier/${encodeURIComponent(numero)}?c=${code}`

export const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`
export const MODES_PAIEMENT = { mobile_money: 'Mobile Money', orange_money: 'Orange Money', mtn_momo: 'MTN MoMo', especes: 'Espèces', banque: 'Banque', autre: 'Autre' }
