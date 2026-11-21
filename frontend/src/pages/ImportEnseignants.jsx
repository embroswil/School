import { useRef, useState } from 'react'
import { api } from '../api.js'
import { Note } from '../ui.jsx'
import { useDepotPage } from '../depot.jsx'
import { lignesPdf, lignesWord, preparerDocument, texteDesLignes } from '../lecture-fichier.js'
import { IcImport } from '../icones.jsx'
import CompteurIA from '../CompteurIA.jsx'

// Colonnes reconnues (sans accents, en minuscules)
const CHAMPS = {
  nom: ['nom', 'noms', 'nom de famille', 'surname', 'last name'],
  prenom: ['prenom', 'prenoms', 'prenom(s)', 'first name'],
  complet: ['noms et prenoms', 'nom et prenom', 'nom complet', 'enseignant', 'name'],
  matieres: ['matiere', 'matieres', 'matiere(s)', 'discipline', 'subject', 'subjects'],
  classes: ['classes', 'classe', 'classe(s)', 'classes enseignees', 'classes', 'class'],
  principalDe: ['professeur principal de', 'prof principal de', 'professeur principal', 'pp', 'titulaire de'],
  telephone: ['telephone', 'tel', 'phone', 'contact'],
  email: ['email', 'e-mail', 'mail', 'email (fictif)', 'courriel'],
}
const sans = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

// Rangees (tableur, PDF ou Word) -> enseignants, d'apres la ligne d'en-tete
function versEnseignants(rows) {
  const lignes = []
  const h = rows.findIndex((r) => r.some((c) => [...CHAMPS.nom, ...CHAMPS.complet].includes(sans(c))))
  if (h < 0) return lignes
  const cols = {}
  rows[h].forEach((c, i) => {
    const k = Object.keys(CHAMPS).find((champ) => CHAMPS[champ].includes(sans(c)))
    if (k && cols[k] === undefined) cols[k] = i
  })
  for (const r of rows.slice(h + 1)) {
    const v = (k) => (cols[k] === undefined ? '' : String(r[cols[k]] ?? '').trim())
    let nom = v('nom')
    let prenom = v('prenom')
    if (!nom && v('complet')) {
      const mots = v('complet').split(/\s+/)
      nom = mots[0]
      prenom = mots.slice(1).join(' ')
    }
    if (!nom) continue
    lignes.push({ nom, prenom, matieres: v('matieres'), classes: v('classes'), principalDe: v('principalDe'), telephone: v('telephone'), email: v('email') })
  }
  return lignes
}

export async function lireTableur(fichier) {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await fichier.arrayBuffer(), { type: 'array' })
  let lignes = []
  for (const nom of wb.SheetNames) lignes = lignes.concat(versEnseignants(XLSX.utils.sheet_to_json(wb.Sheets[nom], { header: 1, defval: '' })))
  return lignes
}

// Tout document : Excel, PDF et Word lus sur le telephone ; seules les photos et les PDF scannes passent par l'IA
export async function lireEnseignantsDocument(fichier) {
  if (/\.(xlsx|xls|csv|ods)$/i.test(fichier.name)) return lireTableur(fichier)
  let rows = null
  if (/\.pdf$/i.test(fichier.name)) {
    const r = (await lignesPdf(fichier)).lignes
    if (texteDesLignes(r).replace(/\s/g, '').length > 80) rows = r
  } else if (/\.docx?$/i.test(fichier.name)) rows = await lignesWord(fichier)
  if (rows) {
    const l = versEnseignants(rows)
    if (!l.length) throw new Error('Liste non reconnue : il faut une colonne « Nom » (ou « Noms et prénoms »). Envoyez le fichier Excel, ou une photo de la liste.')
    return l
  }
  return (await api.post('/api/etablissement/enseignants/lire', await preparerDocument([fichier]))).data || []
}

export default function ImportEnseignants() {
  const champ = useRef(null)
  const [lignes, setLignes] = useState(null)
  const [nom, setNom] = useState('')
  const [busy, setBusy] = useState(false)
  const [lecture, setLecture] = useState(false)
  const [error, setError] = useState('')
  const [bilan, setBilan] = useState(null)

  // Le type du fichier est reconnu : Excel/CSV lus sur le telephone ; PDF, Word et photos lus par l'IA
  async function choisir(e) {
    const fichiers = [...(e.target.files || [])]
    if (e.target.value !== undefined) e.target.value = ''
    if (!fichiers.length) return
    setError('')
    setBilan(null)
    setLecture(true)
    try {
      let l = []
      for (const f of fichiers) l = l.concat(await lireEnseignantsDocument(f))
      if (!l.length) throw new Error('Aucun enseignant trouvé dans ce document.')
      setNom(fichiers.length > 1 ? `${fichiers.length} fichiers` : fichiers[0].name)
      setLignes(l)
    } catch (err) {
      setError(err.message)
    }
    setLecture(false)
  }
  const zoneDepot = useDepotPage(choisir, { texte: 'Déposez la liste des enseignants', detail: 'Excel, PDF, Word ou photo' })

  async function importer() {
    setBusy(true)
    setError('')
    try {
      const r = (await api.post('/api/etablissement/enseignants/import', { enseignants: lignes })).data
      setBilan(r)
      setLignes(null)
      window.scrollTo(0, 0)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {zoneDepot}
      <a className="back" href="#/presence-enseignants">
        ← Enseignants
      </a>
      <h1 className="page-title">Importer les enseignants</h1>
      <CompteurIA discret />

      {bilan ? (
        <div className="resultat-import">
          <b>Liste importée</b>
          <p>
            {bilan.ajoutes} ajouté(s) · {bilan.misAJour} mis à jour · {bilan.comptesAffectes} compte(s) existant(s) affecté(s)
          </p>
          {bilan.classesInconnues?.length > 0 && <Note>Classes introuvables (créez-les ou importez d’abord les élèves) : {bilan.classesInconnues.join(', ')}</Note>}
          <div className="actions">
            <a className="btn" href="#/presence-enseignants">
              Voir l’équipe
            </a>
            <button type="button" className="btn btn-quiet" onClick={() => setBilan(null)}>
              Importer une autre liste
            </button>
          </div>
        </div>
      ) : !lignes ? (
        <>
          <input ref={champ} type="file" hidden multiple accept=".xlsx,.xls,.csv,.ods,.pdf,.docx,.doc,image/*" onChange={choisir} />
          <button type="button" className="import-zone" style={{ marginTop: 10 }} disabled={lecture} onClick={() => champ.current?.click()}>
            <IcImport size={22} />
            <b>{lecture ? 'Lecture en cours…' : 'Choisir un fichier ou une photo'}</b>
            <small>{lecture ? 'Jusqu’à une minute pour une photo ou un PDF' : 'Excel, PDF, Word ou photo'}</small>
          </button>
          <Note>{error}</Note>
          <p className="muted" style={{ fontSize: 13, marginTop: 12, lineHeight: 1.5 }}>
            Les enseignants de la liste n’ont pas à attendre votre validation : leurs matières et leurs classes sont affectées automatiquement.
          </p>
        </>
      ) : (
        <>
          <div className="barre-import">
            <div style={{ minWidth: 0 }}>
              <b style={{ display: 'block' }}>{lignes.length} enseignant(s) trouvé(s)</b>
              <small className="muted" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {nom}
              </small>
            </div>
            <button type="button" className="btn" disabled={busy} onClick={importer} style={{ flex: 'none', padding: '12px 16px' }}>
              {busy ? '…' : 'Importer'}
            </button>
          </div>
          <Note>{error}</Note>
          <ul className="liste-simple">
            {lignes.slice(0, 300).map((l, i) => (
              <li key={i}>
                <span className="ls-texte">
                  <b data-brut>
                    {l.nom} {l.prenom}
                  </b>
                  <small>{[l.matieres, l.classes].filter(Boolean).join(' · ') || '—'}</small>
                </span>
              </li>
            ))}
          </ul>
          <button type="button" className="lien-discret" onClick={() => setLignes(null)}>
            Annuler
          </button>
        </>
      )}
    </>
  )
}
