import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'

const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`
const heure = (d) => (d ? new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')
export const ETATS = {
  a_payer: ['En attente de votre paiement', 'À payer', '#a35d00', '#fff1d6'],
  paye: ['En attente de confirmation de l’établissement', 'À confirmer', 'var(--primary)', 'var(--primary-soft)'],
  confirme: ['Paiement confirmé', 'Confirmé', 'var(--ok)', 'var(--ok-soft)'],
  litige: ['Litige en cours', 'Litige', 'var(--danger)', '#ffe5e9'],
  annule: ['Ordre annulé', 'Annulé', 'var(--muted)', 'var(--line)'],
  expire: ['Ordre expiré', 'Expiré', 'var(--muted)', 'var(--line)'],
}

// Photo de la capture, reduite (max 1000 px, JPEG) avant l'envoi
const reduire = (fichier) =>
  new Promise((ok, ko) => {
    const img = new Image()
    img.onload = () => {
      const r = Math.min(1, 1000 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * r)
      c.height = Math.round(img.height * r)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      ok(c.toDataURL('image/jpeg', 0.7))
    }
    img.onerror = () => ko(new Error('Image illisible'))
    img.src = URL.createObjectURL(fichier)
  })

function Copier({ valeur, children }) {
  const [fait, setFait] = useState(false)
  return (
    <button
      type="button"
      className="btn btn-quiet"
      style={{ padding: '6px 10px', fontSize: 13 }}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(String(valeur))
          setFait(true)
          setTimeout(() => setFait(false), 1500)
        } catch (_) {}
      }}
    >
      {fait ? '✓ Copié' : children || 'Copier'}
    </button>
  )
}

const API = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '')
// Numero au format international pour WhatsApp (Cameroun par defaut)
const international = (t) => {
  const c = String(t || '').replace(/\D/g, '')
  return c.length === 9 ? `237${c}` : c
}

// Contact direct avec l'autre partie : appel et WhatsApp
function Contact({ titre, nom, telephone, message }) {
  if (!telephone) return null
  return (
    <div className="card contact-ordre">
      <div style={{ flex: 1 }}>
        <b>{titre}</b>
        <div className="muted" style={{ fontSize: 14 }}>
          {nom} · {telephone}
        </div>
      </div>
      <div className="actions" style={{ marginTop: 10 }}>
        <a className="btn" href={`tel:${String(telephone).replace(/\s/g, '')}`} style={{ padding: '10px 14px', fontSize: 14 }}>
          📞 Appeler
        </a>
        <a className="btn btn-quiet" href={`https://wa.me/${international(telephone)}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" style={{ padding: '10px 14px', fontSize: 14 }}>
          WhatsApp
        </a>
      </div>
    </div>
  )
}

// Logo (photo) de l'etablissement, ou son initiale
export function LogoEcole({ id, nom, taille = 46 }) {
  const [ok, setOk] = useState(true)
  return (
    <span className="ordre-logo" style={{ width: taille, height: taille }}>
      {ok ? (
        <img src={`${API}/api/actualites/ecoles/${id}/photo`} alt="" onError={() => setOk(false)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        (nom || '?')[0]
      )}
    </span>
  )
}

// Etapes de l'ordre : cree -> paye -> confirme
function Etapes({ statut }) {
  const n = { a_payer: 1, paye: 2, litige: 2, confirme: 3 }[statut] || 0
  const libelles = ['Ordre créé', 'Payé', 'Confirmé']
  return (
    <ol className="etapes-ordre">
      {libelles.map((l, i) => (
        <li key={l} className={i < n ? 'fait' : i === n ? 'courant' : ''} data-litige={statut === 'litige' && i === 1 ? 'oui' : undefined}>
          <span>{i < n ? '✓' : i + 1}</span>
          {statut === 'litige' && i === 1 ? 'Litige' : l}
        </li>
      ))}
    </ol>
  )
}

function CompteARebours({ fin, decalage, onFini }) {
  const [reste, setReste] = useState(0)
  useEffect(() => {
    const tick = () => {
      const r = Math.max(0, new Date(fin).getTime() - (Date.now() + decalage))
      setReste(r)
      if (r === 0) onFini()
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fin, decalage])
  const m = Math.floor(reste / 60000)
  const s = Math.floor((reste % 60000) / 1000)
  return (
    <b style={{ font: '800 26px/1 var(--font-display)', color: reste < 5 * 60000 ? 'var(--danger)' : 'var(--text)' }}>
      {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </b>
  )
}

// Page d'un ordre de paiement « P2P » (parent, etablissement ou arbitrage)
export default function OrdrePaiement({ id }) {
  const d = useApi(`/api/scolarite/ordres/${id}`)
  const [f, setF] = useState({ transaction: '', telephone: '', preuve: null })
  const [msg, setMsg] = useState('')
  const [motif, setMotif] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const fichier = useRef(null)
  // Rafraichissement regulier tant que l'ordre est en cours
  useEffect(() => {
    if (!d.data || !['a_payer', 'paye', 'litige'].includes(d.data.statut)) return
    const t = setInterval(() => d.reload(), 20000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.data?.statut])

  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Chargement…</p>
  const o = d.data
  const [titre, , couleur, fond] = ETATS[o.statut]
  const decalage = new Date(o.maintenant).getTime() - Date.now()

  async function action(fn, confirmation) {
    if (confirmation && !window.confirm(confirmation)) return
    setError('')
    setBusy(true)
    try {
      await fn()
      d.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <>
      <section className="ordre-tete">
        <div className="ordre-marchand">
          <LogoEcole id={o.school_id} nom={o.ecole} />
          <div style={{ minWidth: 0 }}>
            <b>{o.ecole}</b>
            <div className="muted" style={{ fontSize: 13 }}>
              {o.ville ? `${o.ville} · ` : ''}Ordre n° {o.code}
            </div>
          </div>
          <span className="tag" style={{ marginLeft: 'auto', background: fond, color: couleur }}>
            {ETATS[o.statut][1]}
          </span>
        </div>
        <Etapes statut={o.statut} />
        <div className="ordre-montant">
          <span className="muted">Montant</span>
          <b>{fcfa(o.montant)}</b>
          <span className="muted" style={{ fontSize: 14 }}>
            {o.frais} · {o.first_name} {o.last_name}
            {o.classe ? ` (${o.classe})` : ''}
          </span>
        </div>
        {o.statut === 'a_payer' ? (
          <div className="ordre-chrono">
            <span>Temps restant pour payer</span>
            <CompteARebours fin={o.expire_le} decalage={decalage} onFini={() => d.reload()} />
          </div>
        ) : (
          <p className="ordre-etat" style={{ color: couleur }}>
            {titre}
          </p>
        )}
        <p className="muted" style={{ fontSize: 12, textAlign: 'center' }}>
          Créé {heure(o.created_at)}
          {o.paye_le ? ` · payé ${heure(o.paye_le)}` : ''}
          {o.confirme_le ? ` · confirmé ${heure(o.confirme_le)}` : ''}
        </p>
      </section>

      {/* ------------------------------ le parent doit payer */}
      {o.statut === 'a_payer' && o.monRole === 'payeur' && (
        <>
          <div className="card">
            <b>1. Envoyez exactement ce montant</b>
            {[
              ['Opérateur', o.operateur, null],
              ['Numéro de l’établissement', o.numero_destinataire, o.numero_destinataire],
              ['Montant exact', fcfa(o.montant), o.montant],
              ['Motif à indiquer', o.code, o.code],
            ].map(([k, v, c]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--line)' }}>
                <span className="muted" style={{ fontSize: 14 }}>{k}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <b>{v}</b>
                  {c !== null && <Copier valeur={c} />}
                </span>
              </div>
            ))}
            {o.consignes && <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>{o.consignes}</p>}
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              ⚠️ Vous avez {o.delaiMinutes} minutes pour payer et signaler le paiement. Passé ce délai, l’ordre expire.
            </p>
          </div>
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault()
              action(() => api.post(`/api/scolarite/ordres/${o.id}/payer`, f))
            }}
          >
            <b>2. Après le paiement, signalez-le</b>
            <Field label="ID de la transaction (dans le SMS de confirmation)">
              <input className="input" placeholder="ex. MP261103.1452.A12345" value={f.transaction} onChange={(e) => setF({ ...f, transaction: e.target.value })} required />
            </Field>
            <Field label="Numéro utilisé pour payer">
              <input className="input" type="tel" placeholder="6 XX XX XX XX" value={f.telephone} onChange={(e) => setF({ ...f, telephone: e.target.value })} />
            </Field>
            <input
              ref={fichier}
              type="file"
              hidden
              accept="image/*"
              onChange={async (e) => {
                const x = e.target.files?.[0]
                e.target.value = ''
                if (x) setF({ ...f, preuve: await reduire(x) })
              }}
            />
            <button type="button" className="btn btn-quiet btn-block" onClick={() => fichier.current?.click()}>
              {f.preuve ? '✓ Capture ajoutée (changer)' : '📷 Ajouter la capture du SMS (facultatif)'}
            </button>
            {f.preuve && <img src={f.preuve} alt="" style={{ display: 'block', maxWidth: '100%', maxHeight: 220, borderRadius: 12, marginTop: 8 }} />}
            <Note>{error}</Note>
            <div className="actions" style={{ marginTop: 10 }}>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? 'Envoi…' : '✓ J’ai payé'}
              </button>
              <button type="button" className="btn btn-quiet btn-danger" disabled={busy} onClick={() => action(() => api.post(`/api/scolarite/ordres/${o.id}/annuler`), 'Annuler cet ordre ? Ne l’annulez pas si vous avez déjà envoyé l’argent.')}>
                Annuler l’ordre
              </button>
            </div>
          </form>
        </>
      )}

      {/* ------------------------------ details du paiement signale */}
      {['paye', 'litige', 'confirme'].includes(o.statut) && (
        <div className="card">
          <b>Paiement signalé</b>
          <p style={{ fontSize: 14, marginTop: 6 }}>
            {o.operateur} vers le <b>{o.numero_destinataire}</b> · transaction <b>{o.transaction}</b>
            {o.telephone_payeur ? ` · depuis le ${o.telephone_payeur}` : ''}
            {o.parent_nom ? ` · par ${o.parent_prenom} ${o.parent_nom}` : ''}
          </p>
          {o.preuve && <img src={o.preuve} alt="Capture du paiement" style={{ display: 'block', maxWidth: '100%', maxHeight: 360, borderRadius: 12, marginTop: 8 }} />}
          {o.motif && o.statut === 'litige' && (
            <p style={{ color: 'var(--danger)', marginTop: 8 }}>
              <b>Litige :</b> {o.motif}
            </p>
          )}
          {o.statut === 'confirme' && o.paiement_id && (
            <a className="btn btn-block" style={{ marginTop: 10 }} href={`#/recus/${o.paiement_id}`}>
              Voir le reçu
            </a>
          )}
        </div>
      )}

      {/* ------------------------------ actions de l'etablissement */}
      {o.monRole === 'etablissement' && ['paye', 'litige'].includes(o.statut) && (
        <div className="card">
          <b>Avez-vous reçu {fcfa(o.montant)} ?</b>
          <p className="muted" style={{ fontSize: 14, margin: '4px 0 10px' }}>
            Vérifiez sur votre compte {o.operateur} ({o.numero_destinataire}) la transaction <b>{o.transaction}</b>, avec le motif <b>{o.code}</b>.
          </p>
          <Note>{error}</Note>
          <button
            type="button"
            className="btn btn-block"
            disabled={busy}
            onClick={() => action(() => api.post(`/api/scolarite/ordres/${o.id}/confirmer`), `Confirmez-vous avoir bien reçu ${fcfa(o.montant)} sur votre compte ? Cette action émet le reçu et ne peut pas être annulée.`)}
          >
            ✓ Confirmer la réception
          </button>
          {o.statut === 'paye' && (
            <>
              <input className="input" placeholder="Motif (ex. aucun transfert reçu à ce nom)" value={motif} onChange={(e) => setMotif(e.target.value)} style={{ marginTop: 10 }} />
              <button type="button" className="btn btn-quiet btn-danger btn-block" style={{ marginTop: 8 }} disabled={busy} onClick={() => action(() => api.post(`/api/scolarite/ordres/${o.id}/litige`, { motif }), 'Ouvrir un litige sur ce paiement ?')}>
                Je n’ai rien reçu : ouvrir un litige
              </button>
            </>
          )}
        </div>
      )}

      {/* ------------------------------ le parent peut contester apres 24 h */}
      {o.monRole === 'payeur' && o.statut === 'paye' && Date.now() + decalage - new Date(o.paye_le).getTime() > 24 * 3600 * 1000 && (
        <div className="card">
          <b>Toujours pas confirmé ?</b>
          <p className="muted" style={{ fontSize: 14, margin: '4px 0 10px' }}>Écrivez d’abord à l’établissement ci-dessous. Sans réponse, ouvrez un litige : School tranchera.</p>
          <button type="button" className="btn btn-quiet btn-danger btn-block" disabled={busy} onClick={() => action(() => api.post(`/api/scolarite/ordres/${o.id}/litige`, { motif: 'Paiement non confirmé après 24 heures' }), 'Ouvrir un litige ?')}>
            Ouvrir un litige
          </button>
        </div>
      )}

      {/* ------------------------------ arbitrage par la plateforme */}
      {o.monRole === 'arbitre' && o.statut === 'litige' && (
        <div className="card" style={{ borderColor: 'var(--danger)' }}>
          <b>Arbitrage</b>
          <input className="input" placeholder="Motif de la décision" value={motif} onChange={(e) => setMotif(e.target.value)} style={{ margin: '10px 0' }} />
          <Note>{error}</Note>
          <div className="actions">
            <button type="button" className="btn" disabled={busy} onClick={() => action(() => api.post(`/api/scolarite/ordres/${o.id}/arbitrer`, { decision: 'confirmer', motif }), 'Valider ce paiement (le reçu sera émis) ?')}>
              Valider le paiement
            </button>
            <button type="button" className="btn btn-quiet btn-danger" disabled={busy} onClick={() => action(() => api.post(`/api/scolarite/ordres/${o.id}/arbitrer`, { decision: 'annuler', motif }), 'Annuler cet ordre ?')}>
              Annuler l’ordre
            </button>
          </div>
        </div>
      )}

      {['payeur', 'arbitre'].includes(o.monRole) && (
        <Contact
          titre="Joindre l’établissement"
          nom={o.ecole}
          telephone={o.telephone_ecole}
          message={`Bonjour, je vous contacte au sujet du paiement School ${o.code} de ${fcfa(o.montant)} (${o.frais}, ${o.first_name} ${o.last_name}).`}
        />
      )}
      {['etablissement', 'arbitre'].includes(o.monRole) && o.parent_tel && (
        <Contact
          titre="Joindre le payeur"
          nom={`${o.parent_prenom || ''} ${o.parent_nom || ''}`.trim()}
          telephone={o.parent_tel}
          message={`Bonjour, ${o.ecole} vous contacte au sujet du paiement School ${o.code} de ${fcfa(o.montant)}.`}
        />
      )}

      {/* ------------------------------ discussion */}
      <h2 className="section-title">Discussion</h2>
      <ul className="rows">
        {o.messages.map((m) => (
          <li key={m.id} className="row" style={{ alignItems: 'flex-start' }}>
            <div className="row-main">
              <div className="row-sub" style={{ fontSize: 12 }}>
                {m.role === 'systeme' ? 'School' : m.role === 'etablissement' ? 'Établissement' : m.role === 'arbitre' ? 'Arbitrage School' : `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Parent'} ·{' '}
                {heure(m.created_at)}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontStyle: m.role === 'systeme' ? 'italic' : 'normal', color: m.role === 'systeme' ? 'var(--muted)' : undefined }}>{m.texte}</div>
            </div>
          </li>
        ))}
      </ul>
      {!['annule', 'expire'].includes(o.statut) && (
        <form
          className="card"
          style={{ marginTop: 10 }}
          onSubmit={(e) => {
            e.preventDefault()
            if (!msg.trim()) return
            action(async () => {
              await api.post(`/api/scolarite/ordres/${o.id}/messages`, { texte: msg })
              setMsg('')
            })
          }}
        >
          <textarea className="input" placeholder="Écrire un message…" value={msg} onChange={(e) => setMsg(e.target.value)} style={{ minHeight: 60 }} />
          <button className="btn btn-quiet btn-block" type="submit" disabled={busy} style={{ marginTop: 8 }}>
            Envoyer
          </button>
        </form>
      )}
    </>
  )
}

// Liste d'ordres (parent : en cours ; etablissement : a confirmer ; plateforme : litiges)
export function ListeOrdres({ statut, vide }) {
  const d = useApi(`/api/scolarite/ordres${statut ? `?statut=${statut}` : ''}`)
  if (!d.data) return <p className="muted">Chargement…</p>
  if (!d.data.length) return vide ? <p className="muted">{vide}</p> : null
  return (
    <ul className="rows">
      {d.data.map((o) => {
        const [, court, couleur, fond] = ETATS[o.statut]
        return (
          <li className="row" key={o.id}>
            <a className="row-main" href={`#/ordres/${o.id}`} style={{ color: 'inherit' }}>
              <div className="row-title">
                {fcfa(o.montant)} · {o.first_name} {o.last_name}
              </div>
              <div className="row-sub">
                {o.frais} · {o.classe || '—'} · {o.code} · {heure(o.paye_le || o.created_at)}
                {o.ecole && statut === 'litige' ? ` · ${o.ecole}` : ''}
              </div>
            </a>
            <span className="tag" style={{ background: fond, color: couleur }}>
              {court}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
