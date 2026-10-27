// Lecture d'une liste d'eleves depuis un fichier Excel, CSV, PDF, ou depuis
// des photos / scans (imprimes ou ecrits a la main : lus par l'IA du serveur).
import { api } from './api.js'
// Retourne des lignes { nom, prenom, classe, dateNaissance, sexe, matricule }.

const sansAccent = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

// Reconnaissance des colonnes d'apres l'en-tete
const COLONNES = [
  ['nomsPrenoms', /^(noms? (et|&) prenoms?|nom (et|&) prenoms?|noms? prenoms?|nom complet|eleves?|nom de l.eleve)$/],
  ['nom', /^(noms?|nom de famille|name|last ?name)$/],
  ['prenom', /^(prenoms?|first ?name)$/],
  ['classe', /^(classes?|niveau|division|salle)$/],
  ['dateNaissance', /^(date (de )?naissance|ne\(?e?\)? le|date naiss\.?|dn)$/],
  ['sexe', /^(sexe|genre|s)$/],
  // « N° » seul est souvent le rang dans la liste, pas le matricule
  ['matricule', /^(matricule|n° ?matricule|no ?matricule|numero matricule|identifiant)$/],
]

const detecterEnTete = (lignes) => {
  for (let i = 0; i < Math.min(lignes.length, 15); i++) {
    const map = {}
    lignes[i].forEach((cellule, j) => {
      const c = sansAccent(cellule).replace(/[:.]$/, '')
      for (const [cle, re] of COLONNES) {
        if (map[cle] === undefined && re.test(c)) {
          map[cle] = j
          break
        }
      }
    })
    if (map.nomsPrenoms !== undefined || map.nom !== undefined) return { index: i, map }
  }
  return null
}

const separerNomPrenom = (complet) => {
  // Habitude camerounaise : NOM(S) en majuscules puis prenom(s)
  const mots = String(complet).trim().split(/\s+/)
  if (mots.length === 1) return { nom: mots[0], prenom: '' }
  const majuscules = mots.filter((m) => m === m.toUpperCase() && /[A-ZÀ-Ý]/.test(m))
  if (majuscules.length && majuscules.length < mots.length) {
    return { nom: majuscules.join(' '), prenom: mots.filter((m) => !majuscules.includes(m)).join(' ') }
  }
  return { nom: mots[0], prenom: mots.slice(1).join(' ') }
}

const versEleves = (lignes) => {
  const entete = detecterEnTete(lignes)
  const eleves = []
  if (entete) {
    const { index, map } = entete
    for (const l of lignes.slice(index + 1)) {
      const val = (k) => (map[k] !== undefined ? String(l[map[k]] ?? '').trim() : '')
      let nom = val('nom')
      let prenom = val('prenom')
      if (map.nomsPrenoms !== undefined) ({ nom, prenom } = separerNomPrenom(val('nomsPrenoms')))
      if (!nom || /^\d+$/.test(nom)) continue
      eleves.push({ nom, prenom, classe: val('classe'), dateNaissance: val('dateNaissance'), sexe: val('sexe'), matricule: val('matricule') })
    }
    return eleves
  }
  // Pas d'en-tete reconnu : chaque ligne contenant un nom (2 mots au moins)
  for (const l of lignes) {
    const cellules = l.map((c) => String(c ?? '').trim()).filter(Boolean)
    const texte = cellules.find((c) => /[A-Za-zÀ-ÿ]{2,}\s+[A-Za-zÀ-ÿ]{2,}/.test(c))
    if (!texte) continue
    const { nom, prenom } = separerNomPrenom(texte)
    const date = cellules.find((c) => /\d{1,2}[/.-]\d{1,2}[/.-]\d{4}/.test(c)) || ''
    const sexe = cellules.find((c) => /^(m|f)$/i.test(c)) || ''
    eleves.push({ nom, prenom, classe: '', dateNaissance: date, sexe, matricule: '' })
  }
  return eleves
}

const lireTableur = async (fichier) => {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await fichier.arrayBuffer(), { type: 'array', cellDates: true })
  let tout = []
  for (const nom of wb.SheetNames) {
    const lignes = XLSX.utils.sheet_to_json(wb.Sheets[nom], { header: 1, raw: false, defval: '' })
    const eleves = versEleves(lignes)
    // Une feuille par classe : le nom de la feuille sert de classe si besoin
    tout = tout.concat(eleves.map((e) => ({ ...e, classe: e.classe || (wb.SheetNames.length > 1 ? nom : '') })))
  }
  return tout
}

// Image -> JPEG reduit (1600 px max) en data URL
const imageVersJpeg = (source) =>
  new Promise((ok, ko) => {
    const img = new Image()
    img.onload = () => {
      const echelle = Math.min(1, 1600 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * echelle)
      c.height = Math.round(img.height * echelle)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      ok(c.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => ko(new Error('Image illisible (essayez une photo JPEG ou PNG)'))
    img.src = typeof source === 'string' ? source : URL.createObjectURL(source)
  })

// Envoie des images au serveur pour la reconnaissance d'ecriture
const lireParIA = async (images) => {
  const r = await api.post('/api/etablissement/lire-images', { images })
  return r.data || []
}

export async function lirePhotos(fichiers) {
  const images = []
  for (const f of [...fichiers].slice(0, 8)) images.push(await imageVersJpeg(f))
  return lireParIA(images)
}

const pagesPdfEnImages = async (doc) => {
  const images = []
  for (let p = 1; p <= Math.min(doc.numPages, 8); p++) {
    const page = await doc.getPage(p)
    const vue = page.getViewport({ scale: 2 })
    const c = document.createElement('canvas')
    c.width = vue.width
    c.height = vue.height
    await page.render({ canvasContext: c.getContext('2d'), viewport: vue }).promise
    images.push(await imageVersJpeg(c.toDataURL('image/jpeg', 0.9)))
  }
  return images
}

const lirePdf = async (fichier) => {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const doc = await pdfjs.getDocument({ data: await fichier.arrayBuffer() }).promise
  const lignes = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const contenu = await page.getTextContent()
    // Regroupe les morceaux de texte par ligne (meme hauteur), puis en colonnes
    const parLigne = new Map()
    for (const it of contenu.items) {
      if (!it.str?.trim()) continue
      const y = Math.round(it.transform[5] / 3)
      if (!parLigne.has(y)) parLigne.set(y, [])
      parLigne.get(y).push({ x: it.transform[4], s: it.str.trim() })
    }
    ;[...parLigne.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, morceaux]) => lignes.push(morceaux.sort((a, b) => a.x - b.x).map((m) => m.s)))
  }
  const eleves = versEleves(lignes)
  // PDF scanne (aucun texte) : lecture des pages par l'IA
  if (eleves.length === 0) return lireParIA(await pagesPdfEnImages(doc))
  return eleves
}

export async function lireListeEleves(fichier) {
  const nom = fichier.name.toLowerCase()
  if (nom.endsWith('.pdf')) return lirePdf(fichier)
  if (/\.(xlsx|xls|csv|ods)$/.test(nom)) return lireTableur(fichier)
  if (/^image\//.test(fichier.type) || /\.(jpe?g|png|webp|heic)$/.test(nom)) return lirePhotos([fichier])
  throw new Error('Format non pris en charge : PDF, Excel, CSV ou photo.')
}

// Prepare un document quelconque pour la lecture par l'IA :
// photos -> images ; PDF -> texte (ou images des pages si c'est un scan) ; Excel/CSV -> texte.
export async function preparerDocument(fichiers) {
  const liste = [...fichiers]
  const images = []
  let texte = ''
  for (const f of liste.slice(0, 8)) {
    const nom = f.name.toLowerCase()
    if (nom.endsWith('.pdf')) {
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
      const doc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise
      let t = ''
      for (let p = 1; p <= Math.min(doc.numPages, 15); p++) {
        const c = await (await doc.getPage(p)).getTextContent()
        t += c.items.map((i) => i.str).join(' ') + '\n'
      }
      if (t.replace(/\s/g, '').length > 80) texte += `\n${t}`
      else images.push(...(await pagesPdfEnImages(doc)))
    } else if (/\.(xlsx|xls|csv|ods)$/.test(nom)) {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' })
      for (const n of wb.SheetNames) texte += `\n[${n}]\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`
    } else if (/^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/.test(nom)) {
      images.push(await imageVersJpeg(f))
    } else {
      throw new Error('Format non pris en charge : photo, PDF, Excel ou CSV.')
    }
  }
  return { images: images.slice(0, 8), texte }
}
