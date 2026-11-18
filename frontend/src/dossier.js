// dossier.js
// Import du dossier complet d'un etablissement (dossier ou fichier .zip) :
// chaque fichier est reconnu (eleves, enseignants, emplois du temps, cahiers d'appel, frais,
// paiements, comptabilite, discipline, communiques, documents internes, photo), puis tout est
// installe dans le bon ordre. Les imports sont sans doublons : on peut relancer le meme dossier.
import { api } from './api.js'
import { lireListeEleves, preparerDocument } from './lecture-fichier.js'
import { lireDocumentEcole } from './documents-ecole.js'
import { envoyer } from './pages/Documents.jsx'
import { lireTableur as lireEnseignants } from './pages/ImportEnseignants.jsx'

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
    if (/budget|journal des depenses|comptabilite|tresorerie/.test(t)) return { role: 'compta' }
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
    if (e === 'pdf' || e === 'docx') return ((await preparerDocument([f])).texte || '').slice(0, 12000)
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

// ---------------------------------------------------------------- installation
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

// Une etape par role : renvoie un resume en une ligne, et la liste des points a verifier
const ETAPES = {
  async photo(items) {
    await api.put('/api/etablissement/photo', { photo: await photoBandeau(items[0].fichier) })
    return { resume: 'Photo mise à jour' }
  },

  async eleves(items, pas) {
    const vus = new Map()
    for (const [k, x] of items.entries()) {
      pas(`Lecture ${k + 1} / ${items.length}`)
      for (const e of await lireListeEleves(x.fichier)) {
        const cle = sans(e.matricule || `${e.nom} ${e.prenom} ${e.classe}`)
        if (!vus.has(cle)) vus.set(cle, e)
      }
    }
    const liste = [...vus.values()]
    const t = { crees: 0, existants: 0, places: 0, erreurs: [] }
    for (const [k, lot] of decoupe(liste, 80).entries()) {
      pas(`Enregistrement ${Math.min((k + 1) * 80, liste.length)} / ${liste.length}`)
      const r = (await api.post('/api/etablissement/import-eleves', { eleves: lot, classeParDefaut: '' })).data
      t.crees += r.crees
      t.existants += r.existants
      t.places += r.places
      t.erreurs.push(...(r.erreurs || []))
    }
    return { resume: `${liste.length.toLocaleString('fr-FR')} élèves · ${t.crees} ajoutés, ${t.existants} déjà présents`, alertes: t.erreurs.slice(0, 5) }
  },

  async enseignants(items, pas) {
    let lignes = []
    for (const x of items) {
      pas(x.nom)
      if (TABLEUR.includes(ext(x.nom))) lignes = lignes.concat(await lireEnseignants(x.fichier))
      else lignes = lignes.concat((await api.post('/api/etablissement/enseignants/lire', await preparerDocument([x.fichier]))).data || [])
    }
    if (!lignes.length) throw new Error('Aucun enseignant trouvé dans la liste.')
    pas('Enregistrement')
    await api.post('/api/etablissement/enseignants/import', { enseignants: lignes })
    return { resume: `${lignes.length} enseignants` }
  },

  async emplois(items, pas) {
    const classes = new Map()
    const inconnues = new Set()
    for (const [k, x] of items.entries()) {
      pas(`Lecture ${k + 1} / ${items.length}`)
      const r = await lireDocumentEcole(x.fichier, '/api/documents-ecole/emplois/lire')
      for (const c of r?.classes || []) {
        if (c.classId) classes.set(c.classId, c.creneaux)
        else inconnues.add(c.nomLu || x.nom)
      }
    }
    let nbCours = 0
    for (const lot of decoupe([...classes].map(([classId, creneaux]) => ({ classId, creneaux })), 40)) {
      pas('Enregistrement')
      nbCours += (await api.post('/api/documents-ecole/emplois/appliquer', { classes: lot })).data?.cours || 0
    }
    return { resume: `${classes.size} classes · ${nbCours} cours`, alertes: inconnues.size ? [`Classes non reconnues : ${[...inconnues].slice(0, 6).join(', ')}`] : [] }
  },

  async frais(items, pas) {
    let n = 0
    for (const x of items) {
      pas(x.nom)
      const r = (await api.post('/api/scolarite/frais/lire', { texte: x.texte, nom: x.nom })).data
      const aEnvoyer = r.filter((f) => f.statut !== 'identique')
      if (aEnvoyer.length)
        await api.post('/api/scolarite/frais/appliquer', { frais: aEnvoyer.map(({ id, nom, montant, echeance, classes, categorie, obligatoire }) => ({ id, nom, montant, echeance, classes, categorie, obligatoire })) })
      n += r.length
    }
    return { resume: `${n} frais` }
  },

  async paiements(items, pas) {
    let n = 0
    let total = 0
    const alertes = []
    for (const x of items) {
      pas(x.nom)
      const r = (await api.post('/api/comptabilite/importer', { texte: feuillesUtiles(x.texte) })).data
      n += r.paiements || 0
      total += r.paiementsTotal || 0
      if (r.elevesInconnus) alertes.push(`${r.elevesInconnus} matricule(s) introuvable(s)`)
      if (r.fraisInconnus?.length) alertes.push(`Frais inconnus : ${r.fraisInconnus.join(', ')}`)
    }
    return { resume: n ? `${n.toLocaleString('fr-FR')} paiements · ${total.toLocaleString('fr-FR')} FCFA` : 'Paiements déjà enregistrés', alertes }
  },

  async compta(items, pas) {
    let ops = 0
    let postes = 0
    for (const x of items) {
      pas(x.nom)
      const r = (await api.post('/api/comptabilite/importer', { texte: feuillesUtiles(x.texte) })).data
      ops += r.operations || 0
      postes += (r.postesNouveaux || 0) + (r.postesMaj || 0)
    }
    return { resume: `${postes} postes du budget · ${ops} opérations` }
  },

  async appel(items, pas) {
    const absences = []
    for (const [k, x] of items.entries()) {
      pas(`Lecture ${k + 1} / ${items.length}`)
      absences.push(...((await lireDocumentEcole(x.fichier, '/api/documents-ecole/absences/lire')) || []).filter((l) => l.trouve))
    }
    let ajoutees = 0
    for (const lot of decoupe(absences, 2500)) {
      pas('Enregistrement')
      ajoutees += (await api.post('/api/documents-ecole/absences/appliquer', { absences: lot })).data?.ajoutees || 0
    }
    return { resume: `${ajoutees.toLocaleString('fr-FR')} absences ajoutées` }
  },

  async discipline(items, pas) {
    let faites = 0
    let aVoir = 0
    for (const x of items) {
      pas(x.nom)
      const lues = (await api.post('/api/vie-scolaire/sanctions/lire', { texte: x.texte, nom: x.nom })).data || []
      for (const [k, s] of lues.entries()) {
        if (!s.eleve) {
          aVoir++
          continue
        }
        pas(`Sanction ${k + 1} / ${lues.length}`)
        const r = await api.post('/api/vie-scolaire/sanctions', { studentId: s.eleve.id, type: s.type, motif: s.motif || s.type, date: s.date, dureeJours: s.dureeJours })
        if (!r.data?.deja) faites++
      }
    }
    return { resume: `${faites} sanctions enregistrées`, alertes: aVoir ? [`${aVoir} sanction(s) dont l’élève n’a pas été retrouvé : à saisir dans Discipline`] : [] }
  },

  async publier(items, pas, existants) {
    return documents(items, pas, existants, 'tous')
  },
  async interne(items, pas, existants) {
    return documents(items, pas, existants, 'interne')
  },
}

async function documents(items, pas, existants, audience) {
  let n = 0
  let deja = 0
  for (const [k, x] of items.entries()) {
    pas(`${k + 1} / ${items.length}`)
    if (existants.has(sans(x.nom))) {
      deja++
      continue
    }
    const envoye = await envoyer(x.fichier)
    await api.post('/api/actualites/documents', { titre: titreDe(x.nom), categorie: x.categorie || 'autre', audience, fichiers: [{ type: envoye.type, url: envoye.url, nom: envoye.nom }] })
    n++
  }
  return { resume: `${n} document(s)${deja ? ` · ${deja} déjà présent(s)` : ''}` }
}

/** Installe les roles choisis dans l'ordre. suivi(role, { etat, pas, resume, alertes, erreur }). */
export async function installer(analyse, roles, suivi) {
  let existants = new Set()
  try {
    existants = new Set(((await api.get('/api/actualites/documents')).data || []).flatMap((d) => (d.fichiers || d.medias || []).map((m) => sans(m.nom || ''))).filter(Boolean))
  } catch {
    /* liste indisponible : les documents sont ajoutes */
  }
  for (const r of Object.keys(ROLES).filter((k) => roles.includes(k) && k !== 'ignore')) {
    const items = analyse.filter((x) => x.role === r)
    if (!items.length) continue
    suivi(r, { etat: 'en_cours', pas: '' })
    try {
      const res = await ETAPES[r](items, (pas) => suivi(r, { etat: 'en_cours', pas }), existants)
      suivi(r, { etat: 'fait', ...res })
    } catch (err) {
      suivi(r, { etat: 'erreur', erreur: err.message })
    }
  }
}
