import { useState } from 'react'
import { api } from '../api.js'
import { envoyerOuGarder } from '../horsligne.js'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'
import { IcPlus, IcPoubelle } from '../icones.jsx'

const jour = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : 'sans date')

// Liste des devoirs (partagee avec le suivi des parents et eleves)
export function ListeDevoirs({ devoirs, onSupprimer }) {
  if (!devoirs.length) return <p className="muted">Aucun devoir à faire pour le moment.</p>
  return (
    <ul className="rows">
      {devoirs.map((d) => (
        <li className="row" key={d.id} style={{ alignItems: 'flex-start' }}>
          <div className="row-main">
            <div className="row-sub" style={{ fontWeight: 700, color: 'var(--primary)', textTransform: 'capitalize' }}>
              Pour {jour(d.pour_le)}
            </div>
            <div className="row-title" style={{ whiteSpace: 'normal' }}>
              {d.matiere} · {d.titre}
            </div>
            {d.consigne && (
              <div className="row-sub" style={{ whiteSpace: 'pre-wrap' }}>
                {d.consigne}
              </div>
            )}
            {d.last_name && (
              <div className="row-sub" style={{ fontSize: 12 }}>
                {d.first_name} {d.last_name}
              </div>
            )}
          </div>
          {onSupprimer && d.mien && (
            <button type="button" className="btn btn-quiet btn-danger" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => onSupprimer(d.id)}>
              Retirer
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

// Cahier de textes d'une classe : l'enseignant donne un devoir, tout le monde le voit
export default function Devoirs({ id }) {
  const infos = useApi(`/api/notes/classes/${id}`)
  const liste = useApi(`/api/notes/classes/${id}/devoirs`)
  const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const [f, setF] = useState({ subjectId: '', titre: '', consigne: '', pourLe: demain })
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const [ouvert, setOuvert] = useState(false)
  const maj = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const droits = infos.data?.droits
  const mesMatieres = (infos.data?.matieres || []).filter((m) => droits?.mesMatieres.includes(m.id))

  async function ajouter(e) {
    e.preventDefault()
    setError('')
    setOk('')
    setBusy(true)
    try {
      const r = await envoyerOuGarder({
        cle: `devoir-${id}-${Date.now()}`,
        path: `/api/notes/classes/${id}/devoirs`,
        body: { ...f, subjectId: Number(f.subjectId || mesMatieres[0]?.id) },
        libelle: `Devoir « ${f.titre} »`,
      })
      setOk(r.attente ? 'Pas de réseau : devoir gardé sur le téléphone, publié dès le retour du réseau.' : 'Devoir publié : les élèves et les parents sont notifiés.')
      setF((x) => ({ ...x, titre: '', consigne: '' }))
      setOuvert(false)
      liste.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  const peutDonner = droits?.saisie
  const devoirs = liste.data || []
  // devoirs regroupes par date a rendre
  const groupes = []
  for (const x of devoirs) {
    const k = String(x.pour_le || '').slice(0, 10)
    const g = groupes[groupes.length - 1]
    if (g && g.k === k) g.liste.push(x)
    else groupes.push({ k, liste: [x] })
  }
  const auj = new Date().toISOString().slice(0, 10)

  return (
    <div className="dv-page">
      <div className="page-tete">
        <div>
          <h1 className="page-title">{`Devoirs${infos.data ? ` · ${infos.data.classe.name}` : ''}`}</h1>
          <p className="muted">Visibles par les élèves et leurs parents.</p>
        </div>
        {peutDonner && !ouvert && (
          <button type="button" className="btn cn-nouvelle" onClick={() => (setOuvert(true), setOk(''))}>
            <IcPlus size={16} />
            <span>Nouveau</span>
          </button>
        )}
      </div>
      {!ouvert && <Note kind="ok">{ok}</Note>}
      {peutDonner && ouvert && (
        <form className="dv-form" onSubmit={ajouter}>
          <div className="cn-form-tete">
            <b>Nouveau devoir</b>
            <button type="button" className="lien-action" onClick={() => setOuvert(false)}>
              Annuler
            </button>
          </div>
          {mesMatieres.length > 1 && (
            <Field label="Matière">
              <select className="input" value={f.subjectId} onChange={maj('subjectId')} required>
                <option value="">Choisir</option>
                {mesMatieres.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Devoir">
            <input className="input" placeholder="ex. Exercices 3 et 4 page 52" value={f.titre} onChange={maj('titre')} required />
          </Field>
          <Field label="Consigne (facultatif)">
            <textarea className="input" rows={3} value={f.consigne} onChange={maj('consigne')} />
          </Field>
          <Field label="Pour le">
            <input className="input" type="date" value={f.pourLe} min={auj} onChange={maj('pourLe')} />
          </Field>
          <Note>{error}</Note>
          <button className="btn btn-block" type="submit" disabled={busy}>
            {busy ? 'Publication…' : 'Donner le devoir'}
          </button>
        </form>
      )}
      {!liste.data && <p className="muted">Chargement…</p>}
      {liste.data && !devoirs.length && <p className="cn-vide">Aucun devoir à faire pour le moment.</p>}
      {groupes.map((g) => (
        <section key={g.k} className="dv-groupe">
          <h2 className="dv-date">{g.k ? `Pour ${jour(g.k)}` : 'Sans date'}</h2>
          <ul className="dv-liste">
            {g.liste.map((x) => (
              <li key={x.id}>
                <div className="dv-texte">
                  <b data-brut>{x.titre}</b>
                  {x.consigne && <p data-brut>{x.consigne}</p>}
                  <small data-brut>{[x.matiere, x.last_name ? `${x.first_name} ${x.last_name}` : ''].filter(Boolean).join(' · ')}</small>
                </div>
                {x.mien && (
                  <button
                    type="button"
                    className="dv-retirer"
                    aria-label="Retirer ce devoir"
                    onClick={async () => {
                      if (!window.confirm('Retirer ce devoir ? Il ne sera plus visible par les élèves et les parents.')) return
                      await api.delete(`/api/notes/devoirs/${x.id}`)
                      liste.reload()
                    }}
                  >
                    <IcPoubelle size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
