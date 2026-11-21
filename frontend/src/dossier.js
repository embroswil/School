// dossier.js
// Import du dossier complet d'un etablissement (dossier ou fichier .zip) :
// chaque fichier est reconnu (eleves, enseignants, emplois du temps, cahiers d'appel, frais,
// paiements, comptabilite, discipline, communiques, documents internes, photo), puis tout est
// installe dans le bon ordre. Les imports sont sans doublons : on peut relancer le meme dossier.
import { api } from './api.js'
import { lireListeEleves, preparerDocument } from './lecture-fichier.js'
import { envoyer } from './pages/Documents.jsx'
import { lireEnseignantsDocument } from './pages/ImportEnseignants.jsx'

const sans = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").toLowerCase()
const ext = (nom) => (String(nom).match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase()
const TABLEUR = ['xlsx', 'xls', 'csv', 'ods']
const IMAGE = ['jpg', 'jpeg', 'png', 'webp', 'heic']
const MIMES = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', csv: 'text/csv', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }

// ---------------------------------------------------------------- lecture d'un .zip
/** Fichiers contenus dans une archive .zip (methodes « stocke » et « deflate »). */
export async function lireZip(fichier) {
  const tampon = await fichier.arrayBuffer()
  const o = new Uint8Array(tampon)
  const v = new DataView(tampon)
  let fin = -1
  for (let i = o.length - 22; i >= Math.max(0, o.length - 70000); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      fin = i
      break
    }
  }
  if (fin < 0) throw new Error('Archive .zip illisible.')
  const nombre = v.getUint16(fin + 10, true)
  let p = v.getUint32(fin + 16, true)
  const utf8 = new TextDecoder()
  const res = []
  for (let n = 0; n < nombre && v.getUint32(p, true) === 0x02014b50; n++) {
    const methode = v.getUint16(p + 10, true)
    const taille = v.getUint32(p + 20, true)
    const lNom = v.getUint16(p + 28, true)
    const lExtra = v.getUint16(p + 30, true)
    const lCom = v.getUint16(p + 32, true)
    const local = v.getUint32(p + 42, true)
    const chemin = utf8.decode(o.subarray(p + 46, p + 46 + lNom))
    p += 46 + lNom + lExtra + lCom
    if (chemin.endsWith('/') || /(^|\/)(__MACOSX|\.)/.test(chemin)) continue
    const debut = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    const brut = o.subarray(debut, debut + taille)
    let blob
    if (methode === 0) blob = new Blob([brut])
    else if (methode === 8 && typeof DecompressionStream !== 'undefined') blob = await new Response(new Blob([brut]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob()
    else continue
    const nom = chemin.split('/').pop()
    res.push(Object.assign(new File([blob], nom, { type: MIMES[ext(nom)] || '' }), { chemin }))
  }
  return res
}

/** Fichiers choisis (dossier, plusieurs fichiers ou archives .zip), avec leur chemin. */
export async function fichiersDuChoix(liste) {
  const res = []
  for (const f of liste) {
    if (ext(f.name) === 'zip') res.push(...(await lireZip(f)))
    else if (!/^\./.test(f.name)) res.push(Object.assign(f, { chemin: f.chemin || f.webkitRelativePath || f.name }))
  }
  return res
}

// ---------------------------------------------------------------- reconnaissance
export const ROLES = {
  photo: { titre: 'Photo de l’établissement', action: 'Affichée sur l’accueil et les reçus', ordre: 1 },
  eleves: { titre: 'Listes d’élèves', action: 'Élèves ajoutés et placés dans leur classe', ordre: 2 },
  enseignants: { titre: 'Liste des enseignants', action: 'Équipe enseignante, matières et classes', ordre: 3 },
  emplois: { titre: 'Emplois du temps', action: 'Emploi du temps de chaque classe', ordre: 4 },
  frais: { titre: 'Frais de scolarité', action: 'Frais de l’année mis à jour', ordre: 5 },
  paiements: { titre: 'Paiements de scolarité', action: 'Paiements enregistrés, un reçu par paiement', ordre: 6 },
  compta: { titre: 'Budget et comptabilité', action: 'Budget et dépenses dans la comptabilité', ordre: 7 },
  appel: { titre: 'Cahiers d’appel', action: 'Absences des élèves', ordre: 8 },
  discipline: { titre: 'Sanctions', action: 'Sanctions enregistrées, message à chaque parent', ordre: 9 },
  publier: { titre: 'Communiqués pour les familles', action: 'Publiés dans le fil des familles', ordre: 10 },
  interne: { titre: 'Documents internes', action: 'Gardés dans Documents, visibles par l’établissement seulement', ordre: 11 },
  ignore: { titre: 'Non utilisés', action: 'Laissés de côté', ordre: 12 },
}

// categorie d'un document a publier ou a garder (fil des familles, Documents)
function categorieDe(t) {
  if (/disciplin|sanction|proces.verbal/.test(t)) return 'administration'
  if (/calendrier/.test(t)) return 'calendrier'
  if (/reunion|assemblee/.test(t)) return 'reunion'
  if (/fourniture/.test(t)) return 'fournitures'
  if (/cantine|menu/.test(t)) return 'cantine'
  if (/examen|epreuve|bac|bepc|probatoire/.test(t)) return 'examen'
  if (/resultat|palmares|classement/.test(t)) return 'resultats'
  if (/absence|appel/.test(t)) return 'absences'
  if (/scolarite|recouvrement|encaissement|frais/.test(t)) return 'scolarite'
  if (/emplois? du temps|emplois?-du-temps/.test(t)) return 'emploi'
  if (/communique|avis|note de service|information/.test(t)) return 'communique'
  return null
}
// le nom du fichier compte avant son contenu
const categorie = (nom, t) => categorieDe(sans(nom)) || categorieDe(t) || 'administration'
const titreDe = (nom) =>
  nom
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/^\d+[-_ ]+/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase())

/** Role d'un fichier d'apres son chemin, son nom et son contenu (texte des tableurs, Word et PDF). */
export function role(chemin, texte) {
  const c = sans(chemin)
  const nom = c.split('/').pop()
  const e = ext(nom)
  const t = `${c}\n${sans(texte).slice(0, 12000)}`
  if (/lisez.?moi|read.?me|thumbs\.db|desktop\.ini/.test(nom)) return { role: 'ignore' }
  if (IMAGE.includes(e)) {
    if (/photo.{0,6}etablissement|facade|batiment|photo-ecole|photo.ecole/.test(nom)) return { role: 'photo' }
    if (/disciplin|pv|proces/.test(c)) return { role: 'interne', categorie: 'administration' }
    return { role: 'ignore' }
  }
  if (TABLEUR.includes(e)) {
    if ((/journal des (encaissements|paiements)/.test(t) || /n° de recu|numero de recu/.test(t)) && /matricule/.test(t) && /montant/.test(t)) return { role: 'paiements' }
    if (/budget|journal des depenses|comptabilite|tresorerie/.test(t)) return { role: 'interne', categorie: 'administration' }
    if (/cahier d.appel|feuille d.appel/.test(t)) return { role: 'appel' }
    if (/emplois? du temps|emplois?-du-temps/.test(t)) return { role: 'emplois' }
    if (/sanction|conseil de discipline/.test(t) && /(eleve|classe|matricule)/.test(t)) return { role: 'discipline' }
    if (/(frais|pension|scolarite|apee?)\b/.test(t) && /montant/.test(t) && /(echeance|tranche)/.test(t) && !/matricule/.test(t)) return { role: 'frais' }
    if (/service des enseignants|heures \/ semaine|absences des enseignants|retards des enseignants|registre des absences|bilan par enseignant/.test(t)) return { role: 'interne', categorie: 'administration' }
    if (/recouvrement|situation (de la )?scolarite|situation par eleve/.test(t)) return { role: 'interne', categorie: 'scolarite' }
    if (/recapitulatif.{0,20}absences|absences des eleves/.test(t)) return { role: 'interne', categorie: 'absences' }
    if (/(enseignant|professeur)/.test(t) && /matiere/.test(t) && /classe/.test(t)) return { role: 'enseignants' }
    if (/matricule/.test(t) && /(date de naissance|nee? le|sexe)/.test(t)) return { role: 'eleves' }
    if (/(eleves|liste des eleves)/.test(t) && /(nom|noms)/.test(t)) return { role: 'eleves' }
    return { role: 'interne', categorie: categorie(nom, t) }
  }
  if (['pdf', 'docx', 'doc'].includes(e)) {
    if (/fiche.?etablissement/.test(nom)) return { role: 'interne', categorie: 'administration' }
    if (/communique|a.publier|publier|calendrier scolaire|calendrier-scolaire|reunion des parents|fournitures|menu|cantine/.test(t.slice(0, 600)) || /communiques?.a.publier/.test(c)) return { role: 'publier', categorie: categorie(nom, t) }
    return { role: 'interne', categorie: categorie(nom, t) }
  }
  return { role: 'ignore' }
}

/** Texte d'un fichier, lu dans le navigateur (tableurs complets, debut des PDF et Word). */
async function texteDe(f) {
  const e = ext(f.name)
  try {
    if (TABLEUR.includes(e)) {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' })
      return wb.SheetNames.map((n) => `Feuille « ${n} »\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`).join('\n\n')
    }
    if (e === 'pdf' || e === 'docx') return ((await preparerDocument([f])).texte || '').slice(0, 60000)
  } catch {
    /* fichier illisible : reconnu par son nom */
  }
  return ''
}

/** Analyse tous les fichiers : role de chacun. onPas(n, total). */
export async function analyser(fichiers, onPas) {
  const res = []
  for (const [k, f] of fichiers.entries()) {
    onPas?.(k + 1, fichiers.length, f.name)
    const texte = await texteDe(f)
    const r = role(f.chemin || f.name, texte)
    res.push({ id: `${k}`, fichier: f, nom: f.name, chemin: f.chemin || f.name, texte, ...r })
  }
  // une liste « tout le lycee » rend inutiles les listes partielles d'eleves
  return res
}

// ---------------------------------------------------------------- installation (sur le serveur)
// L'appareil prepare les donnees (listes lues, documents envoyes), puis le serveur installe tout en
// arriere-plan : l'application peut etre fermee. Voir le module « travaux » du serveur.
const decoupe = (l, n) => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, i * n + n))
const feuillesUtiles = (texte) =>
  String(texte)
    .split(/\n\n(?=Feuille « )/)
    .filter((f) => /montant|prevu|prévu|budget/i.test(f.split('\n').slice(0, 16).join(' ')))
    .join('\n\n')

async function photoBandeau(f) {
  const url = URL.createObjectURL(f)
  try {
    const img = await new Promise((ok, ko) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = ko
      i.src = url
    })
    const cv = document.createElement('canvas')
    cv.width = 1000
    cv.height = 500
    const r = Math.max(1000 / img.width, 500 / img.height)
    const w = img.width * r
    const h = img.height * r
    cv.getContext('2d').drawImage(img, (1000 - w) / 2, (500 - h) / 2, w, h)
    return cv.toDataURL('image/jpeg', 0.82)
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Donnees d'un document a lire par le serveur : texte (tableurs, Word, PDF avec texte), lu sans IA ;
// seuls les photos et les PDF scannes sont envoyes en fichier (lecture par l'IA)
async function lisible(x) {
  const pdfTexte = ext(x.nom) === 'pdf' && String(x.texte || '').replace(/\s/g, '').length > 80
  if (x.texte && (TABLEUR.includes(ext(x.nom)) || ext(x.nom) === 'docx' || pdfTexte)) return { texte: x.texte, nom: x.nom }
  const env = await envoyer(x.fichier)
  return { url: env.url, mime: env.mime, nom: x.nom }
}

/** Prepare les elements de l'installation sur l'appareil. onPas(texte). Renvoie la liste des elements. */
async function preparer(analyse, roles, onPas) {
  const elements = []
  const ajouter = (role, libelle, donnees) => elements.push({ role, ordre: ROLES[role].ordre * 10000 + elements.length, libelle, donnees })
  const de = (r) => (roles.includes(r) ? analyse.filter((x) => x.role === r) : [])

  const photo = de('photo')[0]
  if (photo) {
    onPas('Photo de l’établissement')
    ajouter('photo', photo.nom, { photo: await photoBandeau(photo.fichier) })
  }
  const listes = de('eleves')
  if (listes.length) {
    const vus = new Map()
    for (const [k, x] of listes.entries()) {
      onPas(`Lecture des listes d’élèves · ${k + 1} / ${listes.length}`)
      for (const e of await lireListeEleves(x.fichier)) {
        const cle = sans(e.matricule || `${e.nom} ${e.prenom} ${e.classe}`)
        if (!vus.has(cle)) vus.set(cle, e)
      }
    }
    decoupe([...vus.values()], 80).forEach((lot, k) => ajouter('eleves', `Élèves ${k * 80 + 1}–${k * 80 + lot.length}`, { eleves: lot }))
  }
  const profs = de('enseignants')
  if (profs.length) {
    onPas('Lecture de la liste des enseignants')
    let lignes = []
    for (const x of profs) {
      lignes = lignes.concat(await lireEnseignantsDocument(x.fichier))
    }
    if (lignes.length) ajouter('enseignants', 'Liste des enseignants', { enseignants: lignes })
  }
  for (const role of ['emplois', 'frais', 'appel', 'discipline']) {
    const items = de(role)
    for (const [k, x] of items.entries()) {
      onPas(`${ROLES[role].titre} · ${k + 1} / ${items.length}`)
      ajouter(role, x.nom, await lisible(x))
    }
  }
  for (const role of ['paiements', 'compta']) for (const x of de(role)) ajouter(role, x.nom, { texte: feuillesUtiles(x.texte) })
  for (const role of ['publier', 'interne']) {
    const items = de(role)
    for (const [k, x] of items.entries()) {
      onPas(`Envoi des documents · ${k + 1} / ${items.length}`)
      const env = await envoyer(x.fichier)
      ajouter(role, x.nom, { titre: titreDe(x.nom), categorie: x.categorie || 'autre', audience: role === 'publier' ? 'tous' : 'interne', fichier: { type: env.type, url: env.url, nom: env.nom } })
    }
  }
  return elements
}

/** Prepare puis confie l'installation au serveur. Renvoie l'identifiant du travail. */
export async function lancerInstallation(analyse, roles, onPas) {
  const elements = await preparer(analyse, roles, onPas)
  if (!elements.length) throw new Error('Rien à installer.')
  const travail = (await api.post('/api/travaux', { type: 'dossier', titre: 'Installation du dossier' })).data
  // envoi par paquets d'environ 3 Mo
  const paquets = [[]]
  let taille = 0
  for (const e of elements) {
    const t = JSON.stringify(e).length
    if (taille + t > 3_000_000 && paquets[paquets.length - 1].length) {
      paquets.push([])
      taille = 0
    }
    paquets[paquets.length - 1].push(e)
    taille += t
  }
  for (const [k, p] of paquets.entries()) {
    onPas(`Envoi au serveur · ${k + 1} / ${paquets.length}`)
    await api.post(`/api/travaux/${travail.id}/elements`, { elements: p })
  }
  await api.post(`/api/travaux/${travail.id}/lancer`)
  return travail.id
}

const nb = (n) => Number(n || 0).toLocaleString('fr-FR')
/** Resume d'un role a partir des compteurs du serveur. */
export function resumeRole(role, r) {
  const n = r.n || {}
  const parties = {
    photo: () => 'Photo mise à jour',
    eleves: () => `${nb(n.eleves)} élèves · ${nb(n.crees)} ajoutés, ${nb(n.existants)} déjà présents`,
    enseignants: () => `${nb(n.enseignants)} enseignants`,
    emplois: () => `${nb(n.classes)} classes · ${nb(n.cours)} cours`,
    frais: () => `${nb(n.frais)} frais`,
    paiements: () => (n.paiements ? `${nb(n.paiements)} paiements · ${nb(n.montant)} FCFA` : 'Paiements déjà enregistrés'),
    compta: () => `${nb(n.postes)} postes du budget · ${nb(n.operations)} opérations`,
    appel: () => `${nb(n.absences)} absences ajoutées`,
    discipline: () => `${nb(n.sanctions)} sanctions enregistrées${n.aVoir ? ` · ${nb(n.aVoir)} élève(s) non retrouvé(s)` : ''}`,
    publier: () => `${nb(n.documents)} document(s)${n.deja ? ` · ${nb(n.deja)} déjà présent(s)` : ''}`,
    interne: () => `${nb(n.documents)} document(s)${n.deja ? ` · ${nb(n.deja)} déjà présent(s)` : ''}`,
  }
  return (parties[role] || (() => ''))()
}
