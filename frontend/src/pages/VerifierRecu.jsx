import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { fcfa, MODES_PAIEMENT } from '../recus.js'

const date = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—')

// Page publique (avec ou sans compte) ouverte par le QR code d'un recu de scolarite.
export default function VerifierRecu({ numero: numeroLien = '', code: codeLien = '' }) {
  const [numero, setNumero] = useState(numeroLien)
  const [code, setCode] = useState(codeLien)
  const [etat, setEtat] = useState(null)
  const [busy, setBusy] = useState(false)

  async function verifier(n, c) {
    if (!n || !c) return
    setBusy(true)
    try {
      const r = await api.get(`/api/verifier/recus/${encodeURIComponent(n.trim())}?c=${encodeURIComponent(c.trim())}`)
      setEtat({ ok: true, recu: r.data })
    } catch (err) {
      setEtat({ ok: false, message: err.message })
    }
    setBusy(false)
  }
  useEffect(() => {
    if (numeroLien && codeLien) verifier(numeroLien, codeLien)
  }, [numeroLien, codeLien])

  const r = etat?.recu
  return (
    <div className="verif">
      <h1 className="page-title">Vérifier un reçu</h1>
      <p className="muted">Un reçu de scolarité émis par Sùkûl porte un numéro et un code de vérification.</p>

      {busy && <p className="muted">Vérification…</p>}
      {etat?.ok && (
        <div className="verif-resultat ok">
          <span className="verif-sceau" aria-hidden="true">
            ✓
          </span>
          <b>Reçu authentique</b>
          <small>Ce paiement est bien enregistré par l’établissement.</small>
          <dl className="recu-lignes">
            {[
              ['N° de reçu', r.numero],
              ['Établissement', [r.ecole, r.ville].filter(Boolean).join(' · ')],
              ['Élève', r.eleve],
              ['Objet', r.frais],
              ['Montant', fcfa(r.montant)],
              ['Moyen de paiement', MODES_PAIEMENT[r.mode] || r.mode],
              ['Date', date(r.date)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd data-brut={['N° de reçu', 'Élève', 'Établissement'].includes(k) ? '' : undefined}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {etat && !etat.ok && (
        <div className="verif-resultat ko">
          <span className="verif-sceau" aria-hidden="true">
            !
          </span>
          <b>Reçu non reconnu</b>
          <small>{etat.message}</small>
        </div>
      )}

      {etat?.ok && (
        <button type="button" className="lien-discret" onClick={() => setEtat(null)}>
          Vérifier un autre reçu
        </button>
      )}
      {!etat?.ok && (
      <form
        className="card verif-form"
        onSubmit={(e) => {
          e.preventDefault()
          verifier(numero, code)
        }}
      >
        <label className="field">
          <span className="field-label">Numéro du reçu</span>
          <input className="input" value={numero} onChange={(e) => setNumero(e.target.value.toUpperCase())} placeholder="Ex. REC-2026-000123" />
        </label>
        <label className="field">
          <span className="field-label">Code de vérification</span>
          <input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="8 caractères" maxLength={8} />
        </label>
        <button type="submit" className="btn btn-block" disabled={busy || !numero || !code}>
          Vérifier
        </button>
      </form>
      )}
    </div>
  )
}
