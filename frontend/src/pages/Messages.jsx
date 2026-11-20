import { useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'

const ROLES = { parent: 'Parent', student: 'Élève', teacher: 'Enseignant' }
const quand = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

export default function Messages() {
  const { user } = useAuth()
  const etablissement = user.role === 'principal'
  const enseignant = user.role === 'teacher'
  const liste = useApi('/api/boite/messages')
  const [ouvert, setOuvert] = useState(false)
  const [f, setF] = useState({ subject: '', body: '', a: 'etablissement', classeId: '', eleveId: '' })
  const [envoye, setEnvoye] = useState('')
  // enseignant : ses classes, puis les eleves de la classe choisie
  const classes = useApi(enseignant && f.a === 'parents' ? '/api/notes/mes-classes' : null)
  const eleves = useApi(enseignant && f.a === 'parents' && f.classeId ? `/api/boite/destinataires?classe=${f.classeId}` : null)
  const nbParents = (eleves.data || []).filter((x) => !f.eleveId || String(x.id) === f.eleveId).reduce((n, x) => n + x.parents, 0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function envoyer(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const r = await api.post('/api/boite/messages', f)
      if (r.data.id) window.location.hash = `/messages/${r.data.id}`
      else {
        setEnvoye(`Message envoyé à ${r.data.envoyes} parent${r.data.envoyes > 1 ? 's' : ''}.`)
        setOuvert(false)
        setF({ subject: '', body: '', a: 'etablissement', classeId: '', eleveId: '' })
        liste.reload()
      }
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <>
      <h1 className="page-title">Messages</h1>
      <p className="lede">
        {etablissement
          ? 'Les messages des parents, des élèves et des enseignants de votre établissement.'
          : enseignant
            ? 'Écrivez à l’établissement ou aux parents de vos élèves.'
            : `Écrivez à ${user.schoolName || 'votre établissement'} : une question, une absence, un document…`}
      </p>
      {envoye && <Note kind="ok">{envoye}</Note>}

      {!etablissement && (
        <>
          {!ouvert ? (
            <button type="button" className="btn btn-block" onClick={() => setOuvert(true)} style={{ marginBottom: 16 }}>
              Nouveau message
            </button>
          ) : (
            <form className="card" onSubmit={envoyer} style={{ marginBottom: 16 }}>
              {enseignant && (
                <>
                  <div className="field">
                    <span className="field-label">Destinataire</span>
                    <div className="segments" role="tablist" style={{ marginBottom: 0 }}>
                      {[
                        ['etablissement', 'L’établissement'],
                        ['parents', 'Des parents'],
                      ].map(([k, t]) => (
                        <button key={k} type="button" role="tab" aria-selected={f.a === k} onClick={() => setF({ ...f, a: k })}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  {f.a === 'parents' && (
                    <>
                      <Field label="Classe">
                        <select className="input" value={f.classeId} onChange={(e) => setF({ ...f, classeId: e.target.value, eleveId: '' })} required>
                          <option value="">Choisir la classe</option>
                          {(classes.data || []).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {f.classeId && (
                        <Field label="Parents de">
                          <select className="input" value={f.eleveId} onChange={(e) => setF({ ...f, eleveId: e.target.value })}>
                            <option value="">Toute la classe</option>
                            {(eleves.data || []).map((x) => (
                              <option key={x.id} value={x.id} disabled={!x.parents}>
                                {`${x.last_name} ${x.first_name}${x.parents ? '' : ' (aucun parent inscrit)'}`}
                              </option>
                            ))}
                          </select>
                        </Field>
                      )}
                      {f.classeId && eleves.data && (
                        <p className="muted" style={{ margin: '-4px 0 12px', fontSize: 13 }}>
                          {nbParents ? `${nbParents} parent${nbParents > 1 ? 's' : ''} recevr${nbParents > 1 ? 'ont' : 'a'} ce message, chacun en privé.` : 'Aucun parent inscrit pour l’instant.'}
                        </p>
                      )}
                    </>
                  )}
                </>
              )}
              <Field label="Objet">
                <input className="input" placeholder={enseignant ? (f.a === 'parents' ? 'ex. Devoir de mathématiques' : 'ex. Changement de salle') : 'ex. Absence de mon enfant'} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} required />
              </Field>
              <Field label="Message">
                <textarea className="input" style={{ minHeight: 130 }} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required />
              </Field>
              <Note>{error}</Note>
              <div className="actions">
                <button className="btn" type="submit" disabled={busy}>
                  {busy ? 'Envoi…' : 'Envoyer'}
                </button>
                <button className="btn btn-quiet" type="button" onClick={() => setOuvert(false)}>
                  Annuler
                </button>
              </div>
            </form>
          )}
        </>
      )}

      {liste.loading && <p className="muted">Chargement…</p>}
      {liste.data?.length === 0 && <p className="muted">Aucun message pour le moment.</p>}
      {liste.data?.length > 0 && (
        <ul className="rows">
          {liste.data.map((c) => (
            <a className="row" href={`#/messages/${c.id}`} key={c.id}>
              <span style={{ fontSize: 24 }}>{c.non_lu ? '📩' : '✉️'}</span>
              <div className="row-main">
                <div className="row-title" style={{ fontWeight: c.non_lu ? 800 : 600 }}>
                  {etablissement ? `${c.first_name} ${c.last_name} · ` : ''}
                  {c.subject}
                </div>
                <div className="row-sub">
                  {etablissement && ROLES[c.role] ? `${ROLES[c.role]} · ` : ''}
                  {!etablissement && c.genre && (
                    <span data-brut>{c.genre === 'parent' ? `Parent de ${c.eleve || '—'} · ` : c.genre === 'enseignant' ? `${c.avec} (enseignant) · ` : ''}</span>
                  )}
                  {c.dernier}
                </div>
              </div>
              <span className="row-end">{quand(c.updated_at)}</span>
            </a>
          ))}
        </ul>
      )}
    </>
  )
}
