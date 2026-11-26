import { useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { Empty, Field, Loading, Note } from '../ui.jsx'
import { ROLE_LABEL, fullName } from '../format.js'
import { IcPlus, IcPoubelle } from '../icones.jsx'

const FILTERS = [
  ['', 'Tous'],
  ['student', 'Élèves'],
  ['teacher', 'Enseignants'],
  ['parent', 'Parents'],
  ['principal', 'Admin. établissements'],
  ['admin', 'Administrateurs'],
]

const EMPTY_FORM = { firstName: '', lastName: '', email: '', role: 'student', password: '', phone: '' }

function UserForm({ onCreated, onCancel }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (name) => (e) => setForm({ ...form, [name]: e.target.value })

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/api/users', { ...form, phone: form.phone.trim() || undefined })
      onCreated(fullName(form.firstName, form.lastName))
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <h2 className="section-title">Nouvel utilisateur</h2>
      <Field label="Prénom">
        <input className="input" required autoComplete="off" value={form.firstName} onChange={set('firstName')} />
      </Field>
      <Field label="Nom">
        <input className="input" required autoComplete="off" value={form.lastName} onChange={set('lastName')} />
      </Field>
      <Field label="Adresse e-mail">
        <input
          className="input"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          required
          autoComplete="off"
          value={form.email}
          onChange={set('email')}
        />
      </Field>
      <Field label="Rôle">
        <select className="input" value={form.role} onChange={set('role')}>
          {Object.entries(ROLE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Mot de passe provisoire (8 caractères minimum)">
        <input
          className="input"
          required
          minLength={8}
          autoComplete="off"
          autoCapitalize="none"
          value={form.password}
          onChange={set('password')}
        />
      </Field>
      <Field label="Téléphone (facultatif)">
        <input className="input" type="tel" autoComplete="off" value={form.phone} onChange={set('phone')} />
      </Field>
      <Note>{error}</Note>
      <div className="actions">
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Création…' : 'Créer le compte'}
        </button>
        <button className="btn btn-quiet" type="button" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  )
}

export default function Users() {
  const { user: me } = useAuth()
  const [role, setRole] = useState('')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [flash, setFlash] = useState('')
  const [rowError, setRowError] = useState('')

  const params = new URLSearchParams({ page: String(page), limit: '20' })
  if (role) params.set('role', role)
  if (query) params.set('search', query)
  const list = useApi(`/api/users?${params}`)

  function chooseRole(value) {
    setRole(value)
    setPage(1)
  }

  function submitSearch(event) {
    event.preventDefault()
    setQuery(search.trim())
    setPage(1)
  }

  async function toggle(target) {
    setRowError('')
    setFlash('')
    try {
      await api.patch(`/api/users/${target.id}/status`, { isActive: !target.isActive })
      list.reload()
    } catch (err) {
      setRowError(err.message)
    }
  }

  async function supprimer(u) {
    if (!window.confirm(`Supprimer définitivement le compte de ${u.firstName} ${u.lastName} ? Cette action est irréversible.`)) return
    setRowError('')
    try {
      await api.delete(`/api/comptes/${u.id}`)
      list.reload()
    } catch (e) {
      setRowError(e.message)
    }
  }

  function created(name) {
    setAdding(false)
    setFlash(`Le compte de ${name} est créé. Communiquez-lui son mot de passe provisoire.`)
    list.reload()
  }

  const users = list.data ?? []
  const meta = list.meta

  return (
    <>
      <div className="page-tete">
        <div>
          <h1 className="page-title">Comptes</h1>
          <p className="muted">{meta?.total !== undefined ? `${meta.total} compte(s)` : 'Personnes inscrites sur Sùkûl'}</p>
        </div>
        {!adding && (
          <button className="btn cpt-ajout" type="button" onClick={() => setAdding(true)}>
            <IcPlus size={18} /> Ajouter
          </button>
        )}
      </div>

      {adding && (
        <div className="card" style={{ marginBottom: 14 }}>
          <UserForm onCreated={created} onCancel={() => setAdding(false)} />
        </div>
      )}
      <Note kind="ok">{flash}</Note>

      <form className="searchbar" onSubmit={submitSearch} role="search">
        <input className="input" type="search" placeholder="Rechercher un nom ou un e-mail" aria-label="Rechercher un utilisateur" value={search} onChange={(e) => setSearch(e.target.value)} />
      </form>
      <div className="cpt-filtres" role="group" aria-label="Filtrer par rôle">
        {FILTERS.map(([value, label]) => (
          <button key={value} type="button" className="chip" aria-pressed={role === value} onClick={() => chooseRole(value)}>
            {label}
          </button>
        ))}
      </div>

      <Note>{list.error || rowError}</Note>
      {list.loading && !list.data ? <Loading /> : null}
      {!list.loading && !list.error && users.length === 0 && <Empty>Aucun compte ne correspond à cette recherche.</Empty>}

      <ul className="cpt-liste">
        {users.map((u) => (
          <li className={`cpt-carte ${u.isActive ? '' : 'off'}`} key={u.id}>
            <span className="cpt-avatar" aria-hidden="true">
              {`${u.firstName?.[0] || ''}${u.lastName?.[0] || ''}`.toUpperCase()}
            </span>
            <div className="cpt-info">
              <b data-brut>{fullName(u.firstName, u.lastName)}</b>
              <span className="cpt-email" data-brut>{u.email}</span>
              <span className="cpt-tags">
                <span className="tag">{ROLE_LABEL[u.role] ?? u.role}</span>
                {u.schoolName && <span className="cpt-ecole" data-brut>{u.schoolName}</span>}
                {!u.isActive && <span className="tag tag-off">Désactivé</span>}
                {u.status === 'pending' && <span className="tag tag-off">En attente</span>}
              </span>
            </div>
            <div className="cpt-actions">
              {u.id === me.id ? (
                <span className="muted">Vous</span>
              ) : (
                <>
                  <button className="btn btn-quiet" type="button" onClick={() => toggle(u)}>
                    {u.isActive ? 'Désactiver' : 'Réactiver'}
                  </button>
                  <button className="icon-btn cpt-suppr" type="button" aria-label={`Supprimer le compte de ${u.firstName} ${u.lastName}`} title="Supprimer" onClick={() => supprimer(u)}>
                    <IcPoubelle size={18} />
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {meta && meta.totalPages > 1 && (
        <div className="pager">
          <button className="btn btn-quiet" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Précédent
          </button>
          <span className="muted">
            Page {meta.page} sur {meta.totalPages}
          </span>
          <button className="btn btn-quiet" type="button" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>
            Suivant
          </button>
        </div>
      )}
    </>
  )
}
