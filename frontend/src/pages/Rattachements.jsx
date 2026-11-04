import { api } from '../api.js'
import { useApi } from '../hooks.js'

const date = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'non indiquée')

// Demandes de rattachement des parents (etablissement)
export default function Rattachements() {
  const d = useApi('/api/familles/demandes')
  if (!d.data) return <p className="muted">Chargement…</p>
  return (
    <>
      <h1 className="page-title">Demandes des parents</h1>
      <p className="lede">Ces personnes demandent à suivre un élève (notes, absences, scolarité). Vérifiez avant d’accepter, par exemple en appelant le numéro indiqué.</p>
      {d.data.length === 0 && <p className="muted">Aucune demande en attente. 👍</p>}
      {d.data.map((r) => (
        <div className="card" key={r.id}>
          <b>
            {r.parent_prenom} {r.parent_nom} · {r.lien}
          </b>
          <div className="muted" style={{ fontSize: 14 }}>
            {r.parent_tel ? <a href={`tel:${r.parent_tel}`}>{r.parent_tel}</a> : 'sans téléphone'} · {r.parent_email}
          </div>
          <p style={{ marginTop: 8 }}>
            Élève : <b>{r.last_name} {r.first_name}</b> {r.classe ? `(${r.classe})` : ''}
          </p>
          <p className="muted" style={{ fontSize: 13 }}>
            Date de naissance indiquée : {date(r.child_birth_date)} · dans le dossier : {date(r.date_of_birth)}
          </p>
          <div className="actions" style={{ marginTop: 10 }}>
            <button type="button" className="btn" onClick={async () => (await api.post(`/api/familles/demandes/${r.id}`, { accepter: true }), d.reload())}>
              ✓ Accepter
            </button>
            <button type="button" className="btn btn-quiet btn-danger" onClick={async () => (await api.post(`/api/familles/demandes/${r.id}`, { accepter: false }), d.reload())}>
              Refuser
            </button>
          </div>
        </div>
      ))}
    </>
  )
}
