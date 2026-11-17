// qr.js
// Generateur de QR code (mode octets, correction d'erreur niveau M, versions 1 a 10), sans dependance.
// D'apres l'algorithme de la norme ISO/IEC 18004 (methode de Project Nayuki).
// qrModules(texte) -> tableau carre de booleens (true = module noir).

const ECC_PAR_BLOC = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26] // niveau M, versions 1 a 10
const NB_BLOCS = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5]

const modulesBruts = (v) => {
  let r = (16 * v + 128) * v + 64
  if (v >= 2) {
    const n = Math.floor(v / 7) + 2
    r -= (25 * n - 10) * n - 55
    if (v >= 7) r -= 36
  }
  return r
}
const codewordsDonnees = (v) => Math.floor(modulesBruts(v) / 8) - ECC_PAR_BLOC[v - 1] * NB_BLOCS[v - 1]

// Reed-Solomon sur GF(256), polynome 0x11D
const mul = (x, y) => {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z & 0xff
}
const diviseur = (degre) => {
  const r = new Array(degre).fill(0)
  r[degre - 1] = 1
  let racine = 1
  for (let i = 0; i < degre; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = mul(r[j], racine)
      if (j + 1 < r.length) r[j] ^= r[j + 1]
    }
    racine = mul(racine, 0x02)
  }
  return r
}
const reste = (donnees, div) => {
  const r = div.map(() => 0)
  for (const b of donnees) {
    const f = b ^ r.shift()
    r.push(0)
    div.forEach((c, i) => (r[i] ^= mul(c, f)))
  }
  return r
}

const positionsAlignement = (v) => {
  if (v === 1) return []
  const n = Math.floor(v / 7) + 2
  const pas = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2
  const r = [6]
  for (let p = v * 4 + 10; r.length < n; p -= pas) r.splice(1, 0, p)
  return r
}

export function qrModules(texte) {
  const octets = [...new TextEncoder().encode(String(texte))]
  // plus petite version qui contient le texte
  let v = 1
  for (; v <= 10; v++) if (4 + (v < 10 ? 8 : 16) + octets.length * 8 <= codewordsDonnees(v) * 8) break
  if (v > 10) throw new Error('Texte trop long pour le QR code')
  // bits : mode octets, longueur, donnees, terminaison, remplissage
  const bits = []
  const ajouter = (val, n) => {
    for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1)
  }
  ajouter(4, 4)
  ajouter(octets.length, v < 10 ? 8 : 16)
  octets.forEach((b) => ajouter(b, 8))
  const capacite = codewordsDonnees(v) * 8
  ajouter(0, Math.min(4, capacite - bits.length))
  ajouter(0, (8 - (bits.length % 8)) % 8)
  for (let pad = 0xec; bits.length < capacite; pad ^= 0xec ^ 0x11) ajouter(pad, 8)
  const donnees = []
  for (let i = 0; i < bits.length; i += 8) donnees.push(parseInt(bits.slice(i, i + 8).join(''), 2))

  // blocs, codes de correction, entrelacement
  const nbBlocs = NB_BLOCS[v - 1]
  const eccLen = ECC_PAR_BLOC[v - 1]
  const total = Math.floor(modulesBruts(v) / 8)
  const nbCourts = nbBlocs - (total % nbBlocs)
  const longCourt = Math.floor(total / nbBlocs)
  const div = diviseur(eccLen)
  const blocs = []
  for (let i = 0, k = 0; i < nbBlocs; i++) {
    const dat = donnees.slice(k, k + longCourt - eccLen + (i < nbCourts ? 0 : 1))
    k += dat.length
    const bloc = dat.concat(reste(dat, div))
    if (i < nbCourts) bloc.splice(longCourt - eccLen, 0, -1)
    blocs.push(bloc)
  }
  const finaux = []
  for (let i = 0; i < blocs[0].length; i++)
    blocs.forEach((b, j) => {
      if (i !== longCourt - eccLen || j >= nbCourts) finaux.push(b[i])
    })

  // matrice
  const t = v * 4 + 17
  const m = Array.from({ length: t }, () => new Array(t).fill(false))
  const fixe = Array.from({ length: t }, () => new Array(t).fill(false))
  const poser = (x, y, noir) => {
    m[y][x] = noir
    fixe[y][x] = true
  }
  for (let i = 0; i < t; i++) {
    poser(6, i, i % 2 === 0)
    poser(i, 6, i % 2 === 0)
  }
  const reperes = (x, y) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy))
        const xx = x + dx
        const yy = y + dy
        if (xx >= 0 && xx < t && yy >= 0 && yy < t) poser(xx, yy, d !== 2 && d !== 4)
      }
  }
  reperes(3, 3)
  reperes(t - 4, 3)
  reperes(3, t - 4)
  const al = positionsAlignement(v)
  al.forEach((a, i) =>
    al.forEach((b, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) poser(a + dx, b + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }),
  )
  const format = (masque) => {
    const d = (0 << 3) | masque // niveau M = 00
    let r = d
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537)
    const b = ((d << 10) | r) ^ 0x5412
    const bit = (i) => ((b >>> i) & 1) !== 0
    for (let i = 0; i <= 5; i++) poser(8, i, bit(i))
    poser(8, 7, bit(6))
    poser(8, 8, bit(7))
    poser(7, 8, bit(8))
    for (let i = 9; i < 15; i++) poser(14 - i, 8, bit(i))
    for (let i = 0; i < 8; i++) poser(t - 1 - i, 8, bit(i))
    for (let i = 8; i < 15; i++) poser(8, t - 15 + i, bit(i))
    poser(8, t - 8, true)
  }
  format(0)
  if (v >= 7) {
    let r = v
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25)
    const b = (v << 12) | r
    for (let i = 0; i < 18; i++) {
      const noir = ((b >>> i) & 1) !== 0
      const a = t - 11 + (i % 3)
      const c = Math.floor(i / 3)
      poser(a, c, noir)
      poser(c, a, noir)
    }
  }
  // donnees en zigzag
  let i = 0
  for (let droite = t - 1; droite >= 1; droite -= 2) {
    if (droite === 6) droite = 5
    for (let vert = 0; vert < t; vert++)
      for (let j = 0; j < 2; j++) {
        const x = droite - j
        const montant = ((droite + 1) & 2) === 0
        const y = montant ? t - 1 - vert : vert
        if (!fixe[y][x] && i < finaux.length * 8) {
          m[y][x] = ((finaux[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0
          i++
        }
      }
  }
  // masque : on garde celui qui donne la plus faible penalite
  const MASQUES = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ]
  const appliquer = (k) => {
    for (let y = 0; y < t; y++) for (let x = 0; x < t; x++) if (!fixe[y][x] && MASQUES[k](x, y)) m[y][x] = !m[y][x]
  }
  const penalite = () => {
    let p = 0
    const lignes = (get) => {
      for (let a = 0; a < t; a++) {
        let serie = 1
        for (let b = 1; b < t; b++) {
          if (get(a, b) === get(a, b - 1)) {
            serie++
            if (serie === 5) p += 3
            else if (serie > 5) p++
          } else serie = 1
        }
        for (let b = 0; b + 10 < t + 1; b++) {
          const s = Array.from({ length: 11 }, (_, k) => (b + k < t ? get(a, b + k) : false))
          const motif = [true, false, true, true, true, false, true]
          const ok1 = motif.every((c, k) => s[k] === c) && s.slice(7, 11).every((c) => !c)
          const ok2 = s.slice(0, 4).every((c) => !c) && motif.every((c, k) => s[k + 4] === c)
          if (ok1 || ok2) p += 40
        }
      }
    }
    lignes((a, b) => m[a][b])
    lignes((a, b) => m[b][a])
    for (let y = 0; y < t - 1; y++) for (let x = 0; x < t - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3
    const noirs = m.flat().filter(Boolean).length
    p += Math.floor(Math.abs(noirs * 20 - t * t * 10) / (t * t)) * 10
    return p
  }
  let meilleur = 0
  let min = Infinity
  for (let k = 0; k < 8; k++) {
    appliquer(k)
    format(k)
    const p = penalite()
    if (p < min) {
      min = p
      meilleur = k
    }
    appliquer(k)
  }
  appliquer(meilleur)
  format(meilleur)
  return m
}

/** QR code en SVG (chaine), avec une marge de 4 modules. */
export function qrSvg(texte, taille = 160) {
  const m = qrModules(texte)
  const n = m.length + 8
  let d = ''
  m.forEach((ligne, y) => ligne.forEach((noir, x) => noir && (d += `M${x + 4} ${y + 4}h1v1h-1z`)))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${taille}" height="${taille}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`
}
