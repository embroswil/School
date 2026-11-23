// Boutique, cote etablissement : commandes a preparer, articles et listes par niveau
import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'
import { CATEGORIES, ListeCommandes, fcfa } from './Boutique.jsx'

const FILTRES = [
  ['payee', 'À préparer'],
  ['prete', 'Prêtes'],
  ['a_payer', 'À payer'],
  ['remise', 'Remises'],
]

export default function BoutiqueGestion() {
  const d = useApi('/api/boutique/gestion')
  const [onglet, setOnglet] = useState('commandes')
  const [busy, setBusy] = useState(false)
  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Chargement…</p>
  const { ouverte, articles, kits, commandes } = d.data
  const aPreparer = commandes.filter((c) => c.statut === 'payee').length

  async function basculer() {
    setBusy(true)
    try {
      await api.put('/api/boutique/gestion/ouverte', { ouverte: !ouverte })
      d.reload()
    } catch (_) {}
    setBusy(false)
  }

  return (
    <div className="bq-page">
      <h1 className="page-title">Boutique</h1>
      <div className="bq-ouverture">
        <div>
          <b>{ouverte ? 'Ouverte aux parents' : 'Fermée'}</b>
          <small>{ouverte ? 'Les parents commandent depuis leur espace' : 'Les parents ne voient pas encore la boutique'}</small>
        </div>
        <button type="button" className={`btn bq-petit ${ouverte ? 'btn-quiet' : ''}`} disabled={busy} onClick={basculer}>
          {ouverte ? 'Fermer' : 'Ouvrir'}
        </button>
      </div>
      <div className="segments" role="tablist">
        {[
          ['commandes', 'Commandes'],
          ['articles', 'Articles'],
          ['listes', 'Listes'],
        ].map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={onglet === k} onClick={() => setOnglet(k)}>
            {t}
            {k === 'commandes' && aPreparer > 0 && <span className="segment-nb">{aPreparer}</span>}
          </button>
        ))}
      </div>
      {onglet === 'commandes' && <Commandes commandes={commandes} />}
      {onglet === 'articles' && <Articles articles={articles} onChange={() => d.reload()} />}
      {onglet === 'listes' && <Listes kits={kits} articles={articles} onChange={() => d.reload()} />}
    </div>
  )
}

// ---------------------------------------------------------------- commandes

function Commandes({ commandes }) {
  const [filtre, setFiltre] = useState('payee')
  const liste = commandes.filter((c) => c.statut === filtre)
  return (
    <>
      <div className="chips">
        {FILTRES.map(([k, t]) => {
          const n = commandes.filter((c) => c.statut === k).length
          return (
            <button key={k} type="button" className="chip" aria-pressed={filtre === k} onClick={() => setFiltre(k)}>
              {n ? `${t} · ${n}` : t}
            </button>
          )
        })}
      </div>
      {liste.length ? <ListeCommandes commandes={liste} ecole /> : <p className="muted">Aucune commande.</p>}
    </>
  )
}

// ---------------------------------------------------------------- articles

const VIDE = { categorie: 'fournitures', nom: '', description: '', prix: '', tailles: '', niveaux: '', actif: true }

function Articles({ articles, onChange }) {
  const [edition, setEdition] = useState(null)
  return (
    <>
      <button type="button" className="btn btn-block" style={{ marginBottom: 14 }} onClick={() => setEdition({ ...VIDE })}>
        Ajouter un article
      </button>
      {CATEGORIES.filter(([c]) => articles.some((a) => a.categorie === c)).map(([c, t]) => (
        <div key={c}>
          <h2 className="section-title">{t}</h2>
          <ul className="rows" style={{ marginBottom: 14 }}>
            {articles
              .filter((a) => a.categorie === c)
              .map((a) => (
                <li className="row" key={a.id}>
                  <button
                    type="button"
                    className="row-main bq-row-bouton"
                    onClick={() => setEdition({ ...a, tailles: a.tailles.join(', '), niveaux: a.niveaux.join(', '), description: a.description || '' })}
                  >
                    <div className="row-title" data-brut>{a.nom}</div>
                    <div className="row-sub" data-brut>
                      {[a.niveaux.length ? a.niveaux.join(', ') : 'Toutes les classes', a.tailles.length ? `${a.tailles.length} tailles` : ''].filter(Boolean).join(' · ')}
                    </div>
                  </button>
                  <span className="bq-prix-fixe" data-brut>
                    {fcfa(a.prix)}
                  </span>
                  {!a.actif && <span className="tag">Masqué</span>}
                </li>
              ))}
          </ul>
        </div>
      ))}
      {edition && <FormArticle valeur={edition} onFermer={() => setEdition(null)} onChange={onChange} />}
    </>
  )
}

function FormArticle({ valeur, onFermer, onChange }) {
  const [a, setA] = useState(valeur)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const maj = (k) => (e) => setA({ ...a, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  async function envoyer(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const corps = { ...a, prix: Number(String(a.prix).replace(/\s/g, '')) }
      if (a.id) await api.put(`/api/boutique/gestion/articles/${a.id}`, corps)
      else await api.post('/api/boutique/gestion/articles', corps)
      onChange()
      onFermer()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  async function supprimer() {
    if (!window.confirm('Supprimer cet article ? Les commandes passées le gardent.')) return
    setBusy(true)
    try {
      await api.delete(`/api/boutique/gestion/articles/${a.id}`)
      onChange()
      onFermer()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="voile" onClick={onFermer}>
      <form className="feuille bq-feuille" onClick={(e) => e.stopPropagation()} onSubmit={envoyer}>
        <div className="feuille-poignee" />
        <p className="feuille-titre">{a.id ? 'Modifier l’article' : 'Nouvel article'}</p>
        <div className="grid2">
          <Field label="Catégorie">
            <select className="input" value={a.categorie} onChange={maj('categorie')}>
              {CATEGORIES.map(([c, t]) => (
                <option key={c} value={c}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prix (FCFA)">
            <input className="input" inputMode="numeric" value={a.prix} onChange={maj('prix')} required />
          </Field>
        </div>
        <Field label="Nom">
          <input className="input" value={a.nom} onChange={maj('nom')} maxLength={120} required />
        </Field>
        <Field label="Détail (facultatif)">
          <input className="input" value={a.description} onChange={maj('description')} maxLength={300} />
        </Field>
        <Field label="Tailles, séparées par des virgules (vêtements)">
          <input className="input" value={a.tailles} onChange={maj('tailles')} placeholder="S, M, L, XL" />
        </Field>
        <Field label="Classes concernées (vide : toutes)">
          <input className="input" value={a.niveaux} onChange={maj('niveaux')} placeholder="6e, 5e, 2nde C" />
        </Field>
        <label className="bq-case">
          <input type="checkbox" checked={a.actif} onChange={maj('actif')} /> En vente
        </label>
        <Note>{error}</Note>
        <button className="btn btn-block" type="submit" disabled={busy}>
          {busy ? 'Un instant…' : 'Enregistrer'}
        </button>
        {a.id && (
          <button type="button" className="op-annuler" disabled={busy} onClick={supprimer}>
            Supprimer l’article
          </button>
        )}
      </form>
    </div>
  )
}

// ---------------------------------------------------------------- listes (kits)

function Listes({ kits, articles, onChange }) {
  const [edition, setEdition] = useState(null)
  const prix = new Map(articles.map((a) => [a.id, a.prix]))
  return (
    <>
      <button type="button" className="btn btn-block" style={{ marginBottom: 14 }} onClick={() => setEdition({ nom: '', description: '', niveaux: '', actif: true, articles: [] })}>
        Ajouter une liste
      </button>
      <ul className="rows">
        {kits.map((k) => {
          const n = k.articles.reduce((s, x) => s + x.quantite, 0)
          const total = k.articles.reduce((s, x) => s + x.quantite * (prix.get(x.articleId) || 0), 0)
          return (
            <li className="row" key={k.id}>
              <button type="button" className="row-main bq-row-bouton" onClick={() => setEdition({ ...k, niveaux: k.niveaux.join(', '), description: k.description || '' })}>
                <div className="row-title" data-brut>{k.nom}</div>
                <div className="row-sub" data-brut>{`${k.niveaux.length ? k.niveaux.join(', ') : 'Toutes les classes'} · ${n} articles`}</div>
              </button>
              <span className="bq-prix-fixe" data-brut>
                {fcfa(total)}
              </span>
              {!k.actif && <span className="tag">Masquée</span>}
            </li>
          )
        })}
      </ul>
      {edition && <FormListe valeur={edition} articles={articles} onFermer={() => setEdition(null)} onChange={onChange} />}
    </>
  )
}

function FormListe({ valeur, articles, onFermer, onChange }) {
  const [k, setK] = useState(valeur)
  const [qte, setQte] = useState(() => Object.fromEntries(valeur.articles.map((x) => [x.articleId, x.quantite])))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const maj = (c) => (e) => setK({ ...k, [c]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const total = articles.reduce((s, a) => s + (Number(qte[a.id]) || 0) * a.prix, 0)
  // les articles deja dans la liste d'abord, puis les autres
  const [ordre] = useState(() => [...articles].sort((x, y) => (valeur.articles.some((i) => i.articleId === y.id) ? 1 : 0) - (valeur.articles.some((i) => i.articleId === x.id) ? 1 : 0)))

  async function envoyer(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const corps = {
        ...k,
        articles: Object.entries(qte)
          .filter(([, q]) => Number(q) > 0)
          .map(([id, q]) => ({ articleId: Number(id), quantite: Number(q) })),
      }
      if (k.id) await api.put(`/api/boutique/gestion/kits/${k.id}`, corps)
      else await api.post('/api/boutique/gestion/kits', corps)
      onChange()
      onFermer()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  async function supprimer() {
    if (!window.confirm('Supprimer cette liste ?')) return
    setBusy(true)
    try {
      await api.delete(`/api/boutique/gestion/kits/${k.id}`)
      onChange()
      onFermer()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="voile" onClick={onFermer}>
      <form className="feuille bq-feuille" onClick={(e) => e.stopPropagation()} onSubmit={envoyer}>
        <div className="feuille-poignee" />
        <p className="feuille-titre">{k.id ? 'Modifier la liste' : 'Nouvelle liste'}</p>
        <Field label="Nom">
          <input className="input" value={k.nom} onChange={maj('nom')} maxLength={120} required placeholder="Liste de fournitures 6e" />
        </Field>
        <Field label="Classes concernées (vide : toutes)">
          <input className="input" value={k.niveaux} onChange={maj('niveaux')} placeholder="6e, 5e" />
        </Field>
        <p className="bq-sous-titre">{`Articles · ${fcfa(total)}`}</p>
        <ul className="bq-choix">
          {ordre.map((a) => (
            <li key={a.id}>
              <span data-brut>
                {a.nom}
                <small>{fcfa(a.prix)}</small>
              </span>
              <input
                className="input"
                inputMode="numeric"
                value={qte[a.id] || ''}
                placeholder="0"
                onChange={(e) => setQte({ ...qte, [a.id]: e.target.value.replace(/\D/g, '').slice(0, 2) })}
                aria-label={`Quantité ${a.nom}`}
              />
            </li>
          ))}
        </ul>
        <label className="bq-case">
          <input type="checkbox" checked={k.actif} onChange={maj('actif')} /> Visible par les parents
        </label>
        <Note>{error}</Note>
        <button className="btn btn-block" type="submit" disabled={busy}>
          {busy ? 'Un instant…' : 'Enregistrer'}
        </button>
        {k.id && (
          <button type="button" className="op-annuler" disabled={busy} onClick={supprimer}>
            Supprimer la liste
          </button>
        )}
      </form>
    </div>
  )
}
