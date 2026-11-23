// Une commande de la boutique : articles, etat, paiement (parent) ; preparation et remise (etablissement)
import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'
import { EtatCommande, fcfa } from './Boutique.jsx'
import { VisuelArticle } from '../boutique-visuels.jsx'

const ETAPES = [
  ['a_payer', 'Payée'],
  ['payee', 'Préparée'],
  ['prete', 'Remise'],
]
const RANG = { a_payer: 0, payee: 1, prete: 2, remise: 3 }
const date = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')

export default function CommandeBoutique({ id }) {
  const d = useApi(`/api/boutique/commandes/${id}`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [moyen, setMoyen] = useState('')
  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Chargement…</p>
  const c = d.data
  const parent = c.monRole === 'parent'
  const op = moyen || (c.orange ? 'orange_money' : 'mtn_momo')
  const nb = c.lignes.reduce((s, l) => s + l.quantite, 0)

  async function action(fn, confirmation, suite) {
    if (confirmation && !window.confirm(confirmation)) return
    setError('')
    setBusy(true)
    try {
      const r = await fn()
      if (suite) return suite(r)
      d.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <div className="op-page">
      <section className="op-tete">
        <div className="bq-cmd-tete">
          <div>
            <b data-brut>{`Commande n° ${c.id}`}</b>
            <small data-brut>{`${c.prenom} ${c.nom}${c.classe ? ` · ${c.classe}` : ''}`}</small>
          </div>
          <EtatCommande statut={c.statut} />
        </div>
        {c.statut !== 'annulee' && (
          <ol className="bq-etapes">
            {ETAPES.map(([k, t]) => (
              <li key={k} className={RANG[c.statut] > RANG[k] ? 'fait' : ''}>
                {t}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="op-carte">
        <ul className="bq-lignes">
          {c.lignes.map((l) => (
            <li key={l.id}>
              <VisuelArticle article={l} className="mini" />
              <span data-brut>
                {`${l.quantite} × ${l.nom}`}
                {l.taille && <em>{` · ${l.taille}`}</em>}
              </span>
              <b data-brut>{fcfa(l.prix * l.quantite)}</b>
            </li>
          ))}
        </ul>
        <div className="bq-total">
          <span>{`${nb} article(s)`}</span>
          <b data-brut>{fcfa(c.montant)}</b>
        </div>
        {!parent && c.parent_nom && (
          <p className="muted" style={{ marginTop: 8, fontSize: 13 }} data-brut>
            {`Commandé par ${c.parent_prenom || ''} ${c.parent_nom}${c.parent_tel ? ` · ${c.parent_tel}` : ''} le ${date(c.created_at)}`}
          </p>
        )}
      </section>

      <Note>{error}</Note>

      {/* paiement */}
      {c.statut === 'a_payer' &&
        (c.ordre ? (
          <a className="btn btn-block" href={`#/ordres/${c.ordre.id}`}>
            {parent ? (c.ordre.statut === 'a_payer' ? 'Continuer le paiement' : 'Voir le paiement') : 'Voir le paiement'}
          </a>
        ) : parent ? (
          <section className="op-carte">
            <p className="op-titre">Payer la commande</p>
            <div className="chips" style={{ margin: '6px 0 10px' }}>
              {c.orange && (
                <button type="button" className="chip" aria-pressed={op === 'orange_money'} onClick={() => setMoyen('orange_money')}>
                  <img className="moyen-logo petit" src="/paiement/orange-money.png" alt="" /> Orange Money
                </button>
              )}
              {c.mtn && (
                <button type="button" className="chip" aria-pressed={op === 'mtn_momo'} onClick={() => setMoyen('mtn_momo')}>
                  <img className="moyen-logo petit" src="/paiement/mtn-momo.png" alt="" /> MTN MoMo
                </button>
              )}
            </div>
            <button
              type="button"
              className="btn btn-block"
              disabled={busy}
              onClick={() => action(() => api.post(`/api/boutique/commandes/${c.id}/payer`, { moyen: op }), null, (r) => (window.location.hash = `/ordres/${r.data.ordreId}`))}
            >
              Payer
            </button>
          </section>
        ) : (
          <p className="muted">En attente du paiement du parent.</p>
        ))}
      {c.statut === 'a_payer' && (!c.ordre || c.ordre.statut === 'a_payer') && (
        <button type="button" className="op-annuler" disabled={busy} onClick={() => action(() => api.post(`/api/boutique/commandes/${c.id}/annuler`), 'Annuler cette commande ?')}>
          Annuler la commande
        </button>
      )}

      {/* etablissement : preparation puis remise */}
      {!parent && c.statut === 'payee' && (
        <button type="button" className="btn btn-block" disabled={busy} onClick={() => action(() => api.post(`/api/boutique/commandes/${c.id}/etat`, { etat: 'prete' }))}>
          Commande prête : prévenir le parent
        </button>
      )}
      {!parent && ['payee', 'prete'].includes(c.statut) && (
        <button
          type="button"
          className={`btn btn-block ${c.statut === 'payee' ? 'btn-quiet' : ''}`}
          disabled={busy}
          onClick={() => action(() => api.post(`/api/boutique/commandes/${c.id}/etat`, { etat: 'remise' }), 'Confirmer la remise de la commande ?')}
        >
          Commande remise
        </button>
      )}
      {parent && c.statut === 'payee' && <p className="muted">L’établissement prépare la commande. Vous serez prévenu quand elle sera prête.</p>}
      {parent && c.statut === 'prete' && <p className="muted">La commande est prête : elle est à retirer à l’établissement.</p>}
      {['payee', 'prete', 'remise'].includes(c.statut) && c.dernierOrdre && (
        <a className="op-annuler" style={{ color: 'var(--lien)', textAlign: 'center' }} href={`#/ordres/${c.dernierOrdre}`}>
          Voir le paiement
        </a>
      )}
    </div>
  )
}
