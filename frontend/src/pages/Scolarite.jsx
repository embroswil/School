import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'

const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`
const jour = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
const MODES = { mobile_money: 'Mobile Money', especes: 'Espèces', banque: 'Banque', autre: 'Autre' }

// ------------------------------------------------------------ parents et eleves
function Situation() {
  const situation = useApi('/api/scolarite/situation')
  const [paiement, setPaiement] = useState(null) // { eleve, frais }
  const [montant, setMontant] = useState('')
  const [tel, setTel] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  // Retour du paiement Mobile Money : verification
  useEffect(() => {
    const ref =
      new URLSearchParams(window.location.hash.split('?')[1] || '').get('reference') ||
      new URLSearchParams(window.location.search).get('reference') ||
      localStorage.getItem('school-paiement')
    if (!ref) return
    api
      .get(`/api/scolarite/verifier/${encodeURIComponent(ref)}`)
      .then((r) => {
        if (r.data.statut === 'reussi') setInfo('✓ Paiement confirmé. Merci !')
        else if (r.data.statut === 'echoue') setError('Le paiement n’a pas abouti.')
        if (r.data.statut !== 'en_attente') localStorage.removeItem('school-paiement')
        situation.reload()
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function payer(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const r = await api.post('/api/scolarite/payer', {
        studentId: paiement.eleve.id,
        fraisId: paiement.frais.id,
        montant: Number(String(montant).replace(/\s/g, '')),
        telephone: tel,
      })
      localStorage.setItem('school-paiement', r.data.reference)
      window.location.href = r.data.url
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <>
      <Note kind="ok">{info}</Note>
      <Note>{error}</Note>
      {situation.loading && <p className="muted">Chargement…</p>}
      {situation.data?.length === 0 && (
        <p className="lede">
          Aucun élève relié à votre compte pour le moment. Un enfant est relié automatiquement dès qu’il apparaît dans l’établissement.
        </p>
      )}
      {situation.data?.map((s) => (
        <section key={s.eleve.id} style={{ marginBottom: 22 }}>
          <div className="hero-card" style={{ padding: 18 }}>
            <span className="badge">{s.eleve.classe || 'Classe non précisée'}</span>
            <h2 style={{ marginTop: 8, fontSize: 21 }}>
              {s.eleve.prenom} {s.eleve.nom}
            </h2>
            <div className="grid2" style={{ marginTop: 12 }}>
              <div>
                <div style={{ opacity: 0.8, fontSize: 13 }}>Payé</div>
                <div style={{ font: '800 20px/1.2 var(--font-display)' }}>{fcfa(s.paye)}</div>
              </div>
              <div>
                <div style={{ opacity: 0.8, fontSize: 13 }}>Reste à payer</div>
                <div style={{ font: '800 20px/1.2 var(--font-display)', color: s.reste ? '#ffd27a' : '#9ff0c4' }}>{fcfa(s.reste)}</div>
              </div>
            </div>
          </div>
          {s.frais.length === 0 && <p className="muted" style={{ marginTop: 10 }}>L’établissement n’a pas encore publié ses frais.</p>}
          {s.frais.length > 0 && (
            <ul className="rows" style={{ marginTop: 12 }}>
              {s.frais.map((f) => (
                <li className="row" key={f.id} style={{ flexWrap: 'wrap' }}>
                  <div className="row-main">
                    <div className="row-title">{f.nom}</div>
                    <div className="row-sub">
                      {fcfa(f.montant)}
                      {f.echeance ? ` · avant le ${jour(f.echeance)}` : ''}
                    </div>
                  </div>
                  {f.reste === 0 ? (
                    <span className="tag tag-now">✓ Payé</span>
                  ) : (
                    <>
                      <span className="tag tag-wait">Reste {fcfa(f.reste)}</span>
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: '9px 14px', fontSize: 14 }}
                        onClick={() => {
                          setPaiement({ eleve: s.eleve, frais: f })
                          setMontant(String(f.reste))
                          setError('')
                        }}
                      >
                        Payer
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {s.paiements.length > 0 && (
            <>
              <h3 style={{ font: '700 16px/1.3 var(--font-display)', margin: '16px 0 8px' }}>Paiements effectués</h3>
              <ul className="rows">
                {s.paiements.map((p) => (
                  <li className="row" key={p.id}>
                    <div className="row-main">
                      <div className="row-title">{fcfa(p.montant)}</div>
                      <div className="row-sub">
                        {p.frais} · {MODES[p.mode]} · {jour(p.created_at)}
                      </div>
                    </div>
                    <span className="tag tag-now">Confirmé</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ))}

      {paiement && (
        <form className="card" onSubmit={payer} style={{ position: 'sticky', bottom: 90, border: '2px solid var(--primary)' }}>
          <b>
            {paiement.frais.nom} · {paiement.eleve.prenom}
          </b>
          <div className="grid2" style={{ marginTop: 10 }}>
            <Field label="Montant (FCFA)">
              <input className="input" inputMode="numeric" value={montant} onChange={(e) => setMontant(e.target.value)} required />
            </Field>
            <Field label="Numéro Mobile Money">
              <input className="input" type="tel" placeholder="6 XX XX XX XX" value={tel} onChange={(e) => setTel(e.target.value)} />
            </Field>
          </div>
          <div className="actions">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Redirection…' : 'Payer par Mobile Money'}
            </button>
            <button className="btn btn-quiet" type="button" onClick={() => setPaiement(null)}>
              Annuler
            </button>
          </div>
        </form>
      )}
    </>
  )
}

// ------------------------------------------------------------ etablissement
function Frais() {
  const frais = useApi('/api/scolarite/frais')
  const [f, setF] = useState({ nom: '', montant: '', echeance: '', classes: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const maj = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  async function ajouter(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api.post('/api/scolarite/frais', {
        nom: f.nom,
        montant: Number(String(f.montant).replace(/\s/g, '')),
        echeance: f.echeance || null,
        classes: f.classes
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
      })
      setF({ nom: '', montant: '', echeance: '', classes: '' })
      frais.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }
  async function supprimer(id) {
    if (!window.confirm('Supprimer ce frais ?')) return
    try {
      await api.delete(`/api/scolarite/frais/${id}`)
      frais.reload()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <>
      <form className="card" onSubmit={ajouter}>
        <Field label="Nom du frais">
          <input className="input" placeholder="ex. Pension – 1re tranche, Inscription, APEE" value={f.nom} onChange={maj('nom')} required />
        </Field>
        <div className="grid2">
          <Field label="Montant (FCFA)">
            <input className="input" inputMode="numeric" placeholder="ex. 50000" value={f.montant} onChange={maj('montant')} required />
          </Field>
          <Field label="Échéance">
            <input className="input" type="date" value={f.echeance} onChange={maj('echeance')} />
          </Field>
        </div>
        <Field label="Classes concernées (laisser vide = toutes)">
          <input className="input" placeholder="ex. 6e A, 6e B" value={f.classes} onChange={maj('classes')} />
        </Field>
        <Note>{error}</Note>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Ajout…' : '+ Ajouter le frais'}
        </button>
      </form>
      <h2 className="section-title">Frais {frais.data && frais.meta === null ? '' : ''}de l’année</h2>
      {frais.data?.length === 0 && <p className="muted">Aucun frais pour le moment.</p>}
      {frais.data?.length > 0 && (
        <ul className="rows">
          {frais.data.map((x) => (
            <li className="row" key={x.id} style={{ flexWrap: 'wrap' }}>
              <div className="row-main">
                <div className="row-title">
                  {x.nom} · {fcfa(x.montant)}
                </div>
                <div className="row-sub">
                  {x.classes?.length ? x.classes.join(', ') : 'Toutes les classes'}
                  {x.echeance ? ` · avant le ${jour(x.echeance)}` : ''} · encaissé {fcfa(x.encaisse)}
                </div>
              </div>
              <button type="button" className="btn btn-quiet btn-danger" style={{ padding: '8px 12px', fontSize: 14 }} onClick={() => supprimer(x.id)}>
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function Paiements() {
  const liste = useApi('/api/scolarite/paiements')
  const eleves = useApi('/api/etablissement/eleves')
  const [eleveId, setEleveId] = useState('')
  const situation = useApi(eleveId ? `/api/scolarite/eleves/${eleveId}` : null)
  const [f, setF] = useState({ fraisId: '', montant: '', mode: 'especes', reference: '' })
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  async function enregistrer(e) {
    e.preventDefault()
    setError('')
    setOk('')
    setBusy(true)
    try {
      await api.post('/api/scolarite/paiements', {
        studentId: Number(eleveId),
        fraisId: Number(f.fraisId),
        montant: Number(String(f.montant).replace(/\s/g, '')),
        mode: f.mode,
        reference: f.reference,
      })
      setOk('Paiement enregistré. Les parents de l’élève sont notifiés.')
      setF({ fraisId: '', montant: '', mode: 'especes', reference: '' })
      situation.reload()
      liste.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  const dus = (situation.data?.frais || []).filter((x) => x.reste > 0)

  return (
    <>
      <form className="card" onSubmit={enregistrer}>
        <b>Enregistrer un paiement reçu au guichet</b>
        <Field label="Élève">
          <select className="input" value={eleveId} onChange={(e) => setEleveId(e.target.value)} required>
            <option value="">Choisir l’élève</option>
            {(eleves.data || []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.last_name} {x.first_name}
                {x.class_name ? ` (${x.class_name})` : ''}
              </option>
            ))}
          </select>
        </Field>
        {situation.data && (
          <p className="muted" style={{ marginBottom: 10 }}>
            Payé {fcfa(situation.data.paye)} · reste {fcfa(situation.data.reste)}
          </p>
        )}
        {eleveId && (
          <>
            <Field label="Frais">
              <select
                className="input"
                value={f.fraisId}
                onChange={(e) => {
                  const fr = dus.find((x) => String(x.id) === e.target.value)
                  setF((y) => ({ ...y, fraisId: e.target.value, montant: fr ? String(fr.reste) : '' }))
                }}
                required
              >
                <option value="">Choisir le frais</option>
                {dus.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nom} (reste {fcfa(x.reste)})
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid2">
              <Field label="Montant (FCFA)">
                <input className="input" inputMode="numeric" value={f.montant} onChange={(e) => setF({ ...f, montant: e.target.value })} required />
              </Field>
              <Field label="Mode">
                <select className="input" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>
                  {Object.entries(MODES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="N° de reçu (facultatif)">
              <input className="input" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />
            </Field>
          </>
        )}
        <Note>{error}</Note>
        <Note kind="ok">{ok}</Note>
        <button className="btn" type="submit" disabled={busy || !eleveId}>
          {busy ? 'Enregistrement…' : 'Enregistrer le paiement'}
        </button>
      </form>

      <h2 className="section-title">Paiements reçus {liste.data ? `· ${fcfa((liste.data || []).reduce((s, p) => s + p.montant, 0))}` : ''}</h2>
      {liste.data?.length === 0 && <p className="muted">Aucun paiement pour le moment.</p>}
      {liste.data?.length > 0 && (
        <ul className="rows">
          {liste.data.map((p) => (
            <li className="row" key={p.id}>
              <span style={{ fontSize: 22 }}>{p.mode === 'mobile_money' ? '📱' : '💵'}</span>
              <div className="row-main">
                <div className="row-title">
                  {fcfa(p.montant)} · {p.first_name} {p.last_name}
                </div>
                <div className="row-sub">
                  {p.frais} · {p.classe || '—'} · {MODES[p.mode]} · {jour(p.created_at)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export default function Scolarite() {
  const { user } = useAuth()
  const etablissement = user.role === 'principal'
  const [onglet, setOnglet] = useState('paiements')
  return (
    <>
      <h1 className="page-title">Scolarité</h1>
      {etablissement ? (
        <>
          <p className="lede">Fixez vos frais, suivez les paiements et enregistrez ceux reçus au guichet.</p>
          <div className="chips">
            <button type="button" className="chip" aria-pressed={onglet === 'paiements'} onClick={() => setOnglet('paiements')}>
              💳 Paiements
            </button>
            <button type="button" className="chip" aria-pressed={onglet === 'frais'} onClick={() => setOnglet('frais')}>
              📋 Frais
            </button>
          </div>
          {onglet === 'frais' ? <Frais /> : <Paiements />}
        </>
      ) : (
        <>
          <p className="lede">Ce qui est payé, ce qui reste, et le paiement par Mobile Money.</p>
          <Situation />
        </>
      )}
    </>
  )
}
