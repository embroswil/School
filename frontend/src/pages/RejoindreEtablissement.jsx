import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'
import { IcChevron, IcEcole, IcPlus } from '../icones.jsx'

const TYPES = { lycee: 'Lycée', college: 'Collège', primaire: 'École primaire', maternelle: 'Maternelle' }
const lieu = (e) => [TYPES[e.type], e.city || e.ville].filter(Boolean).join(' · ')
const INVITATION =
  'Bonjour, j’utilise Sùkûl pour suivre mes cours. Inscrivez notre établissement, c’est gratuit pour démarrer : https://sukul.site/#/inscrire-etablissement'

// Choix des matieres et des classes, puis demande pour rejoindre un etablissement Sukul
function Rejoindre({ ecole, onAnnuler, onFait }) {
  const [structure, setStructure] = useState(null)
  const [matiereIds, setMatiereIds] = useState([])
  const [classeIds, setClasseIds] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api
      .get(`/api/schools/${ecole.id}/structure`)
      .then((r) => setStructure(r.data))
      .catch(() => setStructure({ matieres: [], classes: [] }))
  }, [ecole])
  const basculer = (setter, id) => setter((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))

  async function envoyer() {
    setBusy(true)
    setError('')
    try {
      const r = await api.post('/api/inscriptions/rejoindre', { schoolId: ecole.id, matiereIds, classeIds })
      await onFait(r)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <button type="button" className="back" onClick={onAnnuler}>
        ← Autre établissement
      </button>
      <b className="rj-ecole" data-brut>
        {ecole.name}
      </b>
      {!structure && <p className="muted">Chargement…</p>}
      {structure && (
        <>
          <span className="field-label">Matière(s) enseignée(s)</span>
          {structure.matieres.length === 0 ? (
            <p className="muted" style={{ fontSize: 14 }}>
              L’établissement n’a pas encore saisi ses matières.
            </p>
          ) : (
            <div className="chips">
              {structure.matieres.map((m) => (
                <button key={m.id} type="button" className="chip" aria-pressed={matiereIds.includes(m.id)} onClick={() => basculer(setMatiereIds, m.id)}>
                  {m.name}
                </button>
              ))}
            </div>
          )}
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
  )
}

// Etablissement pas encore sur Sukul : l'enseignant le note (et peut inviter l'etablissement)
function Declarer({ nomInitial, onAnnuler, onFait }) {
  const [f, setF] = useState({ nom: nomInitial || '', ville: '', type: 'lycee' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const maj = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  async function envoyer(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/api/inscriptions/declarer', f)
      onFait()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <form className="card" onSubmit={envoyer}>
      <button type="button" className="back" onClick={onAnnuler}>
        ← Retour à la liste
      </button>
      <b className="rj-ecole">Établissement pas encore sur Sùkûl</b>
      <p className="muted rj-aide">Il apparaîtra dans vos établissements. Dès qu’il s’inscrira sur Sùkûl, votre demande lui sera envoyée automatiquement.</p>
      <Field label="Nom de l’établissement">
        <input className="input" value={f.nom} onChange={maj('nom')} placeholder="ex. Collège Saint-Michel" required />
      </Field>
      <div className="grid2">
        <Field label="Type">
          <select className="input" value={f.type} onChange={maj('type')}>
            {Object.entries(TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ville">
          <input className="input" value={f.ville} onChange={maj('ville')} placeholder="ex. Douala" required />
        </Field>
      </div>
      <Note>{error}</Note>
      <button type="submit" className="btn btn-block" disabled={busy}>
        {busy ? 'Ajout…' : 'Ajouter l’établissement'}
      </button>
    </form>
  )
}

// Mes etablissements (enseignant) : ceux ou il est accepte (et celui qui est ouvert), ses demandes en attente,
// les etablissements pas encore sur Sukul, et l'ajout d'un nouvel etablissement.
export default function RejoindreEtablissement() {
  const { user, actualiser, changerEtablissement } = useAuth()
  const d = useApi('/api/inscriptions/mes-etablissements')
  const v = d.data
  const [ajout, setAjout] = useState(false)
  const [ecoles, setEcoles] = useState(null)
  const [recherche, setRecherche] = useState('')
  const [ecole, setEcole] = useState(null)
  const [declarer, setDeclarer] = useState(false)
  const [ok, setOk] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)

  const membres = v?.membres || []
  const demandes = v?.demandes || []
  const declares = v?.declares || []
  const premiere = v && membres.length === 0 && demandes.length === 0 && declares.length === 0
  const formulaire = ajout || premiere

  useEffect(() => {
    if (!formulaire || ecoles) return
    api
      .get('/api/schools/public')
      .then((r) => setEcoles(r.data || []))
      .catch(() => setEcoles([]))
  }, [formulaire, ecoles])

  // Accepte entre-temps alors qu'aucun etablissement n'est ouvert : le profil est relu, l'espace s'ouvre
  const relu = useRef(false)
  useEffect(() => {
    if (user.schoolId || !membres.length || relu.current) return
    relu.current = true
    actualiser()
  }, [user.schoolId, membres.length, actualiser])

  const filtrees = useMemo(() => {
    const dejaLa = new Set([...(v?.membres || []), ...(v?.demandes || [])].map((m) => m.school_id))
    const q = recherche.trim().toLowerCase()
    return (ecoles || []).filter((e) => !dejaLa.has(e.id) && (!q || `${e.name} ${e.city || ''}`.toLowerCase().includes(q)))
  }, [ecoles, recherche, v])

  const fermer = () => {
    setAjout(false)
    setEcole(null)
    setDeclarer(false)
    setRecherche('')
  }
  async function ouvrir(schoolId) {
    setBusy(schoolId)
    setError('')
    try {
      await changerEtablissement(schoolId)
    } catch (err) {
      setError(err.message)
      setBusy(null)
    }
  }
  async function quitter(m) {
    if (!window.confirm(`Quitter ${m.ecole} ? Vous ne verrez plus ses classes.`)) return
    setError('')
    try {
      await api.delete(`/api/inscriptions/mes-etablissements/${m.school_id}`)
      if (m.ouvert) await actualiser()
      d.reload()
    } catch (err) {
      setError(err.message)
    }
  }
  async function retirerDeclare(x) {
    await api.delete(`/api/inscriptions/declares/${x.id}`).catch(() => {})
    d.reload()
  }
  function inviter() {
    if (navigator.share) navigator.share({ text: INVITATION }).catch(() => {})
    else window.open(`https://wa.me/?text=${encodeURIComponent(INVITATION)}`, '_blank')
  }

  return (
    <>
      <h1 className="page-title">{premiere ? `Bienvenue, ${user.firstName}` : 'Mes établissements'}</h1>
      <p className="lede">
        {premiere
          ? 'Ajoutez l’établissement où vous enseignez pour retrouver vos classes, faire l’appel et publier les notes.'
          : 'Vous enseignez dans plusieurs établissements ? Ajoutez-les tous et passez de l’un à l’autre d’un geste.'}
      </p>
      <Note kind="ok">{ok}</Note>
      <Note>{error}</Note>
      {!v && !d.error && <p className="muted">Chargement…</p>}
      <Note>{d.error}</Note>

      {!formulaire && (
        <>
          {membres.length > 0 && (
            <>
              <p className="ea-section">Sur Sùkûl</p>
              <ul className="rj-liste">
                {membres.map((m) => (
                  <li key={m.school_id} className={m.ouvert ? 'ouvert' : ''}>
                    <span className="ea-choix-ico">
                      <IcEcole size={20} />
                    </span>
                    <span className="ea-choix-texte">
                      <b data-brut>{m.ecole}</b>
                      <small>{lieu(m)}</small>
                    </span>
                    {m.ouvert ? (
                      <span className="etiquette ok">Ouvert</span>
                    ) : (
                      <button type="button" className="btn rj-ouvrir" disabled={busy === m.school_id} onClick={() => ouvrir(m.school_id)}>
                        {busy === m.school_id ? '…' : 'Ouvrir'}
                      </button>
                    )}
                    {membres.length > 1 && (
                      <button type="button" className="rj-quitter" onClick={() => quitter(m)}>
                        Quitter
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {demandes.length > 0 && (
            <>
              <p className="ea-section">Demandes</p>
              <ul className="rj-liste">
                {demandes.map((x) => (
                  <li key={x.id}>
                    <span className="ea-choix-ico">
                      <IcEcole size={20} />
                    </span>
                    <span className="ea-choix-texte">
                      <b data-brut>{x.ecole}</b>
                      <small>{x.status === 'rejected' && x.decision_reason ? `Motif : ${x.decision_reason}` : x.city || ' '}</small>
                    </span>
                    <span className={`etiquette ${x.status === 'rejected' ? 'alerte' : 'neutre'}`}>{x.status === 'rejected' ? 'Refusée' : 'En attente'}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {declares.length > 0 && (
            <>
              <p className="ea-section">Pas encore sur Sùkûl</p>
              <ul className="rj-liste">
                {declares.map((x) => (
                  <li key={x.id}>
                    <span className="ea-choix-ico neutre">
                      <IcEcole size={20} />
                    </span>
                    <span className="ea-choix-texte">
                      <b data-brut>{x.nom}</b>
                      <small>{lieu(x)}</small>
                    </span>
                    <button type="button" className="btn btn-quiet rj-ouvrir" onClick={inviter}>
                      Inviter
                    </button>
                    <button type="button" className="rj-quitter" onClick={() => retirerDeclare(x)}>
                      Retirer
                    </button>
                  </li>
                ))}
              </ul>
              <p className="muted rj-aide">Invitez ces établissements à rejoindre Sùkûl : dès leur inscription, votre demande leur est envoyée.</p>
            </>
          )}

          {v && (
            <div className="rj-actions">
              <button type="button" className="btn btn-quiet" onClick={() => setAjout(true)}>
                <IcPlus size={18} /> Ajouter un établissement
              </button>
              {demandes.some((x) => x.status === 'pending') && (
                <button type="button" className="btn btn-quiet" onClick={() => actualiser().then(() => d.reload())}>
                  Actualiser
                </button>
              )}
            </div>
          )}
        </>
      )}

      {formulaire && !ecole && !declarer && (
        <>
          {!premiere && (
            <button type="button" className="back" onClick={fermer}>
              ← Mes établissements
            </button>
          )}
          <p className="ea-section">Choisissez l’établissement</p>
          <input className="input ea-recherche" placeholder="Rechercher par nom ou par ville" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          {ecoles === null && <p className="muted">Chargement…</p>}
          <div className="ea-choix">
            {filtrees.map((e) => (
              <button key={e.id} type="button" onClick={() => setEcole(e)}>
                <span className="ea-choix-ico" style={e.photo ? { backgroundImage: `url(${e.photo})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
                  {!e.photo && <IcEcole size={20} />}
                </span>
                <span className="ea-choix-texte">
                  <b data-brut>{e.name}</b>
                  <small>{lieu(e)}</small>
                </span>
                <IcChevron size={16} className="ea-choix-fleche" />
              </button>
            ))}
          </div>
          <button type="button" className="rj-absent" onClick={() => setDeclarer(true)}>
            <b>Votre établissement n’est pas dans la liste ?</b>
            <span>Ajoutez-le : il n’est pas encore sur Sùkûl</span>
          </button>
        </>
      )}

      {formulaire && ecole && (
        <Rejoindre
          ecole={ecole}
          onAnnuler={() => setEcole(null)}
          onFait={async (r) => {
            if (r.data?.reconnu && !user.schoolId) await actualiser()
            setOk(r.message)
            fermer()
            d.reload()
          }}
        />
      )}

      {formulaire && declarer && (
        <Declarer
          nomInitial={recherche}
          onAnnuler={() => setDeclarer(false)}
          onFait={() => {
            setOk('Établissement ajouté. Invitez-le à rejoindre Sùkûl.')
            fermer()
            d.reload()
          }}
        />
      )}
    </>
  )
}
