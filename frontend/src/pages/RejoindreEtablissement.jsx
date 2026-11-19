import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'
import { IcChevron, IcEcole } from '../icones.jsx'

const TYPES = { maternelle: 'Maternelle', primaire: 'École primaire', college: 'Collège', lycee: 'Lycée' }
const ETATS = { pending: ['En attente de validation', 'neutre'], approved: ['Acceptée', 'ok'], rejected: ['Refusée', 'alerte'] }

// Enseignant inscrit sans etablissement : il choisit l'etablissement ou il enseigne, ses matieres et ses classes.
// Accepte tout de suite s'il figure dans la liste des enseignants de l'etablissement, sinon apres validation.
export default function RejoindreEtablissement() {
  const { user, actualiser } = useAuth()
  const demandes = useApi('/api/inscriptions/mes-etablissements')
  const [ecoles, setEcoles] = useState(null)
  const [recherche, setRecherche] = useState('')
  const [ecole, setEcole] = useState(null)
  const [structure, setStructure] = useState(null)
  const [matiereIds, setMatiereIds] = useState([])
  const [classeIds, setClasseIds] = useState([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const [nouvelle, setNouvelle] = useState(false)

  useEffect(() => {
    api
      .get('/api/schools/public')
      .then((r) => setEcoles(r.data || []))
      .catch(() => setEcoles([]))
  }, [])
  useEffect(() => {
    if (!ecole) return
    setStructure(null)
    setMatiereIds([])
    setClasseIds([])
    api
      .get(`/api/schools/${ecole.id}/structure`)
      .then((r) => setStructure(r.data))
      .catch(() => setStructure({ matieres: [], classes: [] }))
  }, [ecole])
  // Demande acceptee entre-temps : le profil est relu, l'espace enseignant s'ouvre
  const acceptee = (demandes.data || []).some((d) => d.status === 'approved')
  const relu = useRef(false)
  useEffect(() => {
    if (!acceptee || relu.current) return
    relu.current = true
    actualiser()
  }, [acceptee, actualiser])

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return (ecoles || []).filter((e) => !q || `${e.name} ${e.city || ''}`.toLowerCase().includes(q))
  }, [ecoles, recherche])
  const basculer = (setter, id) => setter((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))

  async function envoyer() {
    setBusy(true)
    setError('')
    try {
      const r = await api.post('/api/inscriptions/rejoindre', { schoolId: ecole.id, matiereIds, classeIds })
      if (r.data?.reconnu) {
        await actualiser()
        return
      }
      setOk(r.message)
      setEcole(null)
      setNouvelle(false)
      demandes.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  const enAttente = (demandes.data || []).filter((d) => d.status !== 'approved')
  const formulaire = nouvelle || (demandes.data && enAttente.length === 0)

  return (
    <>
      <h1 className="page-title">{`Bienvenue, ${user.firstName}`}</h1>
      <p className="lede">Rejoignez l’établissement où vous enseignez pour retrouver vos classes, faire l’appel et publier les notes.</p>
      <Note kind="ok">{ok}</Note>

      {enAttente.length > 0 && (
        <>
          <p className="ea-section">Vos demandes</p>
          <ul className="liste-simple">
            {enAttente.map((d) => (
              <li key={d.id}>
                <span className="ls-texte">
                  <b data-brut>{d.ecole}</b>
                  <small>{d.status === 'rejected' && d.decision_reason ? `Motif : ${d.decision_reason}` : d.city || ' '}</small>
                </span>
                <span className={`etiquette ${ETATS[d.status]?.[1] || ''}`}>{ETATS[d.status]?.[0] || d.status}</span>
              </li>
            ))}
          </ul>
          {!formulaire && (
            <div className="rj-actions">
              <button type="button" className="btn btn-quiet" onClick={() => actualiser().then(() => demandes.reload())}>
                Actualiser
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => setNouvelle(true)}>
                Autre établissement
              </button>
            </div>
          )}
        </>
      )}

      {formulaire && !ecole && (
        <>
          <p className="ea-section">Choisissez l’établissement</p>
          <input className="input ea-recherche" placeholder="Rechercher par nom ou par ville" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          {ecoles === null && <p className="muted">Chargement…</p>}
          {ecoles && filtrees.length === 0 && <p className="muted">Aucun établissement trouvé.</p>}
          <div className="ea-choix">
            {filtrees.map((e) => (
              <button key={e.id} type="button" onClick={() => setEcole(e)}>
                <span className="ea-choix-ico" style={e.photo ? { backgroundImage: `url(${e.photo})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
                  {!e.photo && <IcEcole size={20} />}
                </span>
                <span className="ea-choix-texte">
                  <b data-brut>{e.name}</b>
                  <small>{[TYPES[e.type], e.city].filter(Boolean).join(' · ')}</small>
                </span>
                <IcChevron size={16} className="ea-choix-fleche" />
              </button>
            ))}
          </div>
        </>
      )}

      {formulaire && ecole && (
        <div className="card">
          <button type="button" className="back" onClick={() => setEcole(null)}>
            ← Changer d’établissement
          </button>
          <b className="rj-ecole" data-brut>
            {ecole.name}
          </b>
          {!structure && <p className="muted">Chargement…</p>}
          {structure && (
            <>
              <span className="field-label">Matière(s) enseignée(s)</span>
              <div className="chips">
                {structure.matieres.map((m) => (
                  <button key={m.id} type="button" className="chip" aria-pressed={matiereIds.includes(m.id)} onClick={() => basculer(setMatiereIds, m.id)}>
                    {m.name}
                  </button>
                ))}
              </div>
              <span className="field-label">Vos classes</span>
              {structure.classes.length === 0 ? (
                <p className="muted" style={{ fontSize: 14 }}>
                  L’établissement n’a pas encore créé ses classes : vous pourrez les choisir plus tard.
                </p>
              ) : (
                <div className="chips">
                  {structure.classes.map((c) => (
                    <button key={c.id} type="button" className="chip" aria-pressed={classeIds.includes(c.id)} onClick={() => basculer(setClasseIds, c.id)}>
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              <Note>{error}</Note>
              <button type="button" className="btn btn-block" disabled={busy || !matiereIds.length} onClick={envoyer}>
                {busy ? 'Envoi…' : 'Rejoindre l’établissement'}
              </button>
            </>
          )}
        </div>
      )}
    </>
  )
}
