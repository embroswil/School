import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'
import { Administrateur } from './Schools.jsx'

const TYPES = { maternelle: 'Maternelle', primaire: 'École primaire', college: 'Collège', lycee: 'Lycée' }
const nombre = (n) => (n === undefined || n === null ? '…' : Number(n).toLocaleString('fr-FR'))
const date = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—')
const depuis = (d) => {
  if (!d) return 'aucune connexion'
  const j = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
  return j <= 0 ? 'aujourd’hui' : j === 1 ? 'hier' : `il y a ${j} jours`
}

// Fiche d'un etablissement, vue par l'administrateur de la plateforme
export default function SchoolFiche({ id }) {
  const d = useApi(`/api/schools/${id}/fiche`)
  const [ouvert, setOuvert] = useState(null) // 'modifier' | 'admin'
  const [f, setF] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Chargement…</p>
  const e = d.data
  const v = f || { name: e.name, type: e.type, city: e.city || '' }

  async function enregistrer(ev) {
    ev.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api.put(`/api/schools/${id}`, v)
      setOuvert(null)
      setF(null)
      d.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }
  async function basculer() {
    if (e.is_active && !window.confirm(`Suspendre ${e.name} ? Il n’apparaîtra plus à l’inscription, mais ses données sont conservées.`)) return
    await api.put(`/api/schools/${id}`, { isActive: !e.is_active })
    d.reload()
  }

  return (
    <>
      <section
        className="hero-card"
        style={{
          marginTop: 4,
          minHeight: 150,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          backgroundImage: e.photo ? `linear-gradient(180deg, rgba(15,26,60,0.05) 25%, rgba(15,26,60,0.88)), url(${e.photo})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <span className="badge" style={{ alignSelf: 'flex-start' }}>
          {e.is_active ? 'Actif' : 'Suspendu'} · {TYPES[e.type] || ''}
        </span>
        <h2 style={{ marginTop: 8 }}>{e.name}</h2>
        <p>
          {e.city || 'Ville non précisée'} · inscrit le {date(e.created_at)}
        </p>
      </section>

      <h2 className="section-title">Activité · {e.annee}</h2>
      <div className="kpis">
        <div className="kpi">
          <b>{nombre(e.eleves)}</b>
          <span>Élèves</span>
          <small>{nombre(e.eleves_avec_compte)} avec un compte</small>
        </div>
        <div className="kpi">
          <b>{nombre(e.enseignants)}</b>
          <span>Enseignants</span>
          <small>{e.enseignants_attente ? `${e.enseignants_attente} en attente` : 'validés'}</small>
        </div>
        <div className="kpi">
          <b>{nombre(e.parents)}</b>
          <span>Parents</span>
          <small>{nombre(e.inscrits_7j)} inscription(s) en 7 j</small>
        </div>
        <div className="kpi">
          <b>{nombre(e.classes)}</b>
          <span>Classes</span>
          <small>année en cours</small>
        </div>
        <div className="kpi">
          <b>{nombre(e.evaluations)}</b>
          <span>Évaluations</span>
          <small>{nombre(e.publications)} actualité(s)</small>
        </div>
        <div className="kpi">
          <b>{nombre(e.paiements)}</b>
          <span>FCFA encaissés</span>
          <small>dernière activité {depuis(e.derniere_activite)}</small>
        </div>
      </div>

      <p className="groupe-titre">Administrateurs</p>
      <div className="liste-reglages">
        {e.administrateurs.length === 0 && (
          <div className="reglage" style={{ cursor: 'default' }}>
            <span className="muted">Aucun administrateur désigné</span>
          </div>
        )}
        {e.administrateurs.map((a) => (
          <div className="reglage" key={a.id} style={{ cursor: 'default' }}>
            <span className="avatar" style={{ width: 38, height: 38, borderRadius: 12, fontSize: 15 }}>
              {(a.first_name || '?')[0]}
              {(a.last_name || '')[0]}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block' }}>
                {a.first_name} {a.last_name}
              </span>
              <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>
                {a.email} · {depuis(a.last_login)}
              </span>
            </span>
            {a.phone && (
              <a className="val" href={`tel:${a.phone}`}>
                📞
              </a>
            )}
          </div>
        ))}
        <button type="button" className="reglage" onClick={() => setOuvert(ouvert === 'admin' ? null : 'admin')}>
          <span style={{ color: 'var(--primary)' }}>+ Désigner un administrateur</span>
        </button>
      </div>
      {ouvert === 'admin' && (
        <div className="card" style={{ marginTop: 10 }}>
          <Administrateur
            ecole={e}
            onDone={() => {
              setOuvert(null)
              d.reload()
            }}
          />
        </div>
      )}

      <p className="groupe-titre">Gestion</p>
      <div className="liste-reglages">
        <button type="button" className="reglage" onClick={() => setOuvert(ouvert === 'modifier' ? null : 'modifier')}>
          <span>Modifier les informations</span>
          <span className="val">Nom, type, ville</span>
        </button>
        <button type="button" className={`reglage ${e.is_active ? 'danger' : ''}`} onClick={basculer}>
          <span>{e.is_active ? 'Suspendre l’établissement' : 'Réactiver l’établissement'}</span>
        </button>
      </div>
      {ouvert === 'modifier' && (
        <form className="card" onSubmit={enregistrer} style={{ marginTop: 10 }}>
          <Field label="Nom">
            <input className="input" value={v.name} onChange={(x) => setF({ ...v, name: x.target.value })} required />
          </Field>
          <div className="grid2">
            <Field label="Type">
              <select className="input" value={v.type} onChange={(x) => setF({ ...v, type: x.target.value })}>
                {Object.entries(TYPES).map(([k, t]) => (
                  <option key={k} value={k}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ville">
              <input className="input" value={v.city} onChange={(x) => setF({ ...v, city: x.target.value })} />
            </Field>
          </div>
          <Note>{error}</Note>
          <button className="btn btn-block" type="submit" disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      )}
      {!e.is_active && (
        <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
          Un établissement suspendu n’apparaît plus à l’inscription. Ses données et ses comptes sont conservés.
        </p>
      )}
    </>
  )
}
