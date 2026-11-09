// classes.js
// Ordre naturel des classes : 6e, 5e, 4e, 3e, 2nde, 1ère, Tle (systeme francophone),
// Form 1 a 5, Lower Sixth, Upper Sixth (systeme anglophone), primaire et maternelle.
const RANGS = [
  [/^(petite|ps)\b/i, 1],
  [/^(moyenne|ms)\b/i, 2],
  [/^(grande|gs)\b/i, 3],
  [/^(nursery)\s*1/i, 1],
  [/^(nursery)\s*2/i, 2],
  [/^sil\b/i, 11],
  [/^cp\b/i, 12],
  [/^ce\s*1\b/i, 13],
  [/^ce\s*2\b/i, 14],
  [/^cm\s*1\b/i, 15],
  [/^cm\s*2\b/i, 16],
  [/^class\s*(\d)/i, (m) => 10 + Number(m[1])],
  [/^6\s*(e|è|ème)\b/i, 21],
  [/^5\s*(e|è|ème)\b/i, 22],
  [/^4\s*(e|è|ème)\b/i, 23],
  [/^3\s*(e|è|ème)\b/i, 24],
  [/^(2\s*nde?|seconde|2e)\b/i, 25],
  [/^(1\s*(ère|re|ere)|premi)/i, 26],
  [/^(t\s*le|term)/i, 27],
  [/^form\s*(\d)/i, (m) => 20 + Number(m[1])],
  [/^lower\s*six/i, 26],
  [/^upper\s*six/i, 27],
]

/** Rang d'une classe (plus petit = plus jeune). Les noms inconnus vont a la fin. */
export function rangClasse(nom) {
  const n = String(nom || '').trim()
  for (const [motif, rang] of RANGS) {
    const m = n.match(motif)
    if (m) return typeof rang === 'function' ? rang(m) : rang
  }
  return 99
}

/** Niveau a afficher pour regrouper (« 6e », « 2nde », « Tle », « Form 1 »…). */
export function niveauClasse(nom) {
  const n = String(nom || '').trim()
  const m = n.match(/^(form\s*\d|lower\s*sixth?|upper\s*sixth?|class\s*\d|\S+)/i)
  return m ? m[1].replace(/\s+/g, ' ') : n
}

/** Compare deux noms de classe dans l'ordre naturel (niveau, puis serie et numero). */
export function comparerClasses(a, b) {
  const d = rangClasse(a) - rangClasse(b)
  if (d) return d
  return String(a || '').localeCompare(String(b || ''), 'fr', { numeric: true, sensitivity: 'base' })
}

/** Trie une liste d'objets selon le nom de classe (par defaut l.name). */
export const trierClasses = (liste, nom = (l) => l.name) => [...(liste || [])].sort((a, b) => comparerClasses(nom(a), nom(b)))
