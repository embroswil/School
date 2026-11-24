import { useEffect, useState } from 'react'
import { api, apiBase } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'

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

// Tuile a toucher pour copier (numero, montant, motif)
function TuileCopie({ libelle, valeur, affiche, large }) {
  const [fait, setFait] = useState(false)
  return (
    <button
      type="button"
      className={`op-tuile${large ? ' large' : ''}${fait ? ' copie' : ''}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(String(valeur))
          setFait(true)
          setTimeout(() => setFait(false), 1500)
        } catch (_) {}
      }}
    >
      <small>{libelle}</small>
      <b data-brut>{affiche || valeur}</b>
      <em>{fait ? 'Copié' : 'Copier'}</em>
    </button>
  )
}

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
      {fait ? 'Copié' : children || 'Copier'}
    </button>
  )
}

// Numero au format international pour WhatsApp (Cameroun par defaut)
const international = (t) => {
  const c = String(t || '').replace(/\D/g, '')
  return c.length === 9 ? `237${c}` : c
}

// Contact direct avec l'autre partie : une ligne, appel et WhatsApp
function Contact({ nom, telephone, message }) {
  if (!telephone) return null
  return (
    <div className="op-contact" aria-label={`Joindre ${nom}`}>
      <a href={`tel:${String(telephone).replace(/\s/g, '')}`}>Appeler</a>
      <a href={`https://wa.me/${international(telephone)}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
        WhatsApp
      </a>
    </div>
  )
}

// Logo (photo) de l'etablissement, ou son initiale
export function LogoEcole({ id, nom, taille = 46 }) {
  const [ok, setOk] = useState(true)
  return (
    <span className="ordre-logo" style={{ width: taille, height: taille }}>
      {ok ? (
        <img src={`${apiBase()}/api/actualites/ecoles/${id}/photo`} alt="" onError={() => setOk(false)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        (nom || '?')[0]
      )}
    </span>
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
  const [msg, setMsg] = useState('')
  const [motif, setMotif] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
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
  // ce que le parent envoie : scolarite + frais de retrait + frais de service
  const aEnvoyer = Number(o.montant || 0) + Number(o.frais_retrait || 0) + Number(o.frais_service || 0)
  const motifTransfert = o.commande_id ? 'Boutique' : o.frais // motif du transfert : le nom du frais seulement
  const [titre, , couleur, fond] = ETATS[o.statut] || ETATS.annule
  // arrondi a la seconde : la valeur reste stable d'un affichage a l'autre
  const decalage = Math.round((new Date(o.maintenant).getTime() - Date.now()) / 1000) * 1000

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

  const enAttente = o.statut === 'a_payer' && o.monRole === 'payeur'
  const tuile = (k, v, large) => (
    <div className={`op-tuile fixe${large ? ' large' : ''}`} key={k}>
      <small>{k}</small>
      <b data-brut>{v}</b>
    </div>
  )
  return (
    <div className="op-page">
      {/* ------------------------------ en-tete : etablissement, etat, montant */}
      <section className="op-tete">
        <div className="op-ecole">
          <LogoEcole id={o.school_id} nom={o.ecole} taille={36} />
          <div>
            <b data-brut>{o.ecole}</b>
            <small data-brut>{`${o.frais} · ${o.first_name} ${o.last_name}`}</small>
          </div>
          {o.statut === 'a_payer' ? (
            <span className="op-chrono">
              <CompteARebours fin={o.expire_le} decalage={decalage} onFini={() => d.reload()} />
            </span>
          ) : (
            <span className="tag" style={{ background: fond, color: couleur }}>
              {(ETATS[o.statut] || ETATS.annule)[1]}
            </span>
          )}
        </div>
        <div className="op-montant">
          <b data-brut>{fcfa(aEnvoyer)}</b>
          {(o.frais_retrait > 0 || o.frais_service > 0) && (
            <small>{`dont ${fcfa(Number(o.frais_retrait || 0) + Number(o.frais_service || 0))} de frais`}</small>
          )}
        </div>
        {!enAttente && <p className="op-etat" style={{ color: couleur }}>{titre}</p>}
      </section>

      {/* ------------------------------ le parent paie : numero, montant, motif, puis « J'ai paye » */}
      {enAttente && (
        <section className="op-carte">
          <p className="op-titre">{`Envoyez par ${o.operateur}`}</p>
          <div className="op-tuiles">
            <TuileCopie libelle="Numéro" valeur={o.numero_destinataire} large />
            <TuileCopie libelle="Montant" valeur={String(aEnvoyer)} affiche={fcfa(aEnvoyer)} />
            <TuileCopie libelle="Motif" valeur={motifTransfert} />
          </div>
          <Note>{error}</Note>
          <button type="button" className="btn btn-block op-paye" disabled={busy} onClick={() => action(() => api.post(`/api/scolarite/ordres/${o.id}/payer`, {}))}>
            {busy ? 'Envoi…' : 'J’ai payé'}
          </button>
          <button type="button" className="op-annuler" disabled={busy} onClick={() => action(() => api.post(`/api/scolarite/ordres/${o.id}/annuler`), 'Annuler ce paiement ? Ne l’annulez pas si vous avez déjà envoyé l’argent.')}>
            Annuler
          </button>
        </section>
      )}

      {/* ------------------------------ paiement signale */}
      {['paye', 'litige', 'confirme'].includes(o.statut) && (
        <section className="op-carte">
          <div className="op-tuiles">
            {tuile(`Envoyé par ${o.operateur}`, o.numero_destinataire, true)}
            {tuile('Motif', motifTransfert)}
            {o.monRole !== 'payeur' && o.parent_nom ? tuile('Payeur', `${o.parent_prenom || ''} ${o.parent_nom}`.trim()) : tuile('Montant', fcfa(aEnvoyer))}
            {o.transaction && tuile('Transaction', o.transaction, true)}
          </div>
          {o.preuve && <img src={o.preuve} alt="Capture du paiement" className="op-preuve" />}
          {o.motif && o.statut === 'litige' && <p className="op-litige">{`Litige : ${o.motif}`}</p>}
          {o.commande_id && (
            <a className="btn btn-block" style={{ marginTop: 10 }} href={`#/boutique/commandes/${o.commande_id}`}>
              Voir la commande
            </a>
          )}
          {o.statut === 'confirme' && o.paiement_id && (
            <a className="btn btn-block" style={{ marginTop: 10 }} href={`#/recus/${o.paiement_id}`}>
              Voir le reçu
            </a>
          )}
        </section>
      )}

      {/* ------------------------------ l'etablissement confirme */}
      {o.monRole === 'etablissement' && ['paye', 'litige'].includes(o.statut) && (
        <section className="op-carte">
          <p className="op-titre">{`Avez-vous reçu ${fcfa(aEnvoyer)} avec le motif ${motifTransfert} ?`}</p>
          <Note>{error}</Note>
          <button
            type="button"
            className="btn btn-block"
            disabled={busy}
            onClick={() => action(() => api.post(`/api/scolarite/ordres/${o.id}/confirmer`), `Confirmez-vous avoir bien reçu ${fcfa(aEnvoyer)} sur votre compte ? ${o.commande_id ? 'La commande passera en préparation' : 'Cette action émet le reçu'} et ne peut pas être annulée.`)}
          >
            Confirmer la réception
          </button>
          {o.statut === 'paye' && (
            <>
              <input className="input" placeholder="Motif du litige (ex. rien reçu)" value={motif} onChange={(e) => setMotif(e.target.value)} style={{ marginTop: 10 }} />
              <button type="button" className="op-annuler" disabled={busy} onClick={() => action(() => api.post(`/api/scolarite/ordres/${o.id}/litige`, { motif }), 'Ouvrir un litige sur ce paiement ?')}>
                Je n’ai rien reçu : ouvrir un litige
              </button>
            </>
          )}
        </section>
      )}

      {/* ------------------------------ le parent peut contester apres 24 h */}
      {o.monRole === 'payeur' && o.statut === 'paye' && Date.now() + decalage - new Date(o.paye_le).getTime() > 24 * 3600 * 1000 && (
        <button type="button" className="op-annuler" disabled={busy} onClick={() => action(() => api.post(`/api/scolarite/ordres/${o.id}/litige`, { motif: 'Paiement non confirmé après 24 heures' }), 'Toujours pas confirmé après 24 heures : ouvrir un litige ? Sùkûl tranchera.')}>
          Toujours pas confirmé : ouvrir un litige
        </button>
      )}

      {/* ------------------------------ arbitrage par la plateforme */}
      {o.monRole === 'arbitre' && o.statut === 'litige' && (
        <section className="op-carte">
          <p className="op-titre">Arbitrage</p>
          <input className="input" placeholder="Motif de la décision" value={motif} onChange={(e) => setMotif(e.target.value)} style={{ margin: '6px 0 10px' }} />
          <Note>{error}</Note>
          <div className="actions">
            <button type="button" className="btn" disabled={busy} onClick={() => action(() => api.post(`/api/scolarite/ordres/${o.id}/arbitrer`, { decision: 'confirmer', motif }), 'Valider ce paiement (le reçu sera émis) ?')}>
              Valider le paiement
            </button>
            <button type="button" className="btn btn-quiet btn-danger" disabled={busy} onClick={() => action(() => api.post(`/api/scolarite/ordres/${o.id}/arbitrer`, { decision: 'annuler', motif }), 'Annuler cet ordre ?')}>
              Annuler l’ordre
            </button>
          </div>
        </section>
      )}

      {/* ------------------------------ commande de la boutique : paiement expire ou annule, on y retourne */}
      {o.commande_id && ['annule', 'expire'].includes(o.statut) && (
        <a className="btn btn-block" href={`#/boutique/commandes/${o.commande_id}`}>
          Retour à la commande
        </a>
      )}

      {/* ------------------------------ contact et discussion, en une ligne chacun */}
      {['payeur', 'arbitre'].includes(o.monRole) && (
        <Contact nom={o.ecole} telephone={o.telephone_ecole} message={`Bonjour, je vous contacte au sujet du paiement Sùkûl ${o.code} de ${fcfa(aEnvoyer)} (${o.frais}, ${o.first_name} ${o.last_name}).`} />
      )}
      {['etablissement', 'arbitre'].includes(o.monRole) && o.parent_tel && (
        <Contact nom={`${o.parent_prenom || ''} ${o.parent_nom || ''}`.trim()} telephone={o.parent_tel} message={`Bonjour, ${o.ecole} vous contacte au sujet du paiement Sùkûl ${o.code} de ${fcfa(aEnvoyer)}.`} />
      )}
      <Discussion o={o} msg={msg} setMsg={setMsg} busy={busy} envoyer={(t) => action(() => api.post(`/api/scolarite/ordres/${o.id}/messages`, { texte: t }).then(() => setMsg('')))} />
    </div>
  )
}

// Discussion de l'ordre : repliee (une ligne), les messages ecrits (hors messages automatiques) s'ouvrent au toucher
function Discussion({ o, msg, setMsg, busy, envoyer }) {
  const [ouverte, setOuverte] = useState(false)
  const ecrits = o.messages.filter((m) => m.role !== 'systeme')
  const ouvert = !['annule', 'expire'].includes(o.statut)
  if (!ecrits.length && !ouvert) return null
  return (
    <section className="op-discussion">
      <button type="button" className="op-discussion-tete" aria-expanded={ouverte} onClick={() => setOuverte(!ouverte)}>
        <span>Discussion</span>
        <small>{ecrits.length ? `${ecrits.length} message${ecrits.length > 1 ? 's' : ''}` : 'Aucun message'}</small>
      </button>
      {ouverte && (
        <>
          {ecrits.map((m) => (
            <p key={m.id} className={`op-msg ${m.role === 'etablissement' ? 'ecole' : ''}`}>
              <small>{`${m.role === 'etablissement' ? 'Établissement' : m.role === 'arbitre' ? 'Sùkûl' : `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Parent'} · ${heure(m.created_at)}`}</small>
              {m.texte}
            </p>
          ))}
          {ouvert && (
            <form
              className="ig-saisie op-saisie"
              onSubmit={(e) => {
                e.preventDefault()
                if (msg.trim()) envoyer(msg)
              }}
            >
              <textarea rows={1} placeholder="Message…" value={msg} onChange={(e) => setMsg(e.target.value)} />
              <button type="submit" disabled={busy || !msg.trim()}>
                Envoyer
              </button>
            </form>
          )}
        </>
      )}
    </section>
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
        const [, court, couleur, fond] = ETATS[o.statut] || ETATS.annule
        return (
          <li className="row" key={o.id}>
            <a className="row-main" href={`#/ordres/${o.id}`} style={{ color: 'inherit' }}>
              <div className="row-title">
                {fcfa(Number(o.montant || 0) + Number(o.frais_retrait || 0) + Number(o.frais_service || 0))} · {o.first_name} {o.last_name}
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
