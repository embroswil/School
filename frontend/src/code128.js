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
