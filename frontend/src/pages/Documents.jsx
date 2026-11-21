import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { confierFichiers, useDepotPage } from '../depot.jsx'
import { preparerDocument } from '../lecture-fichier.js'
import { lireDocumentEcole } from '../documents-ecole.js'
import CompteurIA from '../CompteurIA.jsx'
import { Field, Note, annoncer } from '../ui.jsx'
import { IcChevron, IcImport, IcPoubelle } from '../icones.jsx'
import { fichiersDuChoix } from '../dossier.js'

// Categories (memes cles que le serveur)
// [cle, libelle enregistre, nom du groupe dans la liste]
export const CATEGORIES = [
  ['communique', 'Communiqué', 'Communiqués'],
  ['reunion', 'Réunion', 'Réunions'],
  ['scolarite', 'Scolarité', 'Scolarité'],
  ['emploi', 'Emploi du temps', 'Emplois du temps'],
  ['calendrier', 'Calendrier', 'Calendriers'],
  ['examen', 'Examens', 'Examens'],
  ['resultats', 'Résultats', 'Résultats'],
  ['absences', 'Récapitulatif des absences', 'Absences'],
  ['progression', 'Progression', 'Progressions'],
  ['exercices', 'Exercices', 'Exercices'],
  ['cours', 'Cours', 'Cours'],
  ['fournitures', 'Fournitures', 'Fournitures'],
  ['cantine', 'Cantine', 'Cantine'],
  ['evenement', 'Événement', 'Événements'],
  ['administration', 'Administration', 'Administration'],
  ['autre', 'Document', 'Autres documents'],
]
// Documents qui ne vont pas dans le fil : ils alimentent une page de l'etablissement.
// [page, type reconnu, bouton, peut aussi etre publie pour les familles, copie interne gardee dans Documents]
const DESTINATIONS = {
  liste_enseignants: ['/import-enseignants', 'Liste des enseignants', 'Ajouter à l’équipe enseignante', false],
  liste_eleves: ['/import-eleves', 'Liste d’élèves', 'Importer les élèves', false],
  cahier_appel: ['/import-absences', 'Cahier d’appel', 'Mettre à jour les absences', false],
  emploi_du_temps: ['/import-emplois', 'Emploi du temps', 'Ajouter aux emplois du temps', true],
  frais: ['/scolarite?onglet=frais', 'Frais de scolarité', 'Mettre à jour les frais', true],
  discipline: ['/discipline', 'Discipline', 'Enregistrer les sanctions', false],
  notes_nominatives: [null, 'Notes d’élèves', null, false],
}
const CATEGORIE_DE = { emploi_du_temps: 'emploi', frais: 'scolarite', comptabilite: 'administration' }
// Libelles d'un groupe de documents reconnus (singulier, pluriel)
const NOMBRE = {
  liste_enseignants: ['liste d’enseignants', 'listes d’enseignants'],
  liste_eleves: ['liste d’élèves', 'listes d’élèves'],
  cahier_appel: ['cahier d’appel', 'cahiers d’appel'],
  emploi_du_temps: ['emploi du temps', 'emplois du temps'],
  frais: ['document de frais', 'documents de frais'],
  discipline: ['document de discipline', 'documents de discipline'],
  comptabilite: ['classeur de comptabilité', 'classeurs de comptabilité'],
  notes_nominatives: ['relevé de notes', 'relevés de notes'],
}
const quantite = (nature, n) => `${n} ${NOMBRE[nature][n > 1 ? 1 : 0]}`

// Reconnaissance du document d'apres son contenu (Excel, Word, PDF avec texte) et son nom
const sansAccents = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
function reconnaitre(nom, texte) {
  const t = sansAccents(`${nom}\n${String(texte || '').slice(0, 8000)}`)
  if (/journal des encaissements|etat de recouvrement|situation (de la )?scolarite|situation par eleve|encaissements et situation/.test(t)) return { nature: 'interne', categorie: 'scolarite' }
  if (/service des enseignants|heures \/ semaine|heures supplementaires|budget|comptabilite|journal des depenses|tresorerie|absences des enseignants|bilan par enseignant/.test(t))
    return { nature: 'interne', categorie: 'administration' }
  if (/cahier.d.appel|feuille.d.appel|feuille de presence/.test(t)) return { nature: 'cahier_appel' }
  if (/recapitulatif.{0,20}absences|absences des eleves/.test(t)) return { nature: 'interne', categorie: 'absences' }
  // releve de notes ou bulletin d'eleves nommes : jamais publie aux familles
  // (un nom en majuscules suivi d'une note sur 20, au moins 5 fois ; le texte d'un PDF peut tenir sur une seule ligne)
  const lignesNotees = (String(texte || '').match(/[A-ZÀ-Ý]{3,}[^\n\d]{0,60}?[\s,;|](1?\d|20)([.,]\d{1,2})?(?=$|[\s,;|])/gm) || []).length
  if (/(releve de notes|bulletin|\bnotes?\b|moyenne)/.test(t) && /(\bnoms?\b|prenom|eleve)/.test(t) && !/sanction/.test(t) && lignesNotees >= 5) return { nature: 'notes_nominatives' }
  // le nom du fichier l'emporte : un emploi du temps cite aussi enseignants, matieres et classes
  if (/emploi.du.temps|emplois.du.temps|\bedt\b/.test(sansAccents(nom))) return { nature: 'emploi_du_temps' }
  if (/enseignant|professeur|equipe pedagogique/.test(t) && /matiere/.test(t) && /classe/.test(t)) return { nature: 'liste_enseignants' }
  if (/matricule/.test(t) && /(date de naissance|nee? le|sexe)/.test(t)) return { nature: 'liste_eleves' }
  if (/emploi du temps|emploi-du-temps/.test(t) || (/lundi/.test(t) && /mardi/.test(t) && /mercredi/.test(t) && /\d{1,2}\s*[:h]\s*\d{2}/.test(t))) return { nature: 'emploi_du_temps' }
  if (/(sanction|conseil de discipline)/.test(t) && /(eleve|classe)/.test(t)) return { nature: 'discipline' }
  if (/(frais|pension|scolarite|apee?)\b/.test(t) && /montant/.test(t) && /(echeance|tranche)/.test(t)) return { nature: 'frais' }
  return null
}

// Photo reduite avant l'envoi (1600 px, JPEG)
const reduire = (fichier) =>
  new Promise((ok) => {
    const img = new Image()
    img.onload = () => {
      const r = Math.min(1, 1600 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * r)
      c.height = Math.round(img.height * r)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      c.toBlob((b) => ok(b || fichier), 'image/jpeg', 0.85)
    }
    img.onerror = () => ok(fichier)
    img.src = URL.createObjectURL(fichier)
  })

// Type du fichier (certains navigateurs ne le donnent pas pour Excel ou PowerPoint)
const MIMES = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv', txt: 'text/plain', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/x-m4v',
}
const mimeDe = (f) => f.type || MIMES[(f.name.split('.').pop() || '').toLowerCase()] || ''
const ETIQUETTE = (nom, type) => {
  const e = (nom.split('.').pop() || '').toLowerCase()
  if (type === 'image') return 'IMG'
  if (type === 'video') return 'VIDÉO'
  return { pdf: 'PDF', doc: 'WORD', docx: 'WORD', xls: 'EXCEL', xlsx: 'EXCEL', ppt: 'PPT', pptx: 'PPT', csv: 'CSV', txt: 'TXT' }[e] || 'FICHIER'
}
const iPhone = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,image/*,video/*'

export async function envoyer(fichier) {
  const estImage = fichier.type.startsWith('image/')
  const blob = estImage ? await reduire(fichier) : fichier
  const mime = estImage ? 'image/jpeg' : mimeDe(fichier)
  const s = await api.post('/api/medias/signer', { mime, taille: blob.size })
  const r = await fetch(s.data.envoi, { method: 'PUT', headers: { 'Content-Type': mime }, body: blob })
  if (!r.ok) throw new Error('L’envoi du fichier a échoué. Vérifiez la connexion et réessayez.')
  return { type: s.data.type, url: s.data.url, nom: fichier.name, mime }
}

const PUBLICS = { tous: 'Tout le monde', parents: 'Parents', eleves: 'Élèves', enseignants: 'Enseignants', interne: 'Établissement seulement' }
const VISIBILITE = { tous: 'Publié pour tous', parents: 'Publié pour les parents', eleves: 'Publié pour les élèves', enseignants: 'Enseignants seulement', interne: 'Établissement seulement' }
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const groupeDe = (libelle) => (CATEGORIES.find((c) => c[1] === libelle) || CATEGORIES[CATEGORIES.length - 1])[2]
const jour = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
const sansAccent = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Icone de chaque type de document (dessin adapte, sur fond de sa couleur)
const COULEURS = { Communiqués: '#2f6bff', Réunions: '#7c4dff', Scolarité: '#12b76a', 'Emplois du temps': '#0ba5ec', Calendriers: '#f79009', Examens: '#ef6820', Résultats: '#dd2590', Absences: '#f04438', Fournitures: '#875bf7', Cantine: '#ca8504', Événements: '#06aed4', Administration: '#7a8699', Cours: '#2f6bff', Exercices: '#12b76a', Progressions: '#0ba5ec', 'Autres documents': '#8a94a6' }
const DESSINS = {
  // porte-voix
  Communiqués: <><path d="M4 10v4a1 1 0 0 0 1 1h2l5 4V5L7 9H5a1 1 0 0 0-1 1z" /><path d="M16 9a4 4 0 0 1 0 6" /><path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" /></>,
  // groupe de personnes autour d'une table
  Réunions: <><circle cx="8" cy="8" r="2.6" /><circle cx="16" cy="8" r="2.6" /><path d="M3.5 18a4.5 4.5 0 0 1 9 0" /><path d="M11.5 18a4.5 4.5 0 0 1 9 0" /></>,
  // billets
  Scolarité: <><rect x="3" y="6.5" width="18" height="11" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6.5 9.5v.01M17.5 14.5v.01" /></>,
  // grille horaire avec horloge
  'Emplois du temps': <><rect x="3" y="4" width="13" height="13" rx="2" /><path d="M3 8.5h13M7.5 4v13M11.5 4v13" /><circle cx="17.5" cy="17.5" r="3.5" fill="var(--fond-ico)" /><path d="M17.5 16v1.6l1 .8" /></>,
  // calendrier
  Calendriers: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /><path d="M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01" /></>,
  // copie d'examen et crayon
  Examens: <><path d="M6 3h8l4 4v6" /><path d="M6 3v17a1 1 0 0 0 1 1h5" /><path d="M9 9h5M9 12.5h4" /><path d="m14.5 20.5 5.5-5.5 1.5 1.5-5.5 5.5H14.5z" /></>,
  // coupe
  Résultats: <><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a2.5 2.5 0 0 0 3 4M16 6h3a2.5 2.5 0 0 1-3 4" /><path d="M12 13v4M8.5 20h7M10 17h4" /></>,
  // personne absente
  Absences: <><circle cx="10" cy="8" r="3.5" /><path d="M3.5 20a6.5 6.5 0 0 1 11.5-4" /><path d="m16.5 15.5 4 4M20.5 15.5l-4 4" /></>,
  // cartable
  Fournitures: <><path d="M7 8V6a5 5 0 0 1 10 0v2" /><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M4 13h16M10 13v2h4v-2" /></>,
  // couverts
  Cantine: <><path d="M7 3v6a2 2 0 0 0 4 0V3M9 3v18" /><path d="M17 21V3c-2 1-3 4-3 7h3" /></>,
  // drapeau d'evenement
  Événements: <><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /><path d="M9 16.5l1 1.5 2-3" /></>,
  // livre ouvert
  Cours: <><path d="M3 5.5A1.5 1.5 0 0 1 4.5 4H10a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H3z" /><path d="M21 5.5A1.5 1.5 0 0 0 19.5 4H14a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h7z" /></>,
  // feuille d'exercices cochee
  Exercices: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="m8 8.5 1.5 1.5L12 7.5M8 14.5l1.5 1.5 2.5-2.5M14 9h2M14 15h2" /></>,
  // courbe de progression
  Progressions: <><path d="M4 4v16h16" /><path d="m7 15 4-4 3 3 5-6" /></>,
  // porte-documents ferme
  Administration: <><rect x="3.5" y="7" width="17" height="12" rx="2" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" /><rect x="10" y="11" width="4" height="4" rx="1" /><path d="M3.5 13h6.5M14 13h6.5" /></>,
  // document
  'Autres documents': <><path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v5h5M9 13h6M9 16.5h6" /></>,
}
const Dossier = ({ groupe, taille = 36 }) => {
  const c = COULEURS[groupe] || '#667085'
  return (
    <span className="doc-type-ico" style={{ width: taille, height: taille, color: c, background: `${c}1f`, '--fond-ico': 'var(--card)' }} aria-hidden="true">
      <svg width={Math.round(taille * 0.56)} height={Math.round(taille * 0.56)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {DESSINS[groupe] || DESSINS['Autres documents']}
      </svg>
    </span>
  )
}
const CLE_DOSSIER = 'sukul-documents-dossier'

const VIDE = { titre: '', categorie: 'autre', description: '', audience: 'tous', dateEvenement: '', lieu: '' }

// Documents de l'etablissement : ajout (lecture et classement automatiques), puis liste publiee
// rangee par type de document et par mois.
// Documents de l'enseignant : seulement les siens, en grille, avec filtre par type
const PUBLIC_COURT = { tous: 'Tout le monde', parents: 'Parents', eleves: 'Élèves', enseignants: 'Enseignants', interne: 'Privé' }
function DocsEnseignant({ docs, retirer }) {
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const types = [...new Set(docs.map((d) => groupeDe(d.categorie)))]
  const t = sansAccent(q.trim())
  const liste = docs.filter((d) => (!type || groupeDe(d.categorie) === type) && (!t || sansAccent(`${d.title} ${d.categorie}`).includes(t)))
  return (
    <div className="docs-ens">
      <input className="input docs-recherche" type="search" placeholder="Rechercher" value={q} onChange={(e) => setQ(e.target.value)} />
      {types.length > 1 && (
        <div className="docs-ens-filtres" role="tablist">
          {['', ...types].map((g) => (
            <button key={g || 'tout'} type="button" role="tab" aria-selected={type === g} onClick={() => setType(g)}>
              {g || 'Tout'}
            </button>
          ))}
        </div>
      )}
      {liste.length === 0 && <p className="muted docs-ens-vide">Aucun document ne correspond à la recherche.</p>}
      <div className="docs-ens-grille">
        {liste.map((d) => {
          const f = Array.isArray(d.medias) ? d.medias[0] : null
          const g = groupeDe(d.categorie)
          return (
            <article key={d.id} className="docs-ens-tuile">
              <a className="docs-ens-lien" href={f?.url} target="_blank" rel="noreferrer" aria-label={`Ouvrir ${d.title}`}>
                <span className="docs-ens-haut">
                  <Dossier groupe={g} taille={40} />
                  <span className="doc-badge">{ETIQUETTE(f?.nom || d.title || '', f?.type || 'document')}</span>
                </span>
                <b data-brut>{d.title}</b>
                <small>{`${d.categorie} · ${jour(d.created_at)}`}</small>
                <small className="docs-ens-public">{`${PUBLIC_COURT[d.audience] || 'Tout le monde'}${d.vues > 0 && d.audience !== 'interne' ? ` · vu par ${d.vues.toLocaleString('fr-FR')}` : ''}`}</small>
              </a>
              <button type="button" className="docs-ens-retirer" aria-label={`Retirer ${d.title}`} onClick={() => retirer(d.id)}>
                <IcPoubelle size={15} />
              </button>
            </article>
          )
        })}
      </div>
    </div>
  )
}

export default function Documents() {
  const { user } = useAuth()
  const champ = useRef(null)
  const champDossier = useRef(null)
  const liste = useApi('/api/actualites/documents')
  const [items, setItems] = useState([])
  const [etat, setEtat] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [type, setType] = useState(() => {
    try {
      return sessionStorage.getItem(CLE_DOSSIER) || ''
    } catch (_) {
      return ''
    }
  })
  const [q, setQ] = useState('')
  const [ouverts, setOuverts] = useState({})
  const [publierAussi, setPublierAussi] = useState({}) // par type reconnu : copie publiee pour les familles
  useEffect(() => {
    try {
      sessionStorage.setItem(CLE_DOSSIER, type)
    } catch (_) {
      /* stockage indisponible */
    }
  }, [type])
  const ouvrirDossier = (g) => {
    setType(g)
    setOuverts({})
    setQ('')
    window.scrollTo(0, 0)
  }

  const maj = (id, champs) => setItems((l) => l.map((x) => (x.id === id ? { ...x, ...champs } : x)))
  const retirerItem = (id) => setItems((l) => l.filter((x) => x.id !== id))

  async function choisir(e) {
    const bruts = [...(e.target.files || [])]
    e.target.value = ''
    // un dossier (ou un .zip) est developpe : chaque fichier est lu et classe
    const choix = (await fichiersDuChoix(bruts).catch(() => bruts)).filter((f) => /\.(pdf|docx?|xlsx?|pptx?|csv|txt|jpe?g|png|webp|heic|mp4|mov|webm|m4v)$/i.test(f.name)).slice(0, 40)
    if (bruts.length && !choix.length) setError('Aucun fichier utilisable dans ce choix : PDF, Word, Excel, PowerPoint, photo ou vidéo.')
    if (!choix.length) return
    setError('')
    setOk('')
    const dejaChoisis = new Set(items.map((x) => `${x.nom}|${x.source?.size}`))
    for (const [k, x] of choix.entries()) {
      if (dejaChoisis.has(`${x.name}|${x.size}`)) continue
      dejaChoisis.add(`${x.name}|${x.size}`)
      const id = `${Date.now()}-${k}`
      const titre = x.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim()
      setItems((l) => [...l, { id, nom: x.name, source: x, etape: 'lecture', ...VIDE, titre }])
      setEtat(`Lecture ${k + 1} / ${choix.length}…`)
      try {
        // 1. contenu lu dans le navigateur (Excel, Word, PDF avec texte) : type reconnu sans attendre
        let texte = ''
        if (/\.(pdf|xlsx|xls|csv|ods|docx)$/i.test(x.name)) texte = (await preparerDocument([x]).catch(() => ({ texte: '' }))).texte || ''
        const vu = reconnaitre(x.name, texte)
        if (vu && DESTINATIONS[vu.nature]) {
          maj(id, { etape: 'pret', analyse: { nature: vu.nature }, categorie: CATEGORIE_DE[vu.nature] || 'autre' })
          continue
        }
        // 2. envoi, puis lecture automatique pour les PDF et les photos
        const envoye = await envoyer(x)
        maj(id, { fichier: envoye, type: envoye.type })
        let a = null
        if (!vu) a = (await api.post('/api/actualites/documents/analyser', { url: envoye.url, mime: envoye.mime, nom: envoye.nom }).catch(() => ({ data: null }))).data
        if (a && DESTINATIONS[a.nature]) {
          maj(id, { etape: 'pret', analyse: { nature: a.nature }, categorie: CATEGORIE_DE[a.nature] || 'autre' })
          continue
        }
        const nature = vu?.nature || a?.nature || 'information'
        const categorie = vu?.categorie || a?.categorie || 'autre'
        maj(id, {
          analyse: { nature },
          etape: 'pret',
          titre: a?.titre || titre,
          categorie,
          audience: nature === 'interne' || categorie === 'administration' ? 'interne' : 'tous',
          description: a?.resume || '',
          dateEvenement: a?.dateEvenement || '',
          lieu: a?.lieu || '',
        })
      } catch (err) {
        maj(id, { etape: 'erreur', message: err.message })
      }
    }
    setEtat('')
  }
  // Documents qui alimentent une autre page : ouverts et lus directement dans cette page
  // Copie gardee dans Documents (emplois du temps, frais) : publiee pour les familles, ou reservee a l'etablissement
  async function archiver(groupe, publier) {
    const nature = groupe[0].analyse.nature
    for (const x of groupe) {
      try {
        const envoye = x.fichier || (await envoyer(x.source))
        const ancien = versionPubliee({ ...x, categorie: CATEGORIE_DE[nature] })
        await api.post('/api/actualites/documents', { titre: x.titre, categorie: CATEGORIE_DE[nature], audience: publier ? 'tous' : 'interne', fichiers: [{ type: envoye.type, url: envoye.url, nom: envoye.nom }] })
        if (ancien) await api.delete(`/api/actualites/${ancien.id}`).catch(() => {})
      } catch (_) {
        // la copie dans Documents est un plus : l'import principal continue
      }
    }
    liste.reload()
  }
  async function transmettre(groupe) {
    const d = DESTINATIONS[groupe[0].analyse.nature]
    if (d[3] || d[4]) {
      setEtat('Enregistrement…')
      await archiver(groupe, Boolean(d[3]) && publierAussi[groupe[0].analyse.nature] !== false)
      setEtat('')
    }
    confierFichiers(groupe.map((x) => x.source))
    setItems((l) => l.filter((x) => !groupe.includes(x)))
    window.location.hash = d[0]
  }
  // Emplois du temps et cahiers d'appel : tous lus et enregistres d'un seul geste, sans changer de page
  async function toutAjouter(groupe) {
    const nature = groupe[0].analyse.nature
    setError('')
    setOk('')
    const classes = new Map()
    const absences = []
    const nonReconnues = new Set()
    const echecs = []
    for (const [k, x] of groupe.entries()) {
      setEtat(`Lecture ${k + 1} / ${groupe.length}…`)
      maj(x.id, { etape: 'lecture' })
      try {
        if (nature === 'emploi_du_temps') {
          const r = await lireDocumentEcole(x.source, '/api/documents-ecole/emplois/lire')
          for (const c of r?.classes || []) {
            if (c.classId) classes.set(c.classId, c.creneaux)
            else nonReconnues.add(c.nomLu || x.nom)
          }
        } else {
          const r = await lireDocumentEcole(x.source, '/api/documents-ecole/absences/lire')
          absences.push(...(r || []).filter((l) => l.trouve))
        }
        maj(x.id, { etape: 'fait' })
      } catch (err) {
        echecs.push(`${x.nom} : ${err.message}`)
        maj(x.id, { etape: 'pret' })
      }
    }
    setEtat('Enregistrement…')
    try {
      if (nature === 'emploi_du_temps' && classes.size) {
        const liste = [...classes].map(([classId, creneaux]) => ({ classId, creneaux }))
        let nbC = 0
        let nbCours = 0
        for (let i = 0; i < liste.length; i += 40) {
          const r = (await api.post('/api/documents-ecole/emplois/appliquer', { classes: liste.slice(i, i + 40) })).data
          nbC += r?.classes || 0
          nbCours += r?.cours || 0
        }
        annoncer(`Emploi du temps enregistré pour ${nbC} classe(s) : ${nbCours} cours.`)
      }
      if (nature === 'cahier_appel' && absences.length) {
        let ajoutees = 0
        let dejaLa = 0
        let aVenir = 0
        for (let i = 0; i < absences.length; i += 2500) {
          const r = (await api.post('/api/documents-ecole/absences/appliquer', { absences: absences.slice(i, i + 2500) }, { rejouable: true })).data
          ajoutees += r?.ajoutees || 0
          dejaLa += r?.dejaLa || 0
          aVenir += r?.aVenir || 0
        }
        annoncer(`${ajoutees} absence(s) ajoutée(s)${dejaLa ? `, ${dejaLa} déjà enregistrée(s) (non modifiées)` : ''}${aVenir ? `, ${aVenir} ignorée(s) car datée(s) de jours pas encore arrivés` : ''}.`)
      }
    } catch (err) {
      echecs.push(err.message)
    }
    if (nature === 'emploi_du_temps' && classes.size) await archiver(groupe.filter((x) => !echecs.some((e) => e.startsWith(`${x.nom} :`))), publierAussi.emploi_du_temps !== false)
    setItems((l) => l.filter((x) => x.etape !== 'fait'))
    const alertes = [...(nonReconnues.size ? [`Classes non reconnues : ${[...nonReconnues].join(', ')}`] : []), ...echecs]
    if (alertes.length) setError(alertes.join(' · '))
    setEtat('')
  }
  const zoneDepot = useDepotPage(choisir, { texte: 'Déposez vos documents', detail: 'PDF, Word, Excel, PowerPoint, photos, vidéos' })

  // Version deja publiee d'un document (meme nom de fichier, ou meme titre dans le meme type)
  const versionPubliee = (x) =>
    (liste.data || []).find((d) => {
      const f = Array.isArray(d.medias) ? d.medias[0] : null
      const libelle = (CATEGORIES.find((c) => c[0] === x.categorie) || [])[1]
      return (f?.nom && f.nom === x.nom) || (sansAccent(d.title) === sansAccent(x.titre) && d.categorie === libelle)
    }) || null
  const publiables = items.filter((x) => x.etape === 'pret' && !DESTINATIONS[x.analyse?.nature])
  const reconnus = new Map()
  for (const x of items) {
    const n = x.analyse?.nature
    if (DESTINATIONS[n] && (x.etape === 'pret' || x.etape === 'lecture' || x.etape === 'fait')) {
      if (!reconnus.has(n)) reconnus.set(n, [])
      reconnus.get(n).push(x)
    }
  }
  const ENLIGNE = ['emploi_du_temps', 'cahier_appel']
  // Enseignant : ces documents sont geres par l'administration (pages reservees a l'etablissement)
  const enseignant = user.role === 'teacher'
  const reserveEtablissement = (nature) => enseignant && ['liste_enseignants', 'liste_eleves', 'cahier_appel', 'emploi_du_temps', 'frais'].includes(nature)
  async function publier() {
    setError('')
    setOk('')
    let n = 0
    const faits = []
    for (const x of publiables) {
      setEtat(`Publication ${n + 1} / ${publiables.length}…`)
      try {
        const { titre, categorie, description, audience, dateEvenement, lieu } = x
        await api.post('/api/actualites/documents', { titre, categorie, description, audience, dateEvenement, lieu, fichiers: [{ type: x.fichier.type, url: x.fichier.url, nom: x.fichier.nom }] })
        const ancien = x.garderLesDeux ? null : versionPubliee(x)
        if (ancien) await api.delete(`/api/actualites/${ancien.id}`).catch(() => {})
        retirerItem(x.id)
        faits.push(x)
        n += 1
      } catch (err) {
        maj(x.id, { etape: 'erreur', message: err.message })
      }
    }
    setEtat('')
    if (n) {
      const pub = faits.filter((x) => x.audience !== 'interne').length
      const int = faits.length - pub
      annoncer(
        [pub ? (pub === 1 ? '1 document publié dans le fil des familles' : `${pub} documents publiés dans le fil des familles`) : '', int ? (int === 1 ? '1 document gardé pour l’établissement' : `${int} documents gardés pour l’établissement`) : '']
          .filter(Boolean)
          .join(' · '),
      )
      const groupes = [...new Set(faits.map((x) => (CATEGORIES.find((c) => c[0] === x.categorie) || CATEGORIES[CATEGORIES.length - 1])[2]))]
      if (groupes.length === 1) ouvrirDossier(groupes[0])
      liste.reload()
    }
  }

  async function retirer(id) {
    if (!window.confirm('Retirer ce document du fil ?')) return
    try {
      await api.delete(`/api/actualites/${id}`)
      liste.reload()
    } catch (err) {
      setError(err.message)
    }
  }

  // Liste publiee : un dossier par type de document ; dans un dossier, les documents par mois
  const docs = [...(liste.data || [])]
    .filter((d) => user.role !== 'teacher' || (d.mien && Array.isArray(d.medias) && d.medias[0]?.url))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const dossiers = new Map()
  for (const d of docs) {
    const g = groupeDe(d.categorie)
    if (!dossiers.has(g)) dossiers.set(g, [])
    dossiers.get(g).push(d)
  }
  const types = [...new Set(CATEGORIES.map((c) => c[2]))].filter((g) => dossiers.has(g))
  const recherche = q.trim()
  const dansDossier = type && dossiers.has(type)
  const visibles = recherche ? docs.filter((d) => sansAccent(`${d.title} ${d.categorie}`).includes(sansAccent(recherche))) : dansDossier ? dossiers.get(type) : []
  const mois = []
  for (const d of visibles) {
    const dt = new Date(d.created_at)
    const cle = `${MOIS[dt.getMonth()]} ${dt.getFullYear()}`
    if (!mois.length || mois[mois.length - 1].cle !== cle) mois.push({ cle, docs: [] })
    mois[mois.length - 1].docs.push(d)
  }
  // le mois le plus recent est ouvert, les autres se deplient au toucher
  const estOuvert = (cle, i) => (cle in ouverts ? ouverts[cle] : i === 0 || Boolean(recherche))

  return (
    <>
      {zoneDepot}
      <div className="page-tete">
        <div>
          <h1 className="page-title">Documents</h1>
          {liste.data && <p className="muted">{docs.length ? `${docs.length} document(s) ${user.role === 'teacher' ? 'ajouté(s)' : 'publié(s)'}` : user.role === 'teacher' ? 'Vos fiches, cours, sujets et progressions' : 'Aucun document publié'}</p>}
        </div>
        <button type="button" className="btn bouton-icone" onClick={() => champ.current?.click()} disabled={Boolean(etat)}>
          <IcImport size={18} /> Ajouter
        </button>
      </div>
      {user.role === 'teacher' && !items.length && (
        <button type="button" className="doc-dossier" onClick={() => (iPhone ? champ : champDossier).current?.click()} disabled={Boolean(etat)}>
          <b>Ajouter tout un dossier</b>
          <small>{iPhone ? 'Dans l’app Fichiers : appui long sur le dossier › Compresser, puis choisissez le fichier .zip' : 'Choisissez le dossier (ou un .zip) : chaque fichier est reconnu et classé'}</small>
        </button>
      )}
      <input ref={champDossier} type="file" hidden webkitdirectory="" directory="" multiple onChange={choisir} />
      {user.role === 'principal' && (
        <a className="doc-dossier" href="#/dossier">
          <b>Ajouter tout un dossier</b>
          <small>Chaque fichier est reconnu et rangé au bon endroit</small>
        </a>
      )}
      <input ref={champ} type="file" hidden multiple accept={`${ACCEPT},.zip,application/zip`} onChange={choisir} />
      <CompteurIA discret />
      <Note kind="ok">{ok}</Note>
      <Note>{error}</Note>

      {/* ---------- documents en cours d'ajout ---------- */}
      {items.length > 0 && (
        <section className="docs-ajout">
          <p className="niveau-titre">{etat || `À ajouter · ${items.length}`}</p>
          {[...reconnus].map(([nature, groupe]) => {
            const d = DESTINATIONS[nature]
            const enCours = groupe.some((x) => x.etape !== 'pret')
            return (
              <div key={nature} className="doc-carte doc-groupe">
                <div className="doc-entete">
                  <span className="doc-badge">{groupe.length > 1 ? groupe.length : ETIQUETTE(groupe[0].nom, groupe[0].type)}</span>
                  <span className="doc-nom">
                    <b>{quantite(nature, groupe.length)}</b>
                    <small>{groupe.length === 1 ? groupe[0].nom : 'Reconnus automatiquement · ne seront pas publiés'}</small>
                  </span>
                  <button type="button" className="doc-croix" aria-label="Ne pas ajouter ces documents" title="Ne pas ajouter ces documents" disabled={enCours} onClick={() => setItems((l) => l.filter((x) => !groupe.includes(x)))}>
                    ×
                  </button>
                </div>
                {groupe.length > 1 && (
                  <details className="doc-fichiers">
                    <summary>Voir les fichiers</summary>
                    <ul>
                      {groupe.map((x) => (
                        <li key={x.id}>
                          <span>{x.nom}</span>
                          {!enCours && (
                            <button type="button" aria-label="Retirer ce fichier" onClick={() => retirerItem(x.id)}>
                              ×
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <div className="doc-destination">
                  {reserveEtablissement(nature) ? (
                    <>
                      <p>Document géré par l’administration : il n’est pas publié. Transmettez-le à l’établissement, qui l’ajoutera.</p>
                      <a className="btn btn-quiet btn-block" href="#/messages?nouveau=etablissement">
                        Écrire à l’établissement
                      </a>
                    </>
                  ) : nature === 'notes_nominatives' && enseignant ? (
                    <>
                      <p>Relevé de notes d’élèves : il n’est pas publié aux familles. Les notes se saisissent dans Mes classes → Notes.</p>
                      <a className="btn btn-quiet btn-block" href="#/mes-classes">
                        Saisir les notes
                      </a>
                    </>
                  ) : d[0] ? (
                    <button type="button" className="btn btn-block" disabled={Boolean(etat)} onClick={() => (ENLIGNE.includes(nature) ? toutAjouter(groupe) : transmettre(groupe))}>
                      {enCours ? etat || 'Lecture…' : groupe.length > 1 ? `${d[2]} (${groupe.length})` : d[2]}
                    </button>
                  ) : (
                    <p>Les notes se saisissent dans Notes : ce document n’est pas affiché aux familles.</p>
                  )}
                  {!enCours && ENLIGNE.includes(nature) && groupe.length === 1 && !reserveEtablissement(nature) && (
                    <button type="button" className="lien-action discret" onClick={() => transmettre(groupe)}>
                      Vérifier avant d’ajouter
                    </button>
                  )}
                  {!enCours && d[3] && !reserveEtablissement(nature) && (
                    <label className="check doc-aussi">
                      <input type="checkbox" checked={publierAussi[nature] !== false} onChange={(e) => setPublierAussi((p) => ({ ...p, [nature]: e.target.checked }))} />
                      <span>Publier aussi dans le fil des familles</span>
                    </label>
                  )}
                </div>
              </div>
            )
          })}
          {items.filter((x) => !DESTINATIONS[x.analyse?.nature]).map((x) => {
            const dest = null
            const libelleType = (CATEGORIES.find((c) => c[0] === x.categorie) || CATEGORIES[CATEGORIES.length - 1])[1]
            return (
              <div key={x.id} className="doc-carte">
                <div className="doc-entete">
                  <span className="doc-badge">{ETIQUETTE(x.nom, x.type)}</span>
                  <span className="doc-nom">
                    <b>{x.etape === 'pret' && !dest ? x.titre || x.nom : x.nom}</b>
                    <small>
                      {x.etape === 'lecture' && 'Lecture…'}
                      {x.etape === 'pret' && !dest && `${libelleType} · ${PUBLICS[x.audience]}`}
                      {x.etape === 'pret' && versionPubliee(x) && (
                        <span className="doc-remplace">
                          {x.garderLesDeux ? 'Ajouté en plus de la version déjà publiée' : `Remplace la version du ${jour(versionPubliee(x).created_at)}`}
                          <button type="button" className="lien-action discret" onClick={() => maj(x.id, { garderLesDeux: !x.garderLesDeux })}>
                            {x.garderLesDeux ? 'Remplacer' : 'Garder les deux'}
                          </button>
                        </span>
                      )}
                    </small>
                  </span>
                  {x.etape === 'pret' && !dest && (
                    <button type="button" className="lien-action discret" onClick={() => maj(x.id, { ouvert: !x.ouvert })}>
                      {x.ouvert ? 'Fermer' : 'Modifier'}
                    </button>
                  )}
                  <button type="button" className="doc-croix" aria-label="Ne pas ajouter ce document" title="Ne pas ajouter ce document" onClick={() => retirerItem(x.id)}>
                    ×
                  </button>
                </div>
                {x.etape === 'erreur' && <Note>{x.message}</Note>}
                {x.etape === 'pret' && !dest && x.ouvert && (
                  <div className="doc-champs">
                    <Field label="Titre">
                      <input className="input" value={x.titre} onChange={(e) => maj(x.id, { titre: e.target.value })} />
                    </Field>
                    <div className="grid2">
                      <Field label="Type de document">
                        <select className="input" value={x.categorie} onChange={(e) => maj(x.id, { categorie: e.target.value, ...(e.target.value === 'administration' ? { audience: 'interne' } : {}) })}>
                          {(enseignant ? ['cours', 'exercices', 'examen', 'progression', 'resultats', 'evenement', 'communique', 'fournitures', 'autre'].map((k) => CATEGORIES.find((c) => c[0] === k)) : CATEGORIES.filter((c) => c[0] !== 'absences' || user.role === 'principal')).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Visible par">
                        <select className="input" value={x.audience} onChange={(e) => maj(x.id, { audience: e.target.value })}>
                          <option value="tous">Tout le monde</option>
                          <option value="parents">Les parents</option>
                          <option value="eleves">Les élèves</option>
                          {user.role === 'principal' && <option value="enseignants">Les enseignants</option>}
                          {user.role === 'principal' && <option value="interne">L’établissement seulement</option>}
                        </select>
                      </Field>
                    </div>
                    {['reunion', 'evenement', 'examen', 'calendrier'].includes(x.categorie) && (
                      <div className="grid2">
                        <Field label="Date">
                          <input className="input" type="date" value={x.dateEvenement} onChange={(e) => maj(x.id, { dateEvenement: e.target.value })} />
                        </Field>
                        <Field label="Lieu">
                          <input className="input" value={x.lieu} onChange={(e) => maj(x.id, { lieu: e.target.value })} />
                        </Field>
                      </div>
                    )}
                    {x.audience !== 'interne' && (
                      <Field label="Résumé pour les familles (facultatif)">
                        <textarea className="input" value={x.description} onChange={(e) => maj(x.id, { description: e.target.value })} style={{ minHeight: 56 }} />
                      </Field>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {publiables.length > 0 && (
            <div className="actions">
              <button type="button" className="btn" onClick={publier} disabled={Boolean(etat)}>
                {publiables.length === 1 ? 'Enregistrer' : `Enregistrer les ${publiables.length} documents`}
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => setItems([])} disabled={Boolean(etat)}>
                Annuler
              </button>
            </div>
          )}
        </section>
      )}

      {/* ---------- documents publies : par type, puis par mois ---------- */}
      {liste.loading && !liste.data && <p className="muted">Chargement…</p>}
      {liste.error && !liste.data && (
        <p className="error">
          {liste.error}{' '}
          <button type="button" className="lien-action" onClick={liste.reload}>
            Réessayer
          </button>
        </p>
      )}
      {liste.data && docs.length === 0 && items.length === 0 && (
        <button type="button" className="import-zone" onClick={() => champ.current?.click()}>
          <IcImport size={26} />
          <b>Ajouter vos premiers documents</b>
          <small>{user.role === 'teacher' ? 'Cours, fiches d’exercices, sujets, progressions… en PDF, Word, Excel, photo ou vidéo. Chaque document est lu et classé automatiquement.' : 'Communiqués, calendriers, emplois du temps, frais, résultats… en PDF, Word, Excel, photo ou vidéo. Chaque document est lu et classé automatiquement.'}</small>
        </button>
      )}
      {docs.length > 0 && user.role === 'teacher' && <DocsEnseignant docs={docs} retirer={retirer} />}
      {docs.length > 0 && user.role !== 'teacher' && (
        <>
          {!dansDossier && <input className="input docs-recherche" type="search" placeholder="Rechercher un document" value={q} onChange={(e) => setQ(e.target.value)} />}

          {/* dossiers par type */}
          {!dansDossier && !recherche && (
            <div className="docs-dossiers">
              {types.map((g) => {
                const ds = dossiers.get(g)
                return (
                  <button key={g} type="button" className="doc-dossier" onClick={() => ouvrirDossier(g)}>
                    <Dossier groupe={g} />
                    <b>{g}</b>
                    <small>
                      {ds.length} {ds.length > 1 ? 'documents' : 'document'}
                    </small>
                  </button>
                )
              })}
            </div>
          )}

          {/* contenu d'un dossier, ou resultats de la recherche */}
          {(dansDossier || recherche) && (
            <>
              {dansDossier && !recherche && (
                <div className="doc-dossier-tete">
                  <button type="button" className="back" onClick={() => ouvrirDossier('')}>
                    ← Tous les documents
                  </button>
                  <h2>
                    <Dossier groupe={type} taille={34} />
                    {type}
                    <small>{dossiers.get(type).length}</small>
                  </h2>
                </div>
              )}
              {recherche && <p className="niveau-titre">{`${visibles.length} résultat(s)`}</p>}
              {mois.map((m, i) => {
                const ouvert = estOuvert(m.cle, i)
                return (
                  <section key={m.cle} className="doc-mois">
                    <button type="button" className="doc-mois-tete" aria-expanded={ouvert} onClick={() => setOuverts((o) => ({ ...o, [m.cle]: !ouvert }))}>
                      <span>{m.cle}</span>
                      <small>{m.docs.length}</small>
                      <IcChevron size={16} style={{ transform: ouvert ? 'rotate(90deg)' : 'none' }} />
                    </button>
                    {ouvert && (
                      <ul className="liste-simple">
                        {m.docs.map((d) => {
                          const f = Array.isArray(d.medias) ? d.medias[0] : null
                          return (
                            <li key={d.id}>
                              <span className="doc-badge">{ETIQUETTE(f?.nom || d.title || '', f?.type || 'document')}</span>
                              <span className="ls-texte">
                                <b>{d.title}</b>
                                <small>
                                  {recherche ? `${d.categorie} · ` : ''}
                                  {jour(d.created_at)}
                                  {` · ${VISIBILITE[d.audience] || VISIBILITE.tous}`}
                                  {d.last_name && !d.mien ? ` · ${d.first_name} ${d.last_name}` : ''}
                                  {d.audience !== 'interne' && d.vues > 0 ? ` · vu par ${d.vues.toLocaleString('fr-FR')} ${d.vues > 1 ? 'personnes' : 'personne'}` : ''}
                                </small>
                              </span>
                              <span className="doc-actions">
                                {f?.url && (
                                  <a className="lien-action" href={f.url} target="_blank" rel="noreferrer">
                                    Ouvrir
                                  </a>
                                )}
                                {(user.role === 'principal' || d.mien) && (
                                  <button type="button" className="lien-action discret" onClick={() => retirer(d.id)}>
                                    Retirer
                                  </button>
                                )}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </section>
                )
              })}
              {recherche && visibles.length === 0 && <p className="muted">Aucun document trouvé.</p>}
            </>
          )}
        </>
      )}
    </>
  )
}
