import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'

const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`
const jour = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '')

// Payer la scolarite d'un eleve (parent ou donateur) : choix du frais, puis ordre P2P
export default function PayerEleve({ id }) {
  const d = useApi(`/api/familles/eleves/${id}/frais`)
  const [frais, setFrais] = useState(null)
  const [montant, setMontant] = useState('')
  const [moyen, setMoyen] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState('')
  // Retour du paiement en ligne : verification
  useEffect(() => {
    let ref = null
    try {
      ref = localStorage.getItem('school-paiement')
    } catch (_) {}
    if (!ref) return
    api
      .get(`/api/scolarite/verifier/${encodeURIComponent(ref)}`)
      .then((r) => {
        if (r.data.statut === 'reussi') setInfo('✓ Paiement confirmé. Merci ! Le reçu vous a été envoyé en notification.')
        else if (r.data.statut === 'echoue') setError('Le paiement n’a pas abouti.')
        if (r.data.statut !== 'en_attente') localStorage.removeItem('school-paiement')
        d.reload()
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Chargement…</p>
  const { eleve, moyens } = d.data
  const aPayer = d.data.frais.filter((f) => f.reste > 0)
  const total = aPayer.filter((f) => f.obligatoire).reduce((s, f) => s + f.reste, 0)
  const op = moyen || (moyens.enLigne ? 'enligne' : moyens.orange ? 'orange_money' : 'mtn_momo')

  async function payer(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (op === 'enligne') {
        const r = await api.post('/api/scolarite/payer', { studentId: eleve.id, fraisId: frais.id, montant: Number(String(montant).replace(/\s/g, '')), retour: 'payer' })
        try {
          localStorage.setItem('school-paiement', r.data.reference)
        } catch (_) {}
        window.location.href = r.data.url
        return
      }
      const r = await api.post('/api/scolarite/ordres', { studentId: eleve.id, fraisId: frais.id, montant: Number(String(montant).replace(/\s/g, '')), moyen: op })
      window.location.hash = `/ordres/${r.data.id}`
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <>
      <section className="hero-card" style={{ marginTop: 4 }}>
        <span className="badge">{eleve.classe || 'Classe non précisée'}</span>
        <h2 style={{ marginTop: 8 }}>
          {eleve.prenom} {eleve.nom}
        </h2>
        <p>{eleve.ecole}</p>
      </section>
      <h2 className="section-title">Frais à payer</h2>
      {total > 0 && (
        <p className="muted" style={{ marginBottom: 8 }}>
          Total obligatoire restant : <b style={{ color: 'var(--danger)' }}>{fcfa(total)}</b>
        </p>
      )}
      {aPayer.length === 0 && <p className="muted">Tous les frais de cet élève sont réglés. 👏</p>}
      <Note kind="ok">{info}</Note>
      {!moyens.enLigne && !moyens.orange && !moyens.mtn && aPayer.length > 0 && <Note>Le paiement n’est pas encore disponible pour cet établissement.</Note>}
      <ul className="rows">
        {aPayer.map((f) => (
          <li className="row" key={f.id}>
            <div className="row-main">
              <div className="row-title">{f.nom}</div>
              <div className="row-sub">
                reste {fcfa(f.reste)}
                {f.echeance ? ` · avant le ${jour(f.echeance)}` : ''}
                {f.obligatoire ? '' : ' · facultatif'}
              </div>
            </div>
            {(moyens.enLigne || moyens.orange || moyens.mtn) && (
              <button
                type="button"
                className="btn"
                style={{ padding: '8px 14px', fontSize: 14 }}
                onClick={() => {
                  setFrais(f)
                  setMontant(String(f.reste))
                }}
              >
                Payer
              </button>
            )}
          </li>
        ))}
      </ul>
      {frais && (
        <form className="card" onSubmit={payer} style={{ position: 'sticky', bottom: 90, border: '2px solid var(--primary)', marginTop: 12 }}>
          <b>{frais.nom}</b>
          <div className="chips" style={{ marginTop: 8 }}>
            {moyens.enLigne && (
              <button type="button" className="chip" aria-pressed={op === 'enligne'} onClick={() => setMoyen('enligne')}>
                💳 En ligne · Orange, MTN, carte
              </button>
            )}
            {moyens.orange && (
              <button type="button" className="chip" aria-pressed={op === 'orange_money'} onClick={() => setMoyen('orange_money')}>
                🟠 Orange Money
              </button>
            )}
            {moyens.mtn && (
              <button type="button" className="chip" aria-pressed={op === 'mtn_momo'} onClick={() => setMoyen('mtn_momo')}>
                🟡 MTN MoMo
              </button>
            )}
          </div>
          <Field label="Montant (FCFA)">
            <input className="input" inputMode="numeric" value={montant} onChange={(e) => setMontant(e.target.value)} required />
          </Field>
          <Note>{error}</Note>
          <div className="actions">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Un instant…' : op === 'enligne' ? 'Payer maintenant' : 'Continuer'}
            </button>
            <button className="btn btn-quiet" type="button" onClick={() => setFrais(null)}>
              Annuler
            </button>
          </div>
        </form>
      )}
    </>
  )
}
