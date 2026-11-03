import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'

const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`
const date = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—')
const MODES = { mobile_money: 'Mobile Money', especes: 'Espèces', banque: 'Banque', autre: 'Autre' }

// Recu d'un paiement de scolarite (a imprimer ou enregistrer en PDF)
export default function RecuScolarite({ id }) {
  const d = useApi(`/api/scolarite/recus/${id}`)
  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Chargement…</p>
  const r = d.data
  const lignes = [
    ['Élève', `${r.last_name} ${r.first_name}`],
    ['Classe', r.classe || '—'],
    ['Matricule', r.matricule || '—'],
    ['Frais', r.frais],
    ['Montant payé', fcfa(r.montant)],
    ...(r.frais_service ? [['Frais de transaction', fcfa(r.frais_service)]] : []),
    ['Reste à payer sur ce frais', fcfa(r.resteApres)],
    ['Moyen de paiement', MODES[r.mode] || r.mode],
    ['Référence', r.reference || '—'],
    ['Payé par', r.payeur_nom ? `${r.payeur_prenom} ${r.payeur_nom}` : 'Au guichet'],
    ['Date', date(r.confirme_le || r.created_at)],
  ]
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
            <div className="bulletin-ecole">{r.ecole}</div>
            <div className="bulletin-petit">{r.city || ''}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="bulletin-titre">Reçu de paiement</div>
            <div className="bulletin-petit">N° {r.numero_recu}</div>
          </div>
        </header>
        <table className="bulletin-table" style={{ marginTop: 16, minWidth: 0 }}>
          <tbody>
            {lignes.map(([k, v]) => (
              <tr key={k}>
                <td style={{ textAlign: 'left', width: '42%', background: '#f6f7fb' }}>
                  <b>{k}</b>
                </td>
                <td style={{ textAlign: 'left' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="bulletin-petit" style={{ marginTop: 14 }}>
          Reçu établi électroniquement par School pour le compte de l’établissement. Il fait foi du paiement enregistré.
        </p>
      </article>
    </>
  )
}
