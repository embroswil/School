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



  return (
    <>
      <h1 className="page-title">Abonnement School</h1>
      <section className="card" style={{ borderColor: couleur }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b style={{ font: '700 18px/1.3 var(--font-display)' }}>Année {e.annee}</b>
          <span className="tag" style={{ background: fond, color: couleur }}>
            {libelle}
          </span>
        </div>
        {e.statut === 'gratuit' ? (
          <p className="muted" style={{ marginTop: 8 }}>
            Votre établissement bénéficie de School gratuitement cette année.
          </p>
        ) : (
          <div className="stats" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginTop: 12 }}>
            <div className="stat">
              <b style={{ fontSize: 18 }}>{fcfa(e.montant)}</b>
              <span>montant annuel</span>
            </div>
            <div className="stat">
              <b style={{ fontSize: 18, color: 'var(--ok)' }}>{fcfa(e.paye)}</b>
              <span>payé</span>
            </div>
            <div className="stat">
              <b style={{ fontSize: 18, color: e.reste ? 'var(--danger)' : undefined }}>{fcfa(e.reste)}</b>
              <span>reste</span>
            </div>
          </div>
        )}
        {e.statut !== 'gratuit' && e.reste > 0 && (
          <p className="muted" style={{ marginTop: 10, fontSize: 14 }}>
            Échéance : <b>{jourLong(e.echeance)}</b>
            {e.statut !== 'lecture_seule' && ` · sans paiement, School passera en lecture seule le ${jourLong(e.finGrace)}`}
            {e.enAttente > 0 && ` · ${fcfa(e.enAttente)} déclarés, en cours de vérification`}
          </p>
        )}
      </section>

      {e.statut !== 'gratuit' && e.reste > 0 && (
        <>
          {e.enLigne && (
            <div className="card" style={{ borderLeft: '4px solid var(--primary)' }}>
              <b>Payer en ligne</b>
              <p className="muted" style={{ fontSize: 14, margin: '4px 0 10px' }}>
                Orange Money, MTN MoMo ou carte bancaire, via NotchPay. Le reçu est émis automatiquement.
              </p>
              <Field label="Montant (FCFA)">
                <input className="input" inputMode="numeric" placeholder={String(e.reste)} value={montantEnLigne} onChange={(x) => setMontantEnLigne(x.target.value.replace(/\D/g, ''))} />
              </Field>
              <button type="button" className="btn btn-block" disabled={busy} onClick={payerEnLigne}>
                {busy ? 'Un instant…' : `Payer ${fcfa(Number(montantEnLigne || e.reste))} en ligne`}
              </button>
            </div>
          )}
          <div className="card" style={{ borderLeft: '4px solid var(--line)' }}>
            <b>Payer en espèces</b>
            <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
              Remettez le montant à un représentant de {e.paiement.beneficiaire || 'School'} contre un reçu. Le paiement apparaîtra ici, avec son
              reçu, dès son enregistrement.
            </p>
            {e.paiement.telephone && (
              <a className="btn btn-quiet" href={`tel:${e.paiement.telephone.replace(/\s/g, '')}`} style={{ marginTop: 10, padding: '10px 14px', fontSize: 14 }}>
                📞 Prendre rendez-vous · {e.paiement.telephone}
              </a>
            )}
          </div>
        </>
      )}

      <h2 className="section-title">Historique</h2>
      {e.historique.length === 0 && <p className="muted">Aucun paiement pour le moment.</p>}
      {e.historique.length > 0 && (
        <ul className="rows">
          {e.historique.map((p) => (
            <li className="row" key={p.id}>
              <div className="row-main">
                <div className="row-title">
                  {fcfa(p.montant)} · {MOYENS[p.moyen]}
                </div>
                <div className="row-sub">
                  {jourLong(p.created_at)} · {p.annee}
                  {p.reference ? ` · réf. ${p.reference}` : ''}
                  {p.statut === 'rejete' && p.motif_rejet ? ` · ${p.motif_rejet}` : ''}
                </div>
              </div>
              {p.statut === 'confirme' ? (
                <a className="btn btn-quiet" style={{ padding: '8px 12px', fontSize: 14 }} href={`#/abonnement/recus/${p.id}`}>
                  Reçu
                </a>
              ) : (
                <span className={`tag ${p.statut === 'rejete' ? 'tag-off' : ''}`}>{p.statut === 'rejete' ? 'Non retrouvé' : 'En vérification'}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
