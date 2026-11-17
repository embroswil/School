// pdf-recu.js
// Recu de scolarite en PDF (format A5), fabrique dans le navigateur sans bibliotheque :
// polices standard Helvetica, QR code vectoriel, photo de l'etablissement si c'est un JPEG.
import { qrModules } from './qr.js'

// Largeurs des caracteres (1/1000 em), Helvetica et Helvetica-Bold, codes 32 a 126
const L_N = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584] // prettier-ignore
const L_G = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584] // prettier-ignore
// caracteres hors ASCII : code WinAnsi
const WIN = { '›': 0x9b, '‹': 0x8b, '’': 0x92, '‘': 0x91, '“': 0x93, '”': 0x94, '–': 0x96, '—': 0x97, '…': 0x85, '€': 0x80, '·': 0xb7, '«': 0xab, '»': 0xbb, '°': 0xb0 }
const sansAccent = (c) => c.normalize('NFD').replace(/[̀-ͯ]/g, '')

function octets(t) {
  const r = []
  for (const c of String(t).replace(/[   ]/g, ' ')) {
    const k = c.charCodeAt(0)
    if (WIN[c]) r.push(WIN[c])
    else if (k < 256) r.push(k)
    else r.push(sansAccent(c).charCodeAt(0) < 128 ? sansAccent(c).charCodeAt(0) : 63)
  }
  return r
}
function largeur(t, gras, taille) {
  const tab = gras ? L_G : L_N
  let w = 0
  for (const c of String(t).replace(/[   ]/g, ' ')) {
    const k = c.charCodeAt(0)
    const base = k >= 32 && k < 127 ? k : sansAccent(c).charCodeAt(0)
    w += base >= 32 && base < 127 ? tab[base - 32] : c === '–' ? 556 : c === '—' ? 1000 : 300
  }
  return (w * taille) / 1000
}
const echapper = (b) => b.map((x) => (x === 40 || x === 41 || x === 92 ? `\\${String.fromCharCode(x)}` : x < 32 || x > 126 ? `\\${x.toString(8).padStart(3, '0')}` : String.fromCharCode(x))).join('')
const couleur = (hex) => [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ')

// Dimensions d'un JPEG (marqueur SOF)
function tailleJpeg(b) {
  let i = 2
  while (i < b.length) {
    if (b[i] !== 0xff) return null
    const m = b[i + 1]
    const n = (b[i + 2] << 8) + b[i + 3]
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: (b[i + 5] << 8) + b[i + 6], w: (b[i + 7] << 8) + b[i + 8], comp: b[i + 9] }
    i += 2 + n
  }
  return null
}

/** Construit le PDF du recu. r : donnees du recu ; lignes : [libelle, valeur] ; logo : Uint8Array JPEG ou null. */
export function pdfRecu({ ecole, ville, numero, montant, montantLettres, lignes, situation, lien, code, logo, mentions, libelles = {} }) {
  const L = { titre: 'REÇU DE PAIEMENT', montant: 'MONTANT REÇU', paye: 'PAYÉ', verifiable: 'Reçu vérifiable', code: 'Code :', ...libelles }
  const W = 420
  const H = 595
  const M = 30
  let c = ''
  const texte = (t, x, y, { taille = 10, gras = false, italique = false, teinte = '#0f1a3c', droite = false } = {}) => {
    const px = droite ? x - largeur(t, gras, taille) : x
    c += `BT /${gras ? 'F2' : italique ? 'F3' : 'F1'} ${taille} Tf ${couleur(teinte)} rg ${px.toFixed(2)} ${(H - y).toFixed(2)} Td (${echapper(octets(t))}) Tj ET\n`
  }
  const rect = (x, y, w, h, teinte) => (c += `${couleur(teinte)} rg ${x} ${(H - y - h).toFixed(2)} ${w} ${h} re f\n`)
  const trait = (x1, y1, x2, y2, teinte, ep = 0.6) => (c += `${couleur(teinte)} RG ${ep} w ${x1} ${(H - y1).toFixed(2)} m ${x2} ${(H - y2).toFixed(2)} l S\n`)
  const couper = (t, max, taille, gras) => {
    const mots = String(t).split(' ')
    const res = []
    let l = ''
    for (const m of mots) {
      const essai = l ? `${l} ${m}` : m
      if (largeur(essai, gras, taille) > max && l) {
        res.push(l)
        l = m
      } else l = essai
    }
    if (l) res.push(l)
    return res
  }

  // en-tete
  let image = null
  if (logo) {
    const t = tailleJpeg(logo)
    if (t && (t.comp === 3 || t.comp === 1)) image = { ...t, data: logo }
  }
  if (image) {
    // recadrage carre au centre
    const cote = 40
    const s = cote / Math.min(image.w, image.h)
    const w = image.w * s
    const h = image.h * s
    c += `q ${M} ${H - M - cote} ${cote} ${cote} re W n ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${(M - (w - cote) / 2).toFixed(2)} ${(H - M - cote - (h - cote) / 2).toFixed(2)} cm /Im1 Do Q\n`
  } else {
    rect(M, M, 40, 40, '#2446d8')
    texte(String(ecole || '?').charAt(0).toUpperCase(), M + 20 - largeur(String(ecole || '?').charAt(0).toUpperCase(), true, 20) / 2, M + 28, { taille: 20, gras: true, teinte: '#ffffff' })
  }
  const nomL = couper(ecole, 170, 12, true)
  nomL.slice(0, 2).forEach((l, i) => texte(l, M + 50, M + 14 + i * 14, { taille: 12, gras: true }))
  if (ville) texte(ville, M + 50, M + 16 + Math.min(nomL.length, 2) * 14, { taille: 9, teinte: '#5b6478' })
  texte(L.titre, W - M, M + 14, { taille: 10, gras: true, teinte: '#2446d8', droite: true })
  texte(`N° ${numero}`, W - M, M + 28, { taille: 9, teinte: '#5b6478', droite: true })
  trait(M, M + 56, W - M, M + 56, '#2446d8', 1.6)

  // montant
  let y = M + 70
  rect(M, y, W - 2 * M, 74, '#f3f6ff')
  texte(L.montant, M + 14, y + 18, { taille: 8, gras: true, teinte: '#5b6478' })
  texte(montant, M + 14, y + 42, { taille: 22, gras: true })
  couper(montantLettres, 230, 8.5, false).slice(0, 2).forEach((l, i) => texte(l, M + 14, y + 57 + i * 10, { taille: 8.5, italique: true, teinte: '#3d465a' }))
  // tampon PAYE
  const cx = W - M - 52
  const cy = H - (y + 37)
  c += `q 0.966 0.259 -0.259 0.966 ${cx} ${cy} cm ${couleur('#12b76a')} RG 2.2 w -34 -13 68 26 re S BT /F2 15 Tf ${couleur('#12b76a')} rg ${(-largeur(L.paye, true, 15) / 2).toFixed(2)} -5.5 Td (${echapper(octets(L.paye))}) Tj ET Q\n`

  // lignes
  y += 92
  for (const [k, v] of lignes) {
    texte(k, M, y, { taille: 9.5, teinte: '#5b6478' })
    texte(String(v), W - M, y, { taille: 9.5, gras: true, droite: true })
    trait(M, y + 7, W - M, y + 7, '#e3e7f0')
    y += 21
  }

  // situation
  y += 4
  const n = situation.length
  const gap = 6
  const bw = (W - 2 * M - gap * (n - 1)) / n
  situation.forEach(([k, v], i) => {
    const x = M + i * (bw + gap)
    c += `${couleur('#e3e7f0')} RG 0.8 w ${x.toFixed(2)} ${(H - y - 36).toFixed(2)} ${bw.toFixed(2)} 36 re S\n`
    texte(k, x + 8, y + 13, { taille: 7.5, teinte: '#5b6478' })
    texte(v, x + 8, y + 28, { taille: 10.5, gras: true })
  })
  y += 52

  // pied : QR code et verification
  c += `${couleur('#cfd5e3')} RG 0.6 w [3 3] 0 d ${M} ${(H - y).toFixed(2)} m ${W - M} ${(H - y).toFixed(2)} l S [] 0 d\n`
  y += 12
  const q = qrModules(lien)
  const cote = 92
  const mod = cote / q.length
  rect(M, y, cote, cote, '#ffffff')
  let chemin = ''
  q.forEach((ligne, j) =>
    ligne.forEach((noir, i) => {
      if (noir) chemin += `${(M + i * mod).toFixed(2)} ${(H - y - (j + 1) * mod).toFixed(2)} ${mod.toFixed(3)} ${mod.toFixed(3)} re `
    }),
  )
  c += `0 0 0 rg ${chemin}f\n`
  const tx = M + cote + 14
  const tw = W - M - tx
  let ty = y + 10
  texte(L.verifiable, tx, ty, { taille: 10, gras: true })
  ty += 13
  for (const l of couper(mentions.verifier, tw, 8, false)) {
    texte(l, tx, ty, { taille: 8, teinte: '#5b6478' })
    ty += 10
  }
  ty += 4
  texte(L.code, tx, ty, { taille: 9.5 })
  texte(code, tx + largeur(`${L.code} `, false, 9.5), ty, { taille: 11, gras: true })
  ty += 14
  for (const l of couper(mentions.emis, tw, 7.5, false)) {
    texte(l, tx, ty, { taille: 7.5, teinte: '#5b6478' })
    ty += 9.5
  }

  // assemblage du fichier
  const morceaux = []
  const positions = []
  let longueur = 0
  const ajouter = (x) => {
    const b = typeof x === 'string' ? Uint8Array.from([...x].map((ch) => ch.charCodeAt(0) & 0xff)) : x
    morceaux.push(b)
    longueur += b.length
  }
  const objet = (num, corps, flux) => {
    positions[num] = longueur
    ajouter(`${num} 0 obj\n${corps}\n`)
    if (flux) {
      ajouter('stream\n')
      ajouter(flux)
      ajouter('\nendstream\n')
    }
    ajouter('endobj\n')
  }
  const contenu = Uint8Array.from([...c].map((ch) => ch.charCodeAt(0) & 0xff))
  ajouter('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
  objet(1, '<< /Type /Catalog /Pages 2 0 R >>')
  objet(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  objet(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >>${image ? ' /XObject << /Im1 8 0 R >>' : ''} >> >>`)
  objet(4, `<< /Length ${contenu.length} >>`, contenu)
  objet(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  objet(6, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
  objet(7, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>')
  if (image) objet(8, `<< /Type /XObject /Subtype /Image /Width ${image.w} /Height ${image.h} /ColorSpace /${image.comp === 1 ? 'DeviceGray' : 'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.data.length} >>`, image.data)
  const nb = image ? 9 : 8
  const xref = longueur
  let table = `xref\n0 ${nb}\n0000000000 65535 f \n`
  for (let i = 1; i < nb; i++) table += `${String(positions[i]).padStart(10, '0')} 00000 n \n`
  ajouter(table)
  ajouter(`trailer\n<< /Size ${nb} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  return new Blob(morceaux, { type: 'application/pdf' })
}
