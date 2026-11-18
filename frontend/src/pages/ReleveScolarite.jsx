import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'
import { fcfa, MODES_PAIEMENT } from '../recus.js'
import { EnteteRecu } from './RecuScolarite.jsx'

const nb = (n) => Number(n || 0).toLocaleString('fr-FR')
const jour = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—')

// Releve des paiements de scolarite d'un eleve sur l'annee : frais, paye, reste et tous les recus.
export default function ReleveScolarite({ id }) {
  const d = useApi(`/api/scolarite/releve/${id}`)
  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Chargement…</p>
  const r = d.data
  return (
    <>
      <div className="recu-actions sans-impression">
        <button type="button" className="btn" onClick={() => window.print()}>
          Imprimer ou PDF
        </button>
      </div>
      <article className="bulletin recu">
        <EnteteRecu ecoleId={r.ecoleId} aPhoto={r.aPhoto} ecole={r.ecole} ville={r.ville} titre="Relevé de scolarité" sous={r.annee ? `Année ${r.annee}` : ''} />
        <p className="recu-eleve">
          <b data-brut>{`${r.eleve.nom} ${r.eleve.prenom}`}</b>
          <span>{[r.eleve.classe, r.matricule ? `Matricule ${r.matricule}` : ''].filter(Boolean).join(' · ')}</span>
        </p>

        <div className="recu-situation">
          <div>
            <span>Total dû</span>
            <b>{fcfa(r.total)}</b>
          </div>
          <div>
            <span>Payé</span>
            <b>{fcfa(r.paye)}</b>
          </div>
          <div className={r.reste ? 'du' : 'solde'}>
            <span>Reste à payer</span>
            <b>{r.reste ? fcfa(r.reste) : 'Soldé'}</b>
          </div>
        </div>

        <h3 className="recu-section">Frais de l’année</h3>
        <p className="recu-unite">Montants en FCFA</p>
        <table className="recu-table">
          <thead>
            <tr>
              <th>Frais</th>
              <th className="recu-col-option">Échéance</th>
              <th>Montant</th>
              <th>Payé</th>
              <th>Reste</th>
            </tr>
          </thead>
          <tbody>
            {r.frais.map((f) => (
              <tr key={f.id}>
                <td>{f.nom}</td>
                <td className="recu-col-option">{jour(f.echeance)}</td>
                <td>{nb(f.montant)}</td>
                <td>{nb(Math.min(f.paye, f.montant))}</td>
                <td className={f.reste ? 'du' : 'solde'}>{f.reste ? nb(f.reste) : 'Payé'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="recu-section">{`Reçus · ${r.recus.length}`}</h3>
        {r.recus.length === 0 ? (
          <p className="muted">Aucun paiement enregistré.</p>
        ) : (
          <table className="recu-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>N° de reçu</th>
                <th>Objet</th>
                <th className="recu-col-option">Moyen</th>
                <th>Montant</th>
              </tr>
            </thead>
            <tbody>
              {r.recus.map((p) => (
                <tr key={p.id}>
                  <td>{jour(p.confirme_le || p.created_at)}</td>
                  <td>
                    <a href={`#/recus/${p.id}`} data-brut>
                      {p.numero_recu}
                    </a>
                    {p.recu_externe && (
                      <small className="recu-externe" data-brut>
                        {p.recu_externe}
                      </small>
                    )}
                  </td>
                  <td>{p.frais}</td>
                  <td className="recu-col-option">{MODES_PAIEMENT[p.mode] || p.mode}</td>
                  <td>{nb(p.montant)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="recu-mention">{`Relevé édité le ${jour(r.edite)} par Sùkûl pour le compte de l’établissement. Chaque reçu porte un code de vérification.`}</p>
      </article>
    </>
  )
}
