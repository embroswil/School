import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'

export const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`
export const jourLong = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '')
export const STATUTS = {
  gratuit: ['Gratuit', 'var(--ok)', 'var(--ok-soft)'],
  essai: ['Essai gratuit', 'var(--ok)', 'var(--ok-soft)'],
  paye: ['Payé', 'var(--ok)', 'var(--ok-soft)'],
  a_jour: ['À jour', 'var(--ok)', 'var(--ok-soft)'],
  a_payer: ['À payer', '#a35d00', '#fff1d6'],
  en_retard: ['En retard', 'var(--danger)', '#ffe5e9'],
  lecture_seule: ['Lecture seule', 'var(--danger)', '#ffe5e9'],
}
export const MOYENS = { orange_money: 'Orange Money', mtn_momo: 'MTN MoMo', virement: 'Virement', especes: 'Espèces', notchpay: 'Paiement en ligne', autre: 'Autre' }

// Bandeau d'alerte (accueil) : seulement en cas de retard ou de lecture seule.
// Une echeance a venir ne s'affiche pas ici : elle se consulte dans Profil › Abonnement.
export function BandeauAbonnement({ role }) {
  const d = useApi('/api/abonnement')
  const e = d.data
  if (!e) return null
  if (role !== 'principal' && e.statut !== 'lecture_seule') return null
  if (role === 'principal' && !['en_retard', 'lecture_seule'].includes(e.statut)) return null
  const texte =
    e.statut === 'lecture_seule'
      ? role === 'principal'
        ? 'Abonnement non réglé : Sùkûl est en lecture seule. Réglez-le pour reprendre les saisies.'
        : 'L’établissement est temporairement en lecture seule : les saisies reprendront prochainement.'
      : `Abonnement en retard : ${fcfa(e.reste)} à régler avant le ${jourLong(e.finGrace)}.`
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

// Page « Abonnement Sùkûl » de l'etablissement
export default function Abonnement() {
  const d = useApi('/api/abonnement')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const [annee, setAnnee] = useState(false)
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
        if (r.data.statut === 'confirme') setOk('Paiement en ligne confirmé. Votre reçu est disponible dans l’historique.')
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
      const r = await api.post('/api/abonnement/payer', { montant: aPayer })
      try {
        localStorage.setItem('school-abonnement', r.data.reference)
      } catch (_) {}
      window.location.href = r.data.url
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  const [libelle, couleur, fond] = STATUTS[e.statut] || STATUTS.a_payer
  const pct = e.montant > 0 ? Math.min(100, Math.round((e.paye / e.montant) * 100)) : 100
  const doit = e.statut !== 'gratuit' && e.resteAnnee > 0
  // a payer : le trimestre du (ou le prochain), ou le reste de l'annee
  const trimestre = e.reste || e.prochain
  const aPayer = annee ? e.resteAnnee : trimestre

  return (
    <>
      <h1 className="page-title">Abonnement Sùkûl</h1>

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
            <p className="muted">Votre établissement bénéficie de Sùkûl gratuitement cette année.</p>
          </>
        ) : (
          <>
            {e.statut === 'essai' ? (
              <b className="abo-montant">
                Essai gratuit <small>{`jusqu’au ${jourLong(e.essaiFin)}`}</small>
              </b>
            ) : e.reste > 0 ? (
              <b className="abo-montant">
                {fcfa(e.reste)} <small>à régler</small>
              </b>
            ) : (
              <b className="abo-montant">{e.statut === 'paye' ? 'Année réglée' : 'À jour'}</b>
            )}
            <p className="abo-tarif">{`${fcfa(e.prixTrimestre)} par trimestre, ou ${fcfa(e.prixAnnee)} pour l’année entière`}</p>
            <div className="abo-progres" title={`${pct} % payé`}>
              <i style={{ width: `${pct}%` }} />
            </div>
            <div className="abo-ligne">
              <span>
                Payé <b style={{ color: 'var(--vert)' }}>{fcfa(e.paye)}</b>
              </span>
              <span>
                Reste sur l’année <b>{fcfa(e.resteAnnee)}</b>
              </span>
            </div>
            {doit && (
              <p className="abo-echeance">
                {e.reste > 0 ? 'Échéance' : 'Prochain trimestre à régler avant le'} : <b>{jourLong(e.echeance)}</b>
                {e.reste > 0 && e.statut !== 'lecture_seule' && <> · sans paiement, Sùkûl passera en lecture seule le {jourLong(e.finGrace)}</>}
                {e.enAttente > 0 && <> · {fcfa(e.enAttente)} déclarés, en cours de vérification</>}
              </p>
            )}
            {!doit && <p className="abo-echeance">Abonnement entièrement réglé. Merci !</p>}
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
                {e.resteAnnee > trimestre && (
                  <div className="chips" style={{ margin: '4px 0 10px' }}>
                    <button type="button" className="chip" aria-pressed={!annee} onClick={() => setAnnee(false)}>
                      {`Trimestre · ${fcfa(trimestre)}`}
                    </button>
                    <button type="button" className="chip" aria-pressed={annee} onClick={() => setAnnee(true)}>
                      {`Année · ${fcfa(e.resteAnnee)}`}
                    </button>
                  </div>
                )}
                <button type="button" className="btn btn-block" disabled={busy} onClick={payerEnLigne}>
                  {busy ? 'Un instant…' : `Payer ${fcfa(aPayer)}`}
                </button>
              </div>
            )}
            <div className="card abo-mode">
              <b>En espèces</b>
              <p className="muted">
                Remettez le montant à un représentant de {e.paiement.beneficiaire || 'Sùkûl'} contre un reçu. Le paiement apparaît ici dès son enregistrement.
              </p>
              {e.paiement.telephone && (
                <a className="btn btn-quiet btn-block" href={`tel:${e.paiement.telephone.replace(/\s/g, '')}`}>
                  {`Prendre rendez-vous · ${e.paiement.telephone}`}
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
        L’abonnement comprend toutes les fonctions de Sùkûl pour tous vos élèves et enseignants : appel, notes, scolarité, informations aux familles et assistance. Un nouvel établissement profite d’un trimestre d’essai gratuit.
      </p>
    </>
  )
}
