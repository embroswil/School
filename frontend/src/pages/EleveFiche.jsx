import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import Discipline from './Discipline.jsx'
import { Note } from '../ui.jsx'

const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`
const jour = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—')

// Fiche d'un eleve pour l'etablissement : identite, classe, parents, scolarite
export default function EleveFiche({ id }) {
  const fiche = useApi(`/api/etablissement/eleves/${id}`)
  const scol = useApi(`/api/scolarite/eleves/${id}`)
  const classes = useApi('/api/etablissement/classes')
  const [error, setError] = useState('')
  const e = fiche.data

  async function changerClasse(classId) {
    if (!classId) return
    setError('')
    try {
      await api.post(`/api/etablissement/eleves/${id}/classe`, { classId: Number(classId) })
      fiche.reload()
    } catch (err) {
      setError(err.message)
    }
  }

  if (fiche.error) return <Note>{fiche.error}</Note>
  if (!e) return <p className="muted">Chargement…</p>
  const initiales = `${(e.first_name || '?')[0]}${(e.last_name || '')[0] || ''}`.toUpperCase()

  return (
    <>
      <section className="card profil-tete" style={{ marginTop: 4 }}>
        <span className="avatar">{initiales}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ font: '800 20px/1.2 var(--font-display)' }}>
            {e.last_name} {e.first_name}
          </div>
          <div className="muted" style={{ fontSize: 14 }}>
            {e.classe || 'Sans classe'} · {e.gender === 'male' ? 'Garçon' : e.gender === 'female' ? 'Fille' : '—'}
          </div>
          <span className={`tag ${e.a_un_compte ? 'tag-now' : 'tag-off'}`} style={{ marginTop: 6 }}>
            {e.a_un_compte ? 'A créé son compte' : 'Pas encore de compte'}
          </span>
        </div>
      </section>

      <p className="groupe-titre">Informations</p>
      <ul className="rows">
        <li className="row">
          <span className="row-main">Matricule</span>
          <span className="row-end">{(e.admission_number || '').replace(/^\d+-/, '') || '—'}</span>
        </li>
        <li className="row">
          <span className="row-main">Date de naissance</span>
          <span className="row-end">{jour(e.date_of_birth)}</span>
        </li>
        <li className="row">
          <span className="row-main">Classe</span>
          <select className="input" style={{ width: 'auto', padding: '8px 10px' }} value="" onChange={(ev) => changerClasse(ev.target.value)}>
            <option value="">{e.classe || 'Choisir…'}</option>
            {(classes.data || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </li>
        {e.email && (
          <li className="row">
            <span className="row-main">E-mail</span>
            <span className="row-end">{e.email}</span>
          </li>
        )}
      </ul>
      <Note>{error}</Note>

      <p className="groupe-titre">Parents</p>
      {e.parents.length === 0 ? (
        <p className="muted">Aucun parent relié pour le moment.</p>
      ) : (
        <ul className="rows">
          {e.parents.map((p) => (
            <li className="row" key={p.id}>
              <div className="row-main">
                <div className="row-title">
                  {p.first_name} {p.last_name}
                </div>
                <div className="row-sub">{p.email}</div>
              </div>
              {p.phone && (
                <a className="btn btn-quiet" style={{ padding: '8px 12px', fontSize: 14 }} href={`tel:${p.phone}`}>
                  📞 Appeler
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="groupe-titre">Scolarité</p>
      {scol.data ? (
        <div className="card">
          <div className="grid2">
            <div>
              <div className="muted" style={{ fontSize: 13 }}>
                Payé
              </div>
              <b style={{ fontSize: 18, color: 'var(--ok)' }}>{fcfa(scol.data.paye)}</b>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 13 }}>
                Reste
              </div>
              <b style={{ fontSize: 18, color: scol.data.reste ? 'var(--danger)' : 'var(--ok)' }}>{fcfa(scol.data.reste)}</b>
            </div>
          </div>
          {scol.data.frais.map((f) => (
            <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 15 }}>
              <span>{f.nom}</span>
              <span className={`tag ${f.reste ? 'tag-wait' : 'tag-now'}`}>{f.reste ? `Reste ${fcfa(f.reste)}` : '✓ Payé'}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">{scol.loading ? 'Chargement…' : 'Aucun frais défini.'}</p>
      )}
      <p className="groupe-titre">Discipline</p>
      <Discipline eleveId={id} gestion />
    </>
  )
}
