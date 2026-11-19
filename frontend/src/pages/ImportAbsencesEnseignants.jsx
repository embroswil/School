import { useRef, useState } from 'react'
import { api } from '../api.js'
import { Note } from '../ui.jsx'
import { useDepotPage } from '../depot.jsx'
import { lireDocumentEcole } from '../documents-ecole.js'
import CompteurIA from '../CompteurIA.jsx'
import { IcImport } from '../icones.jsx'

const jour = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Date illisible')

// Liste des absences des enseignants fournie par l'etablissement (rapport du surveillant general,
// cahier de presence des enseignants…) : PDF, photo, Excel ou Word. Sans heures : toute la journee ;
// avec heures : seuls les cours de ce creneau sont comptes absents.
export default function ImportAbsencesEnseignants() {
  const champ = useRef(null)
  const [lignes, setLignes] = useState(null)
  const [etat, setEtat] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  async function choisir(e) {
    const fichiers = [...(e.target.files || [])]
    e.target.value = ''
    if (!fichiers.length) return
    setError('')
    setOk('')
    setLignes(null)
    const toutes = []
    const rates = []
    for (const [n, f] of fichiers.entries()) {
      setEtat(fichiers.length > 1 ? `Lecture du fichier ${n + 1} / ${fichiers.length}…` : 'Lecture de la liste… (jusqu’à une minute)')
      try {
        toutes.push(...((await lireDocumentEcole(f, '/api/documents-ecole/enseignants-absences/lire')) || []))
      } catch (err) {
        if (fichiers.length === 1) setError(err.message)
        else rates.push(f.name)
      }
    }
    if (toutes.length) setLignes(toutes.map((l, i) => ({ ...l, cle: i, garder: l.trouve })))
    if (rates.length) setError(`${rates.length} fichier(s) non lu(s) : ${rates.join(', ')}`)
    setEtat('')
  }
  const zoneDepot = useDepotPage(choisir, { texte: 'Déposez la liste des absences des enseignants', detail: 'PDF, photo, Excel ou Word' })

  async function appliquer() {
    setBusy(true)
    setError('')
    try {
      const r = (
        await api.post('/api/documents-ecole/enseignants-absences/appliquer', {
          absences: lignes.filter((l) => l.garder).map(({ teacherId, date, debut, fin, motif }) => ({ teacherId, date, debut, fin, motif })),
        })
      ).data
      setOk(`✓ ${[r.jours && `${r.jours} journée(s) d’absence`, r.cours && `${r.cours} cours marqué(s) absent(s)`].filter(Boolean).join(' et ') || 'Aucune nouvelle absence'} enregistré(s).`)
      setLignes(null)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  const retenues = lignes ? lignes.filter((l) => l.garder).length : 0
  const ignorees = lignes ? lignes.filter((l) => !l.trouve).length : 0
  return (
    <>
      {zoneDepot}
      <a className="back" href="#/presence-enseignants">
        ← Enseignants
      </a>
      <h1 className="page-title">Absences des enseignants</h1>
      <CompteurIA discret />
      <p className="lede">Déposez la liste fournie par l’établissement (rapport du surveillant général, cahier de présence des enseignants…). Sans heures, l’absence vaut pour toute la journée ; avec des heures, seuls les cours concernés sont comptés absents.</p>
      <input ref={champ} type="file" hidden multiple accept=".pdf,.xlsx,.xls,.csv,.docx,image/*" onChange={choisir} />
      <button type="button" className="import-zone" onClick={() => champ.current?.click()} disabled={Boolean(etat)}>
        <IcImport size={22} />
        <b>{etat || 'Choisir la liste (PDF, photo, Excel ou Word)'}</b>
        <small>Un ou plusieurs fichiers</small>
      </button>
      <Note>{error}</Note>
      <Note kind="ok">{ok}</Note>

      {lignes && (
        <>
          <div className="barre-import">
            <div style={{ minWidth: 0 }}>
              <b style={{ display: 'block' }}>{retenues ? `${retenues} absence(s) à enregistrer` : 'Rien à enregistrer'}</b>
              <small className="muted">{ignorees ? `${ignorees} ligne(s) sans enseignant reconnu` : 'Toutes les lignes sont reconnues'}</small>
            </div>
            <button type="button" className="btn" disabled={busy || !retenues} onClick={appliquer} style={{ flex: 'none', padding: '12px 16px' }}>
              {busy ? '…' : 'Enregistrer'}
            </button>
          </div>
          <ul className="liste-simple">
            {lignes.map((l) => (
              <li key={l.cle} style={{ opacity: l.garder ? 1 : 0.55 }}>
                <input
                  type="checkbox"
                  checked={l.garder}
                  disabled={!l.trouve}
                  onChange={(e) => setLignes((x) => x.map((y) => (y.cle === l.cle ? { ...y, garder: e.target.checked } : y)))}
                  style={{ width: 20, height: 20, flex: 'none' }}
                  aria-label={`Enregistrer l’absence de ${l.nom}`}
                />
                <span className="ls-texte">
                  <b data-brut>{l.enseignant || l.nom}</b>
                  <small>
                    {[jour(l.date), l.debut ? `${l.debut}${l.fin ? ` – ${l.fin}` : ''}` : 'Toute la journée', l.classe, l.motif].filter(Boolean).join(' · ')}
                  </small>
                  {!l.trouve && (
                    <small className="rouge">{!l.date ? 'Date illisible' : l.sansCompte ? 'Cet enseignant n’a pas encore de compte Sùkûl' : 'Enseignant introuvable dans l’établissement'}</small>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
