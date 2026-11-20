import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { fcfa, MODES_PAIEMENT } from '../recus.js'

const date = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—')

// Situation de scolarite d'un eleve retrouve par son matricule : a-t-il paye ? que reste-t-il ?
function Situation({ s }) {
  const statut =
    s.statut === 'regle'
      ? ['ok', '✓', 'Scolarité réglée', 'Tous les frais obligatoires sont payés.']
      : s.statut === 'aucun'
        ? ['neutre', 'i', 'Aucun frais', 'Aucun frais obligatoire ne concerne cet élève.']
        : [s.statut === 'non_paye' || s.enRetard ? 'ko' : 'attention', '!', `Reste à payer : ${fcfa(s.resteObligatoire)}`, s.statut === 'non_paye' ? 'Aucun frais obligatoire n’a été payé.' : s.enRetard ? 'Des frais ne sont pas payés à leur échéance.' : 'Paiement partiel, sans retard.']
  return (
    <div className={`verif-resultat ${statut[0]}`}>
      <span className="verif-sceau" aria-hidden="true">
        {statut[1]}
      </span>
      <b>{statut[2]}</b>
      <small>{statut[3]}</small>
      <dl className="recu-lignes">
        {[
          ['Élève', `${s.eleve.nom} ${s.eleve.prenom}`],
          ['Classe', s.eleve.classe || '—'],
          ['Matricule', s.matricule || '—'],
          ['Payé', `${fcfa(s.paye)} sur ${fcfa(s.total)}`],
        ].map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd data-brut={['Élève', 'Matricule'].includes(k) ? '' : undefined}>{v}</dd>
          </div>
        ))}
      </dl>
      {s.frais.length > 0 && (
        <table className="verif-frais">
          <thead>
            <tr>
              <th>Frais</th>
              <th>Payé</th>
              <th>Reste</th>
            </tr>
          </thead>
          <tbody>
            {s.frais.map((f) => {
              const retard = f.reste > 0 && f.echeance && new Date(f.echeance) < new Date()
              return (
                <tr key={f.id}>
                  <td>
                    {f.nom}
                    <small>{f.obligatoire === false ? 'Facultatif' : f.echeance ? `${retard ? 'En retard · ' : ''}avant le ${date(f.echeance)}` : 'Sans échéance'}</small>
                  </td>
                  <td>{fcfa(Math.min(f.paye, f.montant))}</td>
                  <td className={f.reste ? (retard ? 'rouge' : '') : 'vert'}>{f.reste ? fcfa(f.reste) : 'Payé'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <div className="verif-liens">
        <a href={`#/releve/${s.eleve.id}`}>Relevé des paiements</a>
        <a href={`#/eleves/${s.eleve.id}`}>Fiche de l’élève</a>
      </div>
    </div>
  )
}

// Verification par l'administration : par le MATRICULE de l'eleve (a-t-il paye, que reste-t-il ?).
// Le lien du QR code imprime sur un recu Sukul ouvre aussi cette page avec le recu verifie.
export default function VerifierRecu({ numero: numeroLien = '', code: codeLien = '' }) {
  const [saisie, setSaisie] = useState('')
  const [situation, setSituation] = useState(null)
  const [erreur, setErreur] = useState('')
  const [busy, setBusy] = useState(false)
  const [etat, setEtat] = useState(null) // recu verifie depuis son QR code

  async function chercher(matricule) {
    const m = matricule.trim()
    if (!m) return
    setBusy(true)
    setErreur('')
    setSituation(null)
    setEtat(null)
    try {
      setSituation((await api.get(`/api/verifier/eleves/${encodeURIComponent(m)}`)).data)
    } catch (err) {
      setErreur(err.message)
    }
    setBusy(false)
  }
  useEffect(() => {
    if (!numeroLien) return
    ;(async () => {
      try {
        const r = await api.get(`/api/verifier/recus/${encodeURIComponent(numeroLien.toUpperCase())}${codeLien ? `?c=${encodeURIComponent(codeLien.toUpperCase())}` : ''}`)
        setEtat({ ok: r.data.codeOk !== false, recu: r.data })
      } catch (err) {
        setEtat({ ok: false, message: err.message })
      }
    })()
  }, [numeroLien, codeLien])

  const r = etat?.recu
  return (
    <div className="verif">
      <h1 className="page-title">Vérifier un paiement</h1>
      <p className="lede">Saisissez le matricule de l’élève : vous voyez aussitôt s’il a payé et ce qu’il reste à payer.</p>
      <form
        className="verif-saisie"
        onSubmit={(e) => {
          e.preventDefault()
          chercher(saisie)
        }}
      >
        <input className="input" value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="Matricule de l’élève" autoComplete="off" autoCapitalize="characters" aria-label="Matricule de l’élève" autoFocus={!numeroLien} />
        <button type="submit" className="btn" disabled={busy || !saisie.trim()}>
          {busy ? '…' : 'Vérifier'}
        </button>
      </form>
      {erreur && (
        <div className="verif-resultat ko">
          <span className="verif-sceau" aria-hidden="true">
            !
          </span>
          <b>Élève introuvable</b>
          <small>{erreur}</small>
        </div>
      )}
      {situation && <Situation s={situation} />}

      {etat && !r && (
        <div className="verif-resultat ko">
          <span className="verif-sceau" aria-hidden="true">
            !
          </span>
          <b>Reçu non reconnu</b>
          <small>{etat.message}</small>
        </div>
      )}
      {r && (
        <div className={`verif-resultat ${etat.ok ? 'ok' : 'ko'}`}>
          <span className="verif-sceau" aria-hidden="true">
            {etat.ok ? '✓' : '!'}
          </span>
          <b>{etat.ok ? 'Reçu authentique' : 'Reçu modifié'}</b>
          <small>{etat.ok ? 'Ce paiement est bien enregistré dans Sùkûl.' : 'Le code du reçu ne correspond pas au paiement enregistré : ce document a été modifié. Seules les informations ci-dessous font foi.'}</small>
          <dl className="recu-lignes">
            {[
              ['Élève', r.eleve.nom],
              ['Classe', r.eleve.classe || '—'],
              ...(r.eleve.matricule ? [['Matricule', String(r.eleve.matricule).replace(/^\d+-/, '')]] : []),
              ['Objet', r.frais],
              ['Montant', fcfa(r.montant)],
              ['Date', date(r.date)],
              ['Moyen de paiement', MODES_PAIEMENT[r.mode] || r.mode],
              ['N° Sùkûl', r.numero],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd data-brut={['Élève', 'Matricule', 'N° Sùkûl'].includes(k) ? '' : undefined}>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="verif-situation">
            <span>{r.frais}</span>
            <b className={r.fraisReste ? 'rouge' : 'vert'}>{r.fraisReste ? `Reste ${fcfa(r.fraisReste)}` : 'Soldé'}</b>
            <small>{`${fcfa(r.fraisPaye)} payés sur ${fcfa(r.fraisMontant)}`}</small>
          </div>
          <div className="verif-liens">
            <a href={`#/recus/${r.id}`}>Voir le reçu</a>
            <a href={`#/releve/${r.eleve.id}`}>Relevé de l’élève</a>
          </div>
        </div>
      )}
    </div>
  )
}
