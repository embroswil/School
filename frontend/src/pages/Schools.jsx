import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'

const TYPES = { maternelle: 'Maternelle', primaire: 'École primaire', college: 'Collège', lycee: 'Lycée' }
const vide = { name: '', type: 'lycee', city: '', code: '' }
const adminVide = { email: '', firstName: '', lastName: '', phone: '', password: '' }

export function Administrateur({ ecole, onDone }) {
  const [f, setF] = useState(adminVide)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const maj = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  async function envoyer(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api.post(`/api/schools/${ecole.id}/administrateur`, f)
      setF(adminVide)
      onDone()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }
  return (
    <form onSubmit={envoyer} style={{ marginTop: 12 }}>
      <p className="muted" style={{ fontSize: 14, marginBottom: 10 }}>
        Email d’un compte existant (il devient administrateur), ou nouveau compte complet.
      </p>
      <Field label="Email">
        <input className="input" type="email" value={f.email} onChange={maj('email')} required />
      </Field>
      <div className="grid2">
        <Field label="Prénom">
          <input className="input" value={f.firstName} onChange={maj('firstName')} />
        </Field>
        <Field label="Nom">
          <input className="input" value={f.lastName} onChange={maj('lastName')} />
        </Field>
      </div>
      <div className="grid2">
        <Field label="Téléphone">
          <input className="input" value={f.phone} onChange={maj('phone')} />
        </Field>
        <Field label="Mot de passe">
          <input className="input" type="password" value={f.password} onChange={maj('password')} placeholder="Nouveau compte" />
        </Field>
      </div>
      <Note>{error}</Note>
      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'Enregistrement…' : 'Désigner l’administrateur'}
      </button>
    </form>
  )
}

function Demandes({ onChange }) {
  const demandes = useApi('/api/demandes-etablissements?status=pending')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(null)
  async function decider(id, action) {
    let motif
    if (action === 'refuser') motif = window.prompt('Motif du refus (facultatif) :') ?? undefined
    setError('')
    setOk('')
    setBusy(id)
    try {
      const r = await api.post(`/api/demandes-etablissements/${id}/${action}`, motif ? { motif } : {})
      setOk(r.message)
      demandes.reload()
      onChange()
    } catch (err) {
      setError(err.message)
    }
    setBusy(null)
  }
  if (!demandes.data?.length && !ok && !error) return null
  return (
    <>
      <h2 className="section-title">
        Demandes d’inscription <span className="count">{demandes.data?.length || 0}</span>
      </h2>
      <Note>{error}</Note>
      <Note kind="ok">{ok}</Note>
      {demandes.data?.map((d) => (
        <div className="card" key={d.id}>
          <div className="row-title" style={{ fontSize: 17 }}>
            🏫 {d.name}
          </div>
          <div className="row-sub">
            {TYPES[d.type]}
            {d.city ? ` · ${d.city}` : ''}
            {d.student_count ? ` · ${d.student_count} élèves` : ''}
          </div>
          <ul style={{ marginTop: 10, fontSize: 15, display: 'grid', gap: 4 }}>
            {d.address && <li>📍 {d.address}</li>}
            <li>
              👤 {d.contact_first_name} {d.contact_last_name}
              {d.contact_function ? ` · ${d.contact_function}` : ''}
            </li>
            <li>
              ✉️ {d.contact_email} · 📞 {d.contact_phone}
            </li>
            {d.message && <li className="muted">« {d.message} »</li>}
          </ul>
          <div className="actions">
            <button type="button" className="btn btn-ok" disabled={busy === d.id} onClick={() => decider(d.id, 'valider')}>
              ✓ Activer l’établissement
            </button>
            <button type="button" className="btn btn-quiet btn-danger" disabled={busy === d.id} onClick={() => decider(d.id, 'refuser')}>
              Refuser
            </button>
          </div>
        </div>
      ))}
    </>
  )
}

function Ajouter({ onDone }) {
  const [f, setF] = useState(vide)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const maj = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  async function creer(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const r = await api.post('/api/schools', f)
      window.location.hash = `/etablissements/${r.data.id}`
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
    onDone()
  }
  return (
    <form className="card" onSubmit={creer}>
      <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>
        Pour un établissement rencontré sur le terrain. Les écoles peuvent aussi faire leur demande elles-mêmes depuis la page d’accueil.
      </p>
      <Field label="Nom de l’établissement">
        <input className="input" placeholder="ex. Lycée Bilingue de Bonabéri" value={f.name} onChange={maj('name')} required />
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
          <input className="input" placeholder="ex. Douala" value={f.city} onChange={maj('city')} />
        </Field>
      </div>
      <Field label="Code (facultatif)">
        <input className="input" placeholder="ex. LBB-DLA" value={f.code} onChange={maj('code')} />
      </Field>
      <Note>{error}</Note>
      <button className="btn btn-block" type="submit" disabled={busy}>
        {busy ? 'Ajout…' : 'Ajouter l’établissement'}
      </button>
    </form>
  )
}

// Etablissements : liste, demandes en attente, ajout
export default function Schools() {
  const liste = useApi('/api/schools')
  const demandes = useApi('/api/demandes-etablissements?status=pending')
  const nbDemandes = demandes.data?.length || 0
  const [onglet, setOnglet] = useState(null)
  const actif = onglet || (nbDemandes ? 'demandes' : 'liste')
  const [recherche, setRecherche] = useState('')
  const q = recherche.trim().toLowerCase()
  const ecoles = (liste.data || []).filter((e) => !q || `${e.name} ${e.city || ''}`.toLowerCase().includes(q))

  return (
    <>
      <div className="chips" style={{ marginTop: 4 }}>
        <button type="button" className="chip" aria-pressed={actif === 'liste'} onClick={() => setOnglet('liste')}>
          Établissements {liste.data ? `(${liste.data.length})` : ''}
        </button>
        <button type="button" className="chip" aria-pressed={actif === 'demandes'} onClick={() => setOnglet('demandes')}>
          Demandes {nbDemandes > 0 && <span className="count" style={{ marginLeft: 4 }}>{nbDemandes}</span>}
        </button>
        <button type="button" className="chip" aria-pressed={actif === 'ajouter'} onClick={() => setOnglet('ajouter')}>
          + Ajouter
        </button>
      </div>

      {actif === 'demandes' &&
        (nbDemandes === 0 ? (
          <p className="muted">Aucune demande en attente.</p>
        ) : (
          <Demandes
            onChange={() => {
              demandes.reload()
              liste.reload()
            }}
          />
        ))}

      {actif === 'ajouter' && <Ajouter onDone={() => liste.reload()} />}

      {actif === 'liste' && (
        <>
          {(liste.data?.length || 0) > 5 && (
            <input className="input" placeholder="Rechercher un établissement" value={recherche} onChange={(e) => setRecherche(e.target.value)} style={{ marginBottom: 12 }} />
          )}
          {liste.loading && <p className="muted">Chargement…</p>}
          {liste.data?.length === 0 && <p className="muted">Aucun établissement pour le moment.</p>}
          {ecoles.map((e) => (
            <a className="ecole-carte" key={e.id} href={`#/etablissements/${e.id}`}>
              <div className="ecole-tete">
                <span
                  className="pastille-ico"
                  style={{ width: 44, height: 44, ...(e.photo ? { backgroundImage: `url(${e.photo})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}) }}
                >
                  {e.photo ? '' : '🏫'}
                </span>
                <div className="row-main">
                  <div className="row-title">{e.name}</div>
                  <div className="row-sub">
                    {TYPES[e.type]}
                    {e.city ? ` · ${e.city}` : ''} · {e.nbUtilisateurs} compte(s)
                  </div>
                  <div className="row-sub" style={{ fontSize: 13 }}>
                    {e.administrateurs?.length ? `Admin : ${e.administrateurs.map((a) => `${a.firstName} ${a.lastName}`).join(', ')}` : 'Aucun administrateur'}
                  </div>
                </div>
                {e.isActive ? <span className="tag tag-now">Actif</span> : <span className="tag tag-off">Suspendu</span>}
              </div>
            </a>
          ))}
        </>
      )}
    </>
  )
}
