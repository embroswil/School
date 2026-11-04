import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'
import { MOYENS, STATUTS, fcfa, jourLong } from './Abonnement.jsx'

function Ecole({ e, onChange }) {
  const a = e.abonnement
  const [ouvert, setOuvert] = useState(false)
  const [f, setF] = useState({ tarifAnnuel: String(a.montant), echeance: a.echeance, gratuit: a.gratuit })
  const [p, setP] = useState({ montant: '', moyen: 'especes', reference: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [libelle, couleur, fond] = STATUTS[a.statut]

  async function faire(fn) {
    setError('')
    setBusy(true)
    try {
      await fn()
      onChange()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }
  return (
    <div className="ecole-carte">
      <button type="button" onClick={() => setOuvert(!ouvert)} className="ecole-tete" style={{ width: '100%', border: 0, background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit' }}>
        <div className="row-main">
          <div className="row-title">{e.name}</div>
          <div className="row-sub">
            {e.city ? `${e.city} · ` : ''}
            {a.statut === 'gratuit' ? 'gratuit' : `${fcfa(a.paye)} / ${fcfa(a.montant)} · échéance ${jourLong(a.echeance)}`}
          </div>
        </div>
        <span className="tag" style={{ background: fond, color: couleur }}>
          {libelle}
        </span>
      </button>
      {ouvert && (
        <div style={{ marginTop: 12 }}>
          <div className="grid2">
            <Field label="Montant annuel (FCFA)">
              <input className="input" inputMode="numeric" value={f.tarifAnnuel} onChange={(x) => setF({ ...f, tarifAnnuel: x.target.value.replace(/\D/g, '') })} />
            </Field>
            <Field label="Échéance">
              <input className="input" type="date" value={f.echeance} onChange={(x) => setF({ ...f, echeance: x.target.value })} />
            </Field>
          </div>
          <label className="check">
            <input type="checkbox" checked={f.gratuit} onChange={(x) => setF({ ...f, gratuit: x.target.checked })} />
            <span>Gratuit (école pilote, primaire public…)</span>
          </label>
          <button type="button" className="btn btn-quiet btn-block" disabled={busy} onClick={() => faire(() => api.put(`/api/abonnement/admin/ecoles/${e.id}`, { ...f, tarifAnnuel: Number(f.tarifAnnuel) }))}>
            Enregistrer le tarif
          </button>
          {a.statut !== 'gratuit' && a.reste > 0 && (
            <>
              <p className="groupe-titre" style={{ marginTop: 14 }}>
                Paiement reçu directement
              </p>
              <div className="grid2">
                <input className="input" inputMode="numeric" placeholder={`Montant (${a.reste})`} value={p.montant} onChange={(x) => setP({ ...p, montant: x.target.value.replace(/\D/g, '') })} />
                <select className="input" value={p.moyen} onChange={(x) => setP({ ...p, moyen: x.target.value })}>
                  {['especes', 'orange_money', 'mtn_momo', 'virement', 'autre'].map((m) => (
                    <option key={m} value={m}>
                      {MOYENS[m]}
                    </option>
                  ))}
                </select>
              </div>
              <input className="input" placeholder="Référence (facultatif)" value={p.reference} onChange={(x) => setP({ ...p, reference: x.target.value })} style={{ marginTop: 8 }} />
              <button
                type="button"
                className="btn btn-block"
                style={{ marginTop: 8 }}
                disabled={busy}
                onClick={() => faire(() => api.post(`/api/abonnement/admin/ecoles/${e.id}/paiements`, { ...p, montant: Number(p.montant || a.reste) }))}
              >
                Enregistrer {fcfa(Number(p.montant || a.reste))} (reçu automatique)
              </button>
            </>
          )}
          <Note>{error}</Note>
        </div>
      )}
    </div>
  )
}

function Reglages({ r, onChange }) {
  const [f, setF] = useState({ ...r })
  const [ok, setOk] = useState('')
  const maj = (k) => (x) => setF({ ...f, [k]: x.target.value })
  return (
    <form
      className="card"
      onSubmit={async (ev) => {
        ev.preventDefault()
        await api.put('/api/abonnement/admin/reglages', { ...f, prixDefaut: Number(f.prixDefaut), delaiGrace: Number(f.delaiGrace) })
        setOk('Réglages enregistrés.')
        onChange()
      }}
    >
      <div className="grid2">
        <Field label="Prix par défaut (FCFA / an)">
          <input className="input" inputMode="numeric" value={f.prixDefaut} onChange={maj('prixDefaut')} />
        </Field>
        <Field label="Échéance (MM-JJ)">
          <input className="input" placeholder="10-31" value={f.echeance} onChange={maj('echeance')} />
        </Field>
      </div>
      <Field label="Jours avant la lecture seule (après l’échéance)">
        <input className="input" inputMode="numeric" value={f.delaiGrace} onChange={maj('delaiGrace')} />
      </Field>
      <Field label="Bénéficiaire (nom affiché aux écoles)">
        <input className="input" value={f.beneficiaire} onChange={maj('beneficiaire')} />
      </Field>
      <Field label="Téléphone de contact (paiements en espèces)">
        <input className="input" inputMode="tel" placeholder="6 XX XX XX XX" value={f.telephone || ''} onChange={maj('telephone')} />
      </Field>
      <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
        Paiement en ligne : la clé NotchPay se règle sur Render (NOTCHPAY_PUBLIC_KEY). Espèces : enregistrez le paiement sur la fiche de l’établissement.
      </p>
      <Note kind="ok">{ok}</Note>
      <button className="btn btn-block" type="submit">
        Enregistrer les réglages
      </button>
    </form>
  )
}

// Abonnements des etablissements (administrateur de la plateforme)
export default function AbonnementsAdmin() {
  const d = useApi('/api/abonnement/admin')
  const [onglet, setOnglet] = useState('ecoles')
  const [motifs, setMotifs] = useState({})
  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Chargement…</p>
  const { totaux, attente, ecoles, annee, reglages } = d.data
  return (
    <>
      <h1 className="page-title">Abonnements {annee}</h1>
      <div className="kpis">
        <div className="kpi">
          <b>{fcfa(totaux.encaisse)}</b>
          <span>encaissé</span>
          <small>sur {fcfa(totaux.attendu)} attendus</small>
        </div>
        <div className="kpi">
          <b style={{ color: totaux.reste ? 'var(--danger)' : undefined }}>{fcfa(totaux.reste)}</b>
          <span>reste à encaisser</span>
          <small>
            {totaux.enRetard} en retard · {totaux.gratuits} gratuit(s)
          </small>
        </div>
      </div>

      {attente.length > 0 && (
        <>
          <h2 className="section-title">À confirmer ({attente.length})</h2>
          <p className="muted" style={{ fontSize: 14, marginBottom: 8 }}>
            Vérifiez chaque transfert sur ton téléphone avant de confirmer.
          </p>
          {attente.map((p) => (
            <div className="card" key={p.id}>
              <b>
                {p.ecole} · {fcfa(p.montant)}
              </b>
              <div className="muted" style={{ fontSize: 14 }}>
                {MOYENS[p.moyen]} · réf. {p.reference} · {jourLong(p.created_at)} · {p.annee}
              </div>
              <input
                className="input"
                placeholder="Motif si non retrouvé (facultatif)"
                value={motifs[p.id] || ''}
                onChange={(x) => setMotifs({ ...motifs, [p.id]: x.target.value })}
                style={{ marginTop: 8 }}
              />
              <div className="actions" style={{ marginTop: 8 }}>
                <button type="button" className="btn" onClick={async () => (await api.post(`/api/abonnement/admin/paiements/${p.id}/confirmer`), d.reload())}>
                  ✓ Confirmer
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-danger"
                  onClick={async () => (await api.post(`/api/abonnement/admin/paiements/${p.id}/rejeter`, { motif: motifs[p.id] }), d.reload())}
                >
                  Non retrouvé
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      <div className="chips" style={{ marginTop: 16 }}>
        <button type="button" className="chip" aria-pressed={onglet === 'ecoles'} onClick={() => setOnglet('ecoles')}>
          Établissements ({ecoles.length})
        </button>
        <button type="button" className="chip" aria-pressed={onglet === 'reglages'} onClick={() => setOnglet('reglages')}>
          Réglages
        </button>
      </div>
      {onglet === 'ecoles' ? (
        ecoles.length === 0 ? (
          <p className="muted">Aucun établissement pour le moment.</p>
        ) : (
          ecoles.map((e) => <Ecole key={`${e.id}-${e.abonnement.montant}-${e.abonnement.statut}`} e={e} onChange={d.reload} />)
        )
      ) : (
        <Reglages r={reglages} onChange={d.reload} />
      )}
    </>
  )
}
