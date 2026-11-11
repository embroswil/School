import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'

export const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`
export const jourLong = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '')
export const STATUTS = {
  gratuit: ['Gratuit', 'var(--ok)', 'var(--ok-soft)'],
  paye: ['Payé', 'var(--ok)', 'var(--ok-soft)'],
  a_payer: ['À payer', '#a35d00', '#fff1d6'],
  en_retard: ['En retard', 'var(--danger)', '#ffe5e9'],
  lecture_seule: ['Lecture seule', 'var(--danger)', '#ffe5e9'],
}
export const MOYENS = { orange_money: 'Orange Money', mtn_momo: 'MTN MoMo', virement: 'Virement', especes: 'Espèces', notchpay: 'Paiement en ligne', autre: 'Autre' }

// Bandeau d'alerte (accueil) : echeance proche, retard ou lecture seule
export function BandeauAbonnement({ role }) {
  const d = useApi('/api/abonnement')
  const e = d.data
  if (!e) return null
  const proche = e.statut === 'a_payer' && e.joursRestants <= 30
  if (role !== 'principal' && e.statut !== 'lecture_seule') return null
  if (role === 'principal' && !(proche || ['en_retard', 'lecture_seule'].includes(e.statut))) return null
  const texte =
    e.statut === 'lecture_seule'
      ? role === 'principal'
        ? 'Abonnement non réglé : School est en lecture seule. Réglez-le pour reprendre les saisies.'
        : 'L’établissement est temporairement en lecture seule : les saisies reprendront prochainement.'
      : e.statut === 'en_retard'
        ? `Abonnement en retard : ${fcfa(e.reste)} à régler avant le ${jourLong(e.finGrace)}.`
        : `Abonnement ${e.annee} : ${fcfa(e.reste)} à régler avant le ${jourLong(e.echeance)}.`
  // Calcule AVANT d'etre utilise (sinon erreur au rendu et page noire)
  const urgent = ['en_retard', 'lecture_seule'].includes(e.statut)
  const contenu = (
    <>
      {texte} {role === 'principal' && <b style={{ color: urgent ? 'var(--danger)' : '#7aa5ff' }}>Voir ›</b>}
    </>
  )
  const style = {
    display: 'block',
    marginTop: 4,
    background: 'var(--card)',
    color: 'var(--text)',
    border: '1px solid var(--line)',
    borderLeft: `4px solid ${urgent ? 'var(--danger)' : 'var(--primary)'}`,
  }
  return role === 'principal' ? (
    <a className="note" href="#/abonnement" style={style}>
      {contenu}
    </a>
  ) : (
    <div className="note" style={style}>
      {contenu}
    </div>
  )
}

// Page « Abonnement School » de l'etablissement
export default function Abonnement() {
  const d = useApi('/api/abonnement')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const [montantEnLigne, setMontantEnLigne] = useState('')
  // Retour de la page de paiement NotchPay : verification
  useEffect(() => {
    let ref = null
    try {
      ref = localStorage.getItem('school-abonnement')
    } catch (_) {}
    if (!ref) return
    api
      .get(`/api/abonnement/verifier/${encodeURIComponent(ref)}`)
      .then((r) => {
        if (r.data.statut === 'confirme') setOk('✓ Paiement en ligne confirmé. Votre reçu est disponible dans l’historique.')
        else if (r.data.statut === 'echoue') setError('Le paiement en ligne n’a pas abouti.')
        if (r.data.statut !== 'en_attente') localStorage.removeItem('school-abonnement')
        d.reload()
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Chargement…</p>
  const e = d.data

  async function payerEnLigne() {
    setError('')
    setBusy(true)
    try {
      const r = await api.post('/api/abonnement/payer', { montant: Number(montantEnLigne || e.reste) })
      try {
        localStorage.setItem('school-abonnement', r.data.reference)
      } catch (_) {}
      window.location.href = r.data.url
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  const [libelle, couleur, fond] = STATUTS[e.statut]
  const pct = e.montant > 0 ? Math.min(100, Math.round((e.paye / e.montant) * 100)) : 100
  const doit = e.statut !== 'gratuit' && e.reste > 0

  return (
    <>
      <h1 className="page-title">Abonnement School</h1>

      <section className="abo-hero">
        <div className="abo-hero-tete">
          <span>Année {e.annee}</span>
          <span className="tag" style={{ background: fond, color: couleur }}>
            {libelle}
          </span>
        </div>
        {e.statut === 'gratuit' ? (
          <>
            <b className="abo-montant">Gratuit</b>
            <p className="muted">Votre établissement bénéficie de School gratuitement cette année.</p>
          </>
        ) : (
          <>
            <b className="abo-montant">
              {fcfa(e.montant)} <small>/ an</small>
            </b>
            <div className="abo-progres" title={`${pct} % payé`}>
              <i style={{ width: `${pct}%` }} />
            </div>
            <div className="abo-ligne">
              <span>
                Payé <b style={{ color: '#5fd0a0' }}>{fcfa(e.paye)}</b>
              </span>
              <span>
                Reste <b style={{ color: e.reste ? '#ff7a82' : undefined }}>{fcfa(e.reste)}</b>
              </span>
            </div>
            {doit && (
              <p className="abo-echeance">
                Échéance : <b>{jourLong(e.echeance)}</b>
                {e.statut !== 'lecture_seule' && <> · sans paiement, School passera en lecture seule le {jourLong(e.finGrace)}</>}
                {e.enAttente > 0 && <> · {fcfa(e.enAttente)} déclarés, en cours de vérification</>}
              </p>
            )}
            {!doit && <p className="abo-echeance">✓ Abonnement entièrement réglé. Merci !</p>}
          </>
        )}
      </section>
      <Note kind="ok">{ok}</Note>
      <Note>{error}</Note>

      {doit && (
        <>
          <h2 className="section-title">Régler l’abonnement</h2>
          <div className="abo-modes">
            {e.enLigne && (
              <div className="card abo-mode abo-mode-principal">
                <b>En ligne</b>
                <p className="muted">Orange Money, MTN MoMo ou carte bancaire. Reçu émis automatiquement.</p>
                <Field label="Montant (FCFA)">
                  <input className="input" inputMode="numeric" placeholder={String(e.reste)} value={montantEnLigne} onChange={(x) => setMontantEnLigne(x.target.value.replace(/\D/g, ''))} />
                </Field>
                <button type="button" className="btn btn-block" disabled={busy} onClick={payerEnLigne}>
                  {busy ? 'Un instant…' : `Payer ${fcfa(Number(montantEnLigne || e.reste))}`}
                </button>
              </div>
            )}
            <div className="card abo-mode">
              <b>En espèces</b>
              <p className="muted">
                Remettez le montant à un représentant de {e.paiement.beneficiaire || 'School'} contre un reçu. Le paiement apparaît ici dès son enregistrement.
              </p>
              {e.paiement.telephone && (
                <a className="btn btn-quiet btn-block" href={`tel:${e.paiement.telephone.replace(/\s/g, '')}`}>
                  📞 Prendre rendez-vous · {e.paiement.telephone}
                </a>
              )}
            </div>
          </div>
        </>
      )}

      <h2 className="section-title">Historique des paiements</h2>
      {e.historique.length === 0 && <p className="muted">Aucun paiement pour le moment.</p>}
      {e.historique.length > 0 && (
        <div className="tableau-ordi-cadre">
          <table className="tableau-ordi">
            <thead>
              <tr>
                <th>Date</th>
                <th>Montant</th>
                <th>Moyen</th>
                <th>Référence</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {e.historique.map((p) => (
                <tr key={p.id}>
                  <td>{jourLong(p.created_at)}</td>
                  <td>
                    <b>{fcfa(p.montant)}</b>
                  </td>
                  <td>{MOYENS[p.moyen]}</td>
                  <td className="muted">
                    {p.reference || '—'}
                    {p.statut === 'rejete' && p.motif_rejet ? ` · ${p.motif_rejet}` : ''}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {p.statut === 'confirme' ? (
                      <a className="btn btn-quiet" style={{ padding: '6px 12px', fontSize: 13 }} href={`#/abonnement/recus/${p.id}`}>
                        Reçu
                      </a>
                    ) : (
                      <span className={`tag ${p.statut === 'rejete' ? 'tag-off' : ''}`}>{p.statut === 'rejete' ? 'Non retrouvé' : 'En vérification'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted" style={{ fontSize: 12.5, margin: '14px 2px 0' }}>
        L’abonnement comprend toutes les fonctions de School pour tous vos élèves et enseignants : appel, notes et bulletins, scolarité, informations aux familles et assistance.
      </p>
    </>
  )
}
