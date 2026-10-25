import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'

const TYPES = { maternelle: 'Maternelle', primaire: 'École primaire', college: 'Collège', lycee: 'Lycée' }
const vide = { name: '', type: 'lycee', city: '', code: '' }
const adminVide = { email: '', firstName: '', lastName: '', phone: '', password: '' }

function Administrateur({ ecole, onDone }) {
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

export default function Schools() {
  const liste = useApi('/api/schools')
  const [f, setF] = useState(vide)
  const [ouvert, setOuvert] = useState(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const maj = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  async function creer(e) {
    e.preventDefault()
    setError('')
    setOk('')
    setBusy(true)
    try {
      await api.post('/api/schools', f)
      setF(vide)
      setOk('Établissement ajouté.')
      liste.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <>
      <h1 className="page-title">Établissements</h1>
      <p className="lede">Ajoutez les établissements et désignez leur administrateur.</p>

      <form className="card" onSubmit={creer}>
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
        <Note kind="ok">{ok}</Note>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Ajout…' : '+ Ajouter l’établissement'}
        </button>
      </form>

      <h2 className="section-title">Liste</h2>
      {liste.loading && <p className="muted">Chargement…</p>}
      {liste.data?.length === 0 && <p className="muted">Aucun établissement pour le moment.</p>}
      {liste.data?.map((e) => (
        <div className="card" key={e.id}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 28 }}>🏫</span>
            <div className="row-main">
              <div className="row-title">{e.name}</div>
              <div className="row-sub">
                {TYPES[e.type]}
                {e.city ? ` · ${e.city}` : ''} · {e.nbUtilisateurs} compte(s)
              </div>
            </div>
          </div>
          <p style={{ marginTop: 10, fontSize: 14 }}>
            <b>Administrateur : </b>
            {e.administrateurs?.length
              ? e.administrateurs.map((a) => `${a.firstName} ${a.lastName} (${a.email})`).join(', ')
              : <span className="muted">aucun</span>}
          </p>
          <div className="actions">
            <button type="button" className="btn btn-quiet" onClick={() => setOuvert(ouvert === e.id ? null : e.id)}>
              {ouvert === e.id ? 'Fermer' : 'Désigner un administrateur'}
            </button>
          </div>
          {ouvert === e.id && (
            <Administrateur
              ecole={e}
              onDone={() => {
                setOuvert(null)
                liste.reload()
              }}
            />
          )}
        </div>
      ))}
    </>
  )
}
