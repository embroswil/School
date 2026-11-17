// Lecture d'une liste d'eleves depuis un fichier Excel, CSV, PDF, Word, ou depuis
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
    // Titres et mentions du document : ce ne sont pas des eleves
    if (/^(classe|liste|ann[ée]e|lyc[ée]e|coll[èe]ge|[ée]cole|r[ée]publique|minist|effectif|total|page)\b/i.test(texte)) continue
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

// ---------- Word (.docx) ----------
// Un fichier .docx est une archive ZIP : on y lit « word/document.xml » avec les outils du navigateur.
const lireEntreeZip = async (tampon, chemin) => {
  const o = new Uint8Array(tampon)
  const v = new DataView(tampon)
  // Fin du repertoire central (signature PK 05 06), cherchee depuis la fin du fichier
  let fin = -1
  for (let i = o.length - 22; i >= Math.max(0, o.length - 70000); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      fin = i
      break
    }
  }
  if (fin < 0) throw new Error('Fichier Word illisible.')
  const nombre = v.getUint16(fin + 10, true)
  let p = v.getUint32(fin + 16, true)
  const decodeur = new TextDecoder()
  for (let n = 0; n < nombre && v.getUint32(p, true) === 0x02014b50; n++) {
    const methode = v.getUint16(p + 10, true)
    const taille = v.getUint32(p + 20, true)
    const lNom = v.getUint16(p + 28, true)
    const lExtra = v.getUint16(p + 30, true)
    const lCom = v.getUint16(p + 32, true)
    const local = v.getUint32(p + 42, true)
    const nom = decodeur.decode(o.subarray(p + 46, p + 46 + lNom))
    if (nom === chemin) {
      const debut = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
      const brut = o.subarray(debut, debut + taille)
      if (methode === 0) return decodeur.decode(brut)
      if (methode !== 8 || typeof DecompressionStream === 'undefined') throw new Error('Ce fichier Word ne peut pas être lu ici : enregistrez-le en PDF, puis réessayez.')
      const flux = new Blob([brut]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      return new Response(flux).text()
    }
    p += 46 + lNom + lExtra + lCom
  }
  throw new Error('Fichier Word illisible.')
}

const texteXml = (xml) =>
  [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g)]
    .map((m) => (m[0].startsWith('<w:t') && !m[0].startsWith('<w:tab') ? m[1] : m[0] === '<w:tab/>' ? '\t' : ' '))
    .join('')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")

// Tableaux -> une ligne par rangee ; paragraphes -> une ligne (colonnes separees par des tabulations)
export const lignesDocx = (xml) => {
  const lignes = []
  for (const bloc of xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g)) {
    if (bloc[0].startsWith('<w:tbl>')) {
      for (const rangee of bloc[0].matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)) {
        lignes.push([...rangee[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((c) => texteXml(c[0]).replace(/\s+/g, ' ').trim()))
      }
    } else {
      const t = texteXml(bloc[0])
      if (t.trim()) lignes.push(t.split(/\t+|\s{3,}/).map((c) => c.trim()).filter(Boolean))
    }
  }
  return lignes
}

const lireWord = async (fichier) => {
  if (/\.doc$/i.test(fichier.name)) throw new Error('Ancien format Word (.doc) : enregistrez le fichier en .docx ou en PDF, puis réessayez.')
  const lignes = lignesDocx(await lireEntreeZip(await fichier.arrayBuffer(), 'word/document.xml'))
  const eleves = versEleves(lignes)
  if (eleves.length) return eleves
  // Mise en page non reconnue : lecture du texte par l'IA
  const texte = lignes.map((l) => l.join(' | ')).join('\n')
  if (texte.trim().length < 20) throw new Error('Ce document Word ne contient pas de texte lisible.')
  return (await api.post('/api/etablissement/lire-images', { texte })).data || []
}

// Le type du fichier est reconnu automatiquement : Excel/CSV, PDF, Word ou photo
export async function lireListeEleves(fichier) {
  const nom = fichier.name.toLowerCase()
  if (nom.endsWith('.pdf')) return lirePdf(fichier)
  if (/\.(xlsx|xls|csv|ods)$/.test(nom)) return lireTableur(fichier)
  if (/\.docx?$/.test(nom)) return lireWord(fichier)
  if (/^image\//.test(fichier.type) || /\.(jpe?g|png|webp|heic)$/.test(nom)) return lirePhotos([fichier])
  throw new Error('Format non pris en charge : Excel, CSV, PDF, Word ou photo.')
}

// Prepare un document quelconque pour la lecture par l'IA :
// photos -> images ; PDF -> texte (ou images des pages si c'est un scan) ; Excel/CSV et Word -> texte.
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
    } else if (/\.docx$/.test(nom)) {
      const lignes = lignesDocx(await lireEntreeZip(await f.arrayBuffer(), 'word/document.xml'))
      texte += `\n${lignes.map((l) => l.join(' | ')).join('\n')}`
    } else if (/\.doc$/.test(nom)) {
      throw new Error('Ancien format Word (.doc) : enregistrez le fichier en .docx ou en PDF, puis réessayez.')
    } else if (/^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/.test(nom)) {
      images.push(await imageVersJpeg(f))
    } else {
      throw new Error('Format non pris en charge : Excel, CSV, PDF, Word ou photo.')
    }
  }
  return { images: images.slice(0, 8), texte }
}
