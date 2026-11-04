import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'
import { LIENS } from './Signup.jsx'

// Une ligne d'eleve : « C'est mon enfant » (verifie) et « Payer sa scolarite » (libre)
function LigneEleve({ e, ouvert, onOuvrir, onRelie }) {
  const [f, setF] = useState({ dateNaissance: '', lien: 'pere' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function relier(ev) {
    ev.preventDefault()
    setError('')
    setBusy(true)
    try {
      const r = await api.post('/api/familles/relier', { studentId: e.id, ...f })
      onRelie(e, r.data.statut)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }
  return (
    <li style={{ padding: '12px 14px', borderTop: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>
            {e.last_name} {e.first_name}
          </b>
          {e.classe && <div className="muted" style={{ fontSize: 13 }}>{e.classe}</div>}
        </div>
        {e.deja_relie ? (
          <span className="tag tag-now">Votre enfant</span>
        ) : (
          <button type="button" className="btn btn-quiet" style={{ padding: '7px 10px', fontSize: 13 }} onClick={onOuvrir}>
            Mon enfant
          </button>
        )}
        <a className="btn" style={{ padding: '7px 10px', fontSize: 13 }} href={`#/payer/${e.id}`}>
          Payer
        </a>
      </div>
      {ouvert && (
        <form onSubmit={relier} style={{ marginTop: 12 }}>
          <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
            Confirmez avec sa date de naissance. Sinon, l’établissement validera votre demande.
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
          <Note>{error}</Note>
          <button className="btn btn-block" type="submit" disabled={busy}>
            {busy ? 'Vérification…' : 'Confirmer'}
          </button>
        </form>
      )}
    </li>
  )
}

// Niveau d'une classe (« 4e Esp 2 » -> « 4e »), pour regrouper les classes
const niveauDe = (nom) => String(nom).split(' ')[0]

export default function TrouverEleve() {
  const [qEcole, setQEcole] = useState('')
  const ecoles = useApi(`/api/familles/ecoles?q=${encodeURIComponent(qEcole)}`)
  const [ecole, setEcole] = useState(null)
  const classes = useApi(ecole ? `/api/familles/ecoles/${ecole.id}/classes` : null)
  const [classe, setClasse] = useState(null)
  const liste = useApi(classe ? `/api/familles/classes/${classe.id}/eleves` : null)
  const [filtre, setFiltre] = useState('')
  const [q, setQ] = useState('')
  const [debounce, setDebounce] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounce(q), 350)
    return () => clearTimeout(t)
  }, [q])
  const recherche = useApi(ecole && debounce.replace(/\s/g, '').length >= 3 ? `/api/familles/ecoles/${ecole.id}/eleves?q=${encodeURIComponent(debounce)}` : null)
  const [ouvert, setOuvert] = useState(null)
  const [ok, setOk] = useState('')

  const relie = (e, statut) => {
    setOuvert(null)
    if (statut === 'relie') {
      setOk(`✓ ${e.first_name} ${e.last_name} est maintenant relié(e) à votre compte.`)
      setTimeout(() => (window.location.hash = '/'), 1200)
    } else setOk('Demande envoyée à l’établissement : vous serez prévenu dès sa validation.')
  }

  // 1. Choix de l'etablissement
  if (!ecole) {
    return (
      <>
        <h1 className="page-title">Trouver un élève</h1>
        <p className="lede">Choisissez l’établissement.</p>
        <input className="input" placeholder="Nom de l’établissement ou ville" value={qEcole} onChange={(e) => setQEcole(e.target.value)} style={{ marginBottom: 12 }} />
        {!ecoles.data && <p className="muted">Chargement…</p>}
        {ecoles.data?.length === 0 && <p className="muted">Aucun établissement trouvé.</p>}
        <div className="card" style={{ padding: 0 }}>
          {ecoles.data?.map((e) => (
            <button key={e.id} type="button" className="classe-ligne" onClick={() => setEcole(e)}>
              <span>
                {e.name}
                <span className="muted" style={{ display: 'block', fontSize: 13, fontWeight: 400 }}>
                  {e.city}
                </span>
              </span>
              <span className="muted">›</span>
            </button>
          ))}
        </div>
      </>
    )
  }

  // 3. Liste d'une classe
  if (classe) {
    const f = filtre.trim().toLowerCase()
    const eleves = (liste.data || []).filter((e) => !f || `${e.last_name} ${e.first_name}`.toLowerCase().includes(f))
    return (
      <>
        <button type="button" className="back" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0 }} onClick={() => (setClasse(null), setFiltre(''))}>
          ← {ecole.name}
        </button>
        <h1 className="page-title">{classe.name}</h1>
        <p className="lede">{classe.effectif} élèves · touchez « Mon enfant » ou « Payer ».</p>
        <input className="input" placeholder="Filtrer la liste (nom ou prénom)" value={filtre} onChange={(e) => setFiltre(e.target.value)} style={{ marginBottom: 12 }} />
        <Note kind="ok">{ok}</Note>
        <Note>{liste.error}</Note>
        {!liste.data && !liste.error && <p className="muted">Chargement…</p>}
        {liste.data && (
          <ul className="card" style={{ padding: 0 }}>
            {eleves.map((e) => (
              <LigneEleve key={e.id} e={{ ...e, classe: null }} ouvert={ouvert === e.id} onOuvrir={() => setOuvert(ouvert === e.id ? null : e.id)} onRelie={relie} />
            ))}
            {eleves.length === 0 && <li className="muted" style={{ padding: 14 }}>Aucun élève ne correspond.</li>}
          </ul>
        )}
      </>
    )
  }

  // 2. Recherche dans l'etablissement, ou choix d'une classe
  const groupes = {}
  for (const c of classes.data || []) (groupes[niveauDe(c.name)] ||= []).push(c)
  return (
    <>
      <button type="button" className="back" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0 }} onClick={() => setEcole(null)}>
        ← Établissements
      </button>
      <h1 className="page-title">{ecole.name}</h1>
      <input className="input" placeholder="Rechercher un élève (3 lettres minimum)" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />
      <Note kind="ok">{ok}</Note>
      {debounce.replace(/\s/g, '').length >= 3 ? (
        <>
          {recherche.data?.length === 0 && <p className="muted">Aucun élève trouvé. Vérifiez l’orthographe.</p>}
          <ul className="card" style={{ padding: 0 }}>
            {recherche.data?.map((e) => (
              <LigneEleve key={e.id} e={e} ouvert={ouvert === e.id} onOuvrir={() => setOuvert(ouvert === e.id ? null : e.id)} onRelie={relie} />
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="muted" style={{ fontSize: 14 }}>Ou choisissez la classe :</p>
          {!classes.data && <p className="muted">Chargement…</p>}
          {Object.entries(groupes).map(([niv, cl]) => (
            <div key={niv}>
              <p className="niveau-titre">{niv}</p>
              <div className="card" style={{ padding: 0 }}>
                {cl.map((c) => (
                  <button key={c.id} type="button" className="classe-ligne" onClick={() => setClasse(c)}>
                    <span>{c.name}</span>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {c.effectif} élèves ›
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </>
  )
}
