import { useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { ChampMotDePasse, Field, Note } from '../ui.jsx'

const VIDE = { firstName: '', lastName: '', email: '', phone: '', password: '', password2: '' }

export default function Administrateurs() {
  const { user } = useAuth()
  const liste = useApi('/api/etablissement/administrateurs')
  const [f, setF] = useState(VIDE)
  const [ouvert, setOuvert] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const max = liste.meta?.max || 3
  const admins = liste.data || []
  const maj = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function ajouter(e) {
    e.preventDefault()
    setError('')
    setOk('')
    if (f.password && f.password !== f.password2) return setError('Les deux mots de passe ne correspondent pas')
    setBusy(true)
    try {
      const { password2, ...donnees } = f
      const r = await api.post('/api/etablissement/administrateurs', donnees)
      setOk(r.message || 'Administrateur ajouté')
      setF(VIDE)
      setOuvert(false)
      liste.reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  async function retirer(a) {
    if (!window.confirm(`Retirer ${a.first_name} ${a.last_name} des administrateurs ? Il redevient enseignant.`)) return
    try {
      await api.delete(`/api/etablissement/administrateurs/${a.id}`)
      liste.reload()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <>
      <h1 className="page-title">Administrateurs</h1>
      <p className="lede">
        Jusqu’à {max} personnes de votre personnel peuvent administrer l’établissement (proviseur, censeur, économe…). {admins.length} sur {max}.
      </p>
      <Note kind="ok">{ok}</Note>
      <Note>{error}</Note>
      <div className="liste-reglages">
        {admins.map((a) => (
          <div key={a.id} className="reglage" style={{ cursor: 'default' }}>
            <span className="ico">
              <b>{`${a.first_name?.[0] || ''}${a.last_name?.[0] || ''}`.toUpperCase()}</b>
            </span>
            <span>
              {a.first_name} {a.last_name}
              <small className="muted" style={{ display: 'block' }}>
                {a.email}
              </small>
            </span>
            <span className="val">
              {a.id === user.id ? (
                'Vous'
              ) : (
                <button type="button" className="btn btn-quiet btn-danger" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => retirer(a)}>
                  Retirer
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
      {admins.length < max && !ouvert && (
        <button type="button" className="btn btn-block" style={{ marginTop: 14 }} onClick={() => setOuvert(true)}>
          + Ajouter un administrateur
        </button>
      )}
      {ouvert && (
        <form onSubmit={ajouter} className="card" style={{ marginTop: 14 }}>
          <b>Nouvel administrateur</b>
          <p className="muted" style={{ fontSize: 13 }}>
            Si c’est un enseignant déjà inscrit dans votre établissement, indiquez seulement son email.
          </p>
          <div className="grid2">
            <Field label="Prénom">
              <input className="input" value={f.firstName} onChange={maj('firstName')} />
            </Field>
            <Field label="Nom">
              <input className="input" value={f.lastName} onChange={maj('lastName')} />
            </Field>
          </div>
          <Field label="Adresse e-mail">
            <input className="input" type="email" required value={f.email} onChange={maj('email')} />
          </Field>
          <Field label="Téléphone (facultatif)">
            <input className="input" type="tel" value={f.phone} onChange={maj('phone')} />
          </Field>
          <Field label="Mot de passe provisoire (8 caractères minimum)">
            <ChampMotDePasse autoComplete="new-password" minLength={8} required={false} value={f.password} onChange={maj('password')} />
          </Field>
          {f.password && (
            <Field label="Confirmer le mot de passe">
              <ChampMotDePasse autoComplete="new-password" minLength={8} value={f.password2} onChange={maj('password2')} />
            </Field>
          )}
          <div className="actions">
            <button className="btn" disabled={busy}>
              {busy ? 'Ajout…' : 'Ajouter'}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setOuvert(false)}>
              Annuler
            </button>
          </div>
        </form>
      )}
    </>
  )
}
