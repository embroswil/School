// code128.js
// Code-barres Code 128 (jeu B) du numero de recu : lisible par les lecteurs de code-barres des guichets.
const MOTIFS = ['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'] // prettier-ignore

/** Barres du code-barres : liste de [debut, largeur] en modules, et largeur totale (marges comprises). */
export function code128(texte) {
  const valeurs = [...String(texte)].map((c) => Math.min(94, Math.max(0, c.charCodeAt(0) - 32)))
  let somme = 104
  valeurs.forEach((v, i) => (somme += v * (i + 1)))
  const suite = [104, ...valeurs, somme % 103, 106]
  const barres = []
  let x = 10 // marge de silence
  for (const v of suite) {
    const m = MOTIFS[v]
    for (let i = 0; i < m.length; i++) {
      const w = Number(m[i])
      if (i % 2 === 0) barres.push([x, w])
      x += w
    }
  }
  return { barres, largeur: x + 10 }
}

/** Code-barres en SVG (chaine). */
export function code128Svg(texte, hauteur = 46) {
  const { barres, largeur } = code128(texte)
  const d = barres.map(([x, w]) => `M${x} 0h${w}v${hauteur}h-${w}z`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largeur} ${hauteur}" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="${largeur}" height="${hauteur}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`
}

// ---------------------------------------------------------------- lecture (camera)
const INDEX = new Map(MOTIFS.map((m, i) => [m, i]))

// Largeurs (en modules) d'un groupe de runs normalise sur `modules` modules
function normaliser(runs, modules) {
  const total = runs.reduce((a, b) => a + b, 0)
  const u = total / modules
  return runs.map((r) => Math.max(1, Math.min(4, Math.round(r / u)))).join('')
}

// Decode une suite de runs alternes commencant par un espace (indices impairs = barres)
function decoderRuns(runs) {
  for (let s = 1; s + 6 <= runs.length; s += 2) {
    const debut = runs.slice(s, s + 6)
    if (normaliser(debut, 11) !== MOTIFS[104]) continue
    const u = debut.reduce((a, b) => a + b, 0) / 11
    if (runs[s - 1] < u * 4) continue // marge blanche avant le code
    const valeurs = []
    let p = s + 6
    let ok = false
    while (p + 6 <= runs.length && valeurs.length < 60) {
      if (p + 7 <= runs.length && normaliser(runs.slice(p, p + 7), 13) === MOTIFS[106]) {
        ok = true
        break
      }
      const v = INDEX.get(normaliser(runs.slice(p, p + 6), 11))
      if (v === undefined || v > 105) break
      valeurs.push(v)
      p += 6
    }
    if (!ok || valeurs.length < 2) continue
    const controle = valeurs.pop()
    let somme = 104
    valeurs.forEach((v, i) => (somme += v * (i + 1)))
    if (somme % 103 !== controle || valeurs.some((v) => v > 94)) continue
    return valeurs.map((v) => String.fromCharCode(v + 32)).join('')
  }
  return null
}

// Minimum et maximum glissants (fenetre de 2r+1 pixels), en temps lineaire
function extremes(l, r) {
  const n = l.length
  const mn = new Uint8Array(n)
  const mx = new Uint8Array(n)
  const qa = new Int32Array(n)
  const qb = new Int32Array(n)
  let ha = 0
  let ta = 0
  let hb = 0
  let tb = 0
  for (let j = 0; j < n + r; j++) {
    if (j < n) {
      while (ta > ha && l[qa[ta - 1]] >= l[j]) ta--
      qa[ta++] = j
      while (tb > hb && l[qb[tb - 1]] <= l[j]) tb--
      qb[tb++] = j
    }
    const i = j - r
    if (i < 0) continue
    while (qa[ha] < i - r) ha++
    while (qb[hb] < i - r) hb++
    mn[i] = l[qa[ha]]
    mx[i] = l[qb[hb]]
  }
  return { mn, mx }
}

// Runs d'une ligne de pixels (0 = noir … 255 = blanc) ; le premier run est un espace.
// Seuil local : milieu entre le plus sombre et le plus clair autour du pixel ; sans contraste = blanc.
function runsLigne(ligne, r) {
  const { mn, mx } = extremes(ligne, r)
  const runs = [0]
  let noirPrec = false
  let contraste = false
  for (let i = 0; i < ligne.length; i++) {
    const ecart = mx[i] - mn[i]
    if (ecart > 40) contraste = true
    const noir = ecart > 40 && ligne[i] < (mn[i] + mx[i]) / 2
    if (noir === noirPrec) runs[runs.length - 1]++
    else {
      runs.push(1)
      noirPrec = noir
    }
  }
  return contraste ? runs : []
}

/** Cherche un code-barres Code 128 dans une image en niveaux de gris (tableau / largeur / hauteur). */
export function lireCode128(gris, largeur, hauteur) {
  const lignes = 20
  for (let k = 0; k < lignes; k++) {
    const y = Math.round(hauteur * (0.15 + (0.7 * k) / (lignes - 1)))
    const ligne = gris.subarray(y * largeur, (y + 1) * largeur)
    for (const l of [ligne, Uint8Array.from(ligne).reverse()]) {
      // plusieurs fenetres : le code peut etre plus ou moins grand dans l'image
      for (const r of [Math.max(6, Math.round(largeur / 90)), Math.max(10, Math.round(largeur / 45))]) {
        const runs = runsLigne(l, r)
        if (runs.length < 20) continue
        const t = decoderRuns(runs)
        if (t) return t
      }
    }
  }
  return null
}
