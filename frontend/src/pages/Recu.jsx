import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'
import { MOYENS, fcfa, jourLong } from './Abonnement.jsx'

// Recu de paiement de l'abonnement (a imprimer ou enregistrer en PDF)
export default function Recu({ id }) {
  const d = useApi(`/api/abonnement/recus/${id}`)
  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Chargement…</p>
  const r = d.data
  return (
    <>
      <div className="sans-impression" style={{ marginBottom: 12 }}>
        <button type="button" className="btn btn-block" onClick={() => window.print()}>
          🖨️ Imprimer ou enregistrer en PDF
        </button>
      </div>
      <article className="bulletin" style={{ fontSize: 14 }}>
        <header className="bulletin-tete">
          <div>
            <div className="bulletin-ecole" style={{ fontSize: 22 }}>
              School<span style={{ color: '#ffb020' }}>.</span>
            </div>
            <div className="bulletin-petit">{r.beneficiaire || 'Embroswil'} · la vie scolaire, simplement</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="bulletin-titre">Reçu de paiement</div>
            <div className="bulletin-petit">N° {r.numero_recu}</div>
          </div>
        </header>
        <table className="bulletin-table" style={{ marginTop: 16, minWidth: 0 }}>
          <tbody>
            {[
              ['Établissement', `${r.ecole}${r.city ? ` · ${r.city}` : ''}`],
              ['Objet', `Abonnement School · année scolaire ${r.annee}`],
              ['Montant reçu', fcfa(r.montant)],
              ['Moyen de paiement', MOYENS[r.moyen] || r.moyen],
              ['Référence', r.reference || '—'],
              ['Date de paiement', jourLong(r.created_at)],
              ['Date de confirmation', jourLong(r.confirme_le)],
            ].map(([k, v]) => (
              <tr key={k}>
                <td style={{ textAlign: 'left', width: '40%', background: '#f6f7fb' }}>
                  <b>{k}</b>
                </td>
                <td style={{ textAlign: 'left' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="bulletin-petit" style={{ marginTop: 14 }}>
          Montant annuel de l’abonnement : {fcfa(r.montant_annuel)}. Ce reçu est établi électroniquement par School.
        </p>
      </article>
    </>
  )
}
