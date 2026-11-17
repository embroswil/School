import { useApi } from '../hooks.js'
import { Note, annoncer } from '../ui.jsx'
import { useAuth } from '../auth.jsx'
import { qrSvg } from '../qr.js'
import { enLettres, fcfa, inWords, lienVerification, MODES_PAIEMENT } from '../recus.js'
import { langue } from '../i18n.jsx'

const API = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '')
const date = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—')
const heure = (d) => (d ? new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '')

/** En-tete commun des recus et releves : logo (photo de l'etablissement) et nom. */
export function EnteteRecu({ ecoleId, aPhoto, ecole, ville, titre, numero, sous }) {
  return (
    <header className="recu-tete">
      <div className="recu-ecole">
        {aPhoto ? <img src={`${API}/api/actualites/ecoles/${ecoleId}/photo`} alt="" /> : <span className="recu-logo">{String(ecole || '?').charAt(0)}</span>}
        <div>
          <b data-brut>{ecole}</b>
          {ville && <small>{ville}</small>}
        </div>
      </div>
      <div className="recu-titre">
        <b>{titre}</b>
        {numero && <small>{`N° ${numero}`}</small>}
        {sous && <small>{sous}</small>}
      </div>
    </header>
  )
}

// Recu virtuel d'un paiement de scolarite : verifiable par QR code, imprimable et partageable.
export default function RecuScolarite({ id }) {
  const { user } = useAuth()
  const d = useApi(`/api/scolarite/recus/${id}`)
  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Chargement…</p>
  const r = d.data
  const lien = lienVerification(r.numero_recu, r.code)
  const quand = r.confirme_le || r.created_at
  const lignes = [
    ['Élève', `${r.last_name} ${r.first_name}`],
    ['Classe', r.classe || '—'],
    ...(r.matricule ? [['Matricule', r.matricule]] : []),
    ['Objet', r.frais],
    ['Moyen de paiement', MODES_PAIEMENT[r.mode] || r.mode],
    ...(r.reference ? [['Référence', r.reference]] : []),
    ['Payé par', r.payeur_nom ? `${r.payeur_prenom} ${r.payeur_nom}` : 'Au guichet de l’établissement'],
    ['Date', `${date(quand)} · ${heure(quand)}`],
    ...(r.frais_service ? [['Frais de transaction', fcfa(r.frais_service)]] : []),
  ]
  async function partager() {
    const texte = `Reçu ${r.numero_recu} · ${r.ecole} · ${r.first_name} ${r.last_name} · ${fcfa(r.montant)} (${r.frais})`
    try {
      if (navigator.share) await navigator.share({ title: `Reçu ${r.numero_recu}`, text: texte, url: lien })
      else {
        await navigator.clipboard.writeText(`${texte}\n${lien}`)
        annoncer('Lien du reçu copié')
      }
    } catch {
      /* partage annule */
    }
  }
  return (
    <>
      <div className="recu-actions sans-impression">
        <button type="button" className="btn" onClick={() => window.print()}>
          Imprimer
        </button>
        <button type="button" className="btn btn-quiet" onClick={partager}>
          Partager
        </button>
        {user.role !== 'teacher' && (
          <a className="btn btn-quiet" href={`#/releve/${r.student_id}`}>
            Relevé
          </a>
        )}
      </div>

      <article className="bulletin recu">
        <EnteteRecu ecoleId={r.school_id} aPhoto={r.a_photo} ecole={r.ecole} ville={r.city} titre="Reçu de paiement" numero={r.numero_recu} />

        <div className="recu-montant">
          <span>Montant reçu</span>
          <b>{fcfa(r.montant)}</b>
          <small data-brut>{langue === 'en' ? `Received the sum of ${inWords(r.montant)} CFA francs` : `Arrêté à la somme de ${enLettres(r.montant)} francs CFA`}</small>
          <span className="recu-tampon" aria-hidden="true">
            Payé
          </span>
        </div>

        <dl className="recu-lignes">
          {lignes.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd data-brut={k === 'Élève' || k === 'Référence' || k === 'Matricule' ? '' : undefined}>{v}</dd>
            </div>
          ))}
        </dl>

        <div className="recu-situation">
          <div>
            <span>Reste sur ce frais</span>
            <b>{fcfa(r.resteApres)}</b>
          </div>
          {r.annee && (
            <>
              <div>
                <span>Payé sur l’année</span>
                <b>{fcfa(r.annee.paye)}</b>
              </div>
              <div>
                <span>Reste sur l’année</span>
                <b>{fcfa(r.annee.reste)}</b>
              </div>
            </>
          )}
        </div>

        <footer className="recu-pied">
          <div className="recu-qr" dangerouslySetInnerHTML={{ __html: qrSvg(lien, 112) }} />
          <div>
            <b>Reçu vérifiable</b>
            <p>Scannez ce code ou ouvrez sukul.site › Vérifier un reçu, avec le numéro et le code ci-dessous.</p>
            <p className="recu-code">
              Code : <b data-brut>{r.code}</b>
            </p>
            <p>Reçu émis électroniquement par Sùkûl pour le compte de l’établissement. Il fait foi du paiement enregistré.</p>
          </div>
        </footer>
      </article>
    </>
  )
}
