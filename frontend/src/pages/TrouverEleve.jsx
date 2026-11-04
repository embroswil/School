import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'
import { LIENS } from './Signup.jsx'

// Trouver un eleve : « C'est mon enfant » (rattachement verifie) ou « Payer sa scolarite » (tout le monde)
export default function TrouverEleve() {
  const [qEcole, setQEcole] = useState('')
  const ecoles = useApi(`/api/familles/ecoles?q=${encodeURIComponent(qEcole)}`)
  const [ecole, setEcole] = useState(null)
  const [q, setQ] = useState('')
  const [debounce, setDebounce] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounce(q), 350)
    return () => clearTimeout(t)
  }, [q])
  const eleves = useApi(ecole && debounce.replace(/\s/g, '').length >= 3 ? `/api/familles/ecoles/${ecole.id}/eleves?q=${encodeURIComponent(debounce)}` : null)
  const [choisi, setChoisi] = useState(null) // eleve pour « c'est mon enfant »
  const [f, setF] = useState({ dateNaissance: '', lien: 'pere' })
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  async function relier(e) {
    e.preventDefault()
    setError('')
    setOk('')
    setBusy(true)
    try {
      const r = await api.post('/api/familles/relier', { studentId: choisi.id, ...f })
      if (r.data.statut === 'relie') {
        setOk(`✓ ${choisi.first_name} ${choisi.last_name} est maintenant relié(e) à votre compte.`)
        setTimeout(() => (window.location.hash = '/'), 1200)
      } else {
        setOk('Demande envoyée à l’établissement : vous serez prévenu dès sa validation.')
      }
      setChoisi(null)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  if (!ecole) {
    return (
      <>
        <h1 className="page-title">Trouver un élève</h1>
        <p className="lede">Choisissez d’abord l’établissement.</p>
        <input className="input" placeholder="Nom de l’établissement ou ville" value={qEcole} onChange={(e) => setQEcole(e.target.value)} style={{ marginBottom: 12 }} />
        {!ecoles.data && <p className="muted">Chargement…</p>}
        {ecoles.data?.length === 0 && <p className="muted">Aucun établissement trouvé.</p>}
        <ul className="rows">
          {ecoles.data?.map((e) => (
            <li className="row" key={e.id}>
              <button type="button" className="row-main" onClick={() => setEcole(e)} style={{ border: 0, background: 'none', textAlign: 'left', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer' }}>
                <div className="row-title">{e.name}</div>
                <div className="row-sub">{e.city}</div>
              </button>
              <span className="row-end">›</span>
            </li>
          ))}
        </ul>
      </>
    )
  }

  return (
    <>
      <button type="button" className="back" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0 }} onClick={() => setEcole(null)}>
        ← {ecole.name}
      </button>
      <h1 className="page-title">Trouver un élève</h1>
      <p className="lede">Tapez au moins 3 lettres du nom ou du prénom de l’élève.</p>
      <input className="input" autoFocus placeholder="ex. ABBO Gladys" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />
      <Note kind="ok">{ok}</Note>
      <Note>{error}</Note>
      {eleves.data?.length === 0 && debounce.length >= 3 && <p className="muted">Aucun élève trouvé. Vérifiez l’orthographe.</p>}
      {eleves.data?.map((e) => (
        <div className="card" key={e.id}>
          <b>
            {e.last_name} {e.first_name}
          </b>
          <div className="muted" style={{ fontSize: 14 }}>{e.classe || 'Classe non précisée'}</div>
          <div className="actions" style={{ marginTop: 10 }}>
            {e.deja_relie ? (
              <span className="tag tag-now">Votre enfant</span>
            ) : (
              <button type="button" className="btn btn-quiet" style={{ padding: '9px 14px', fontSize: 14 }} onClick={() => setChoisi(choisi?.id === e.id ? null : e)}>
                C’est mon enfant
              </button>
            )}
            <a className="btn" style={{ padding: '9px 14px', fontSize: 14 }} href={`#/payer/${e.id}`}>
              Payer sa scolarité
            </a>
          </div>
          {choisi?.id === e.id && (
            <form onSubmit={relier} style={{ marginTop: 12 }}>
              <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                Pour protéger les élèves, confirmez avec sa date de naissance. Sinon, l’établissement validera votre demande.
              </p>
              <div className="grid2">
                <Field label="Sa date de naissance">
                  <input className="input" type="date" value={f.dateNaissance} onChange={(x) => setF({ ...f, dateNaissance: x.target.value })} />
                </Field>
                <Field label="Vous êtes son ou sa">
                  <select className="input" value={f.lien} onChange={(x) => setF({ ...f, lien: x.target.value })}>
                    {LIENS.map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <button className="btn btn-block" type="submit" disabled={busy}>
                {busy ? 'Vérification…' : 'Confirmer'}
              </button>
            </form>
          )}
        </div>
      ))}
    </>
  )
}
