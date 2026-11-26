// Boutique, cote etablissement : commandes a preparer, articles et listes par niveau
import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'
import { CATEGORIES, ListeCommandes, fcfa } from './Boutique.jsx'
import { VisuelArticle } from '../boutique-visuels.jsx'
import Recadreur from '../Recadreur.jsx'
import { IcPlus, IcSac } from '../icones.jsx'

// Photo d'article : envoyee au stockage ; s'il n'est pas active, gardee dans l'article (image legere)
async function envoyerPhoto(dataUrl) {
  try {
    const blob = await (await fetch(dataUrl)).blob()
    const s = await api.post('/api/medias/signer', { mime: 'image/jpeg', taille: blob.size })
    const r = await fetch(s.data.envoi, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob })
    if (!r.ok) throw new Error('L’envoi de la photo a échoué. Vérifiez la connexion et réessayez.')
    return s.data.url
  } catch (err) {
    if (/pas encore activé/.test(err.message) && dataUrl.length <= 400000) return dataUrl
    throw err
  }
}

const FILTRES = [
  ['payee', 'À préparer'],
  ['prete', 'Prêtes'],
  ['a_payer', 'À payer'],
  ['remise', 'Remises'],
]

export default function BoutiqueGestion() {
  const d = useApi('/api/boutique/gestion')
  const [onglet, setOnglet] = useState(null)
  const [article, setArticle] = useState(null)
  const [liste, setListe] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Chargement…</p>
  const { ouverte, articles, kits, commandes } = d.data
  const aPreparer = commandes.filter((c) => c.statut === 'payee').length
  const ventes = commandes.filter((c) => ['payee', 'prete', 'remise'].includes(c.statut)).reduce((s, c) => s + c.montant, 0)
  const vue = onglet || (aPreparer ? 'commandes' : 'articles')
  const nouvelArticle = () => setArticle({ ...VIDE })
  const nouvelleListe = () => setListe({ nom: '', description: '', niveaux: '', actif: true, articles: [] })

  async function action(fn) {
    setBusy(true)
    setError('')
    try {
      await fn()
      d.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <div className="bq-page">
      <h1 className="page-title">Boutique</h1>
      <section className="bqg-tete">
        <div className="bqg-etat">
          <span className={`bqg-voyant ${ouverte ? 'on' : ''}`} />
          <div>
            <b>{ouverte ? 'Boutique ouverte' : 'Boutique fermée'}</b>
            <small>{ouverte ? 'Les parents commandent depuis leur espace' : 'Les parents ne la voient pas encore'}</small>
          </div>
          <button type="button" className={`btn bq-petit ${ouverte ? 'btn-quiet' : ''}`} disabled={busy || (!ouverte && !articles.length)} onClick={() => action(() => api.put('/api/boutique/gestion/ouverte', { ouverte: !ouverte }))}>
            {ouverte ? 'Fermer' : 'Ouvrir'}
          </button>
        </div>
        <div className="bqg-chiffres">
          <div>
            <b>{articles.filter((a) => a.actif).length}</b>
            <small>articles en vente</small>
          </div>
          <div>
            <b>{kits.length}</b>
            <small>listes par classe</small>
          </div>
          <div className={aPreparer ? 'alerte' : ''}>
            <b>{aPreparer}</b>
            <small>à préparer</small>
          </div>
          <div>
            <b data-brut>{fcfa(ventes)}</b>
            <small>ventes (60 jours)</small>
          </div>
        </div>
      </section>
      <Note>{error}</Note>

      {!articles.length ? (
        <section className="bqg-demarrage">
          <span className="bqg-demarrage-ico">
            <IcSac size={30} />
          </span>
          <h2>Votre boutique est vide</h2>
          <p>Ajoutez vos tenues et vos fournitures : les parents les commanderont depuis leur espace et paieront par Orange Money ou MTN MoMo.</p>
          <button type="button" className="btn" onClick={nouvelArticle}>
            <IcPlus size={18} /> Ajouter un premier article
          </button>
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => action(() => api.post('/api/boutique/gestion/modele'))}>
            {busy ? 'Un instant…' : 'Utiliser le catalogue type'}
          </button>
          <ol className="bqg-etapes">
            <li>
              <b>Ajoutez vos articles</b>
              <span>Prix, tailles, photo</span>
            </li>
            <li>
              <b>Créez les listes par classe</b>
              <span>Le parent ajoute tout en un geste</span>
            </li>
            <li>
              <b>Ouvrez la boutique</b>
              <span>Les commandes payées arrivent ici</span>
            </li>
          </ol>
        </section>
      ) : (
        <>
          <div className="bqg-actions">
            <button type="button" className="btn" onClick={nouvelArticle}>
              <IcPlus size={18} /> Ajouter un article
            </button>
            <button type="button" className="btn btn-quiet" onClick={nouvelleListe}>
              <IcPlus size={18} /> Créer une liste
            </button>
          </div>
          <div className="segments" role="tablist">
            {[
              ['commandes', 'Commandes', aPreparer],
              ['articles', 'Articles', 0],
              ['listes', 'Listes', 0],
            ].map(([k, t, nb]) => (
              <button key={k} type="button" role="tab" aria-selected={vue === k} onClick={() => setOnglet(k)}>
                {t}
                {nb > 0 && <span className="segment-nb">{nb}</span>}
              </button>
            ))}
          </div>
          {vue === 'commandes' && <Commandes commandes={commandes} />}
          {vue === 'articles' && <Articles articles={articles} onEditer={setArticle} onAjouter={nouvelArticle} />}
          {vue === 'listes' && <Listes kits={kits} articles={articles} onEditer={setListe} />}
        </>
      )}
      {article && <FormArticle valeur={article} onFermer={() => setArticle(null)} onChange={() => d.reload()} />}
      {liste && <FormListe valeur={liste} articles={articles} onFermer={() => setListe(null)} onChange={() => d.reload()} />}
    </div>
  )
}

// ---------------------------------------------------------------- commandes

function Commandes({ commandes }) {
  const [filtre, setFiltre] = useState('payee')
  const liste = commandes.filter((c) => c.statut === filtre)
  return (
    <>
      <div className="segments petit" role="tablist">
        {FILTRES.map(([k, t]) => {
          const n = commandes.filter((c) => c.statut === k).length
          return (
            <button key={k} type="button" role="tab" aria-selected={filtre === k} onClick={() => setFiltre(k)}>
              {t}
              {n > 0 && <span className="segment-nb">{n}</span>}
            </button>
          )
        })}
      </div>
      {liste.length ? (
        <ListeCommandes commandes={liste} ecole />
      ) : (
        <div className="bqg-vide">
          <IcSac size={26} />
          <b>Aucune commande ici</b>
          <small>Les commandes payées par les parents arrivent dans « À préparer », puis passent à « Prêtes » et « Remises ».</small>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------- articles

const VIDE = { categorie: 'fournitures', nom: '', description: '', prix: '', tailles: '', niveaux: '', actif: true, image: null }

function Articles({ articles, onEditer, onAjouter }) {
  return (
    <>
      {CATEGORIES.filter(([c]) => articles.some((a) => a.categorie === c)).map(([c, t], i) => (
        <div key={c}>
          <h2 className="section-title">{t}</h2>
          <div className="bq-gestion-grille">
            {i === 0 && (
              <button type="button" className="bq-gestion-carte bqg-ajout" onClick={onAjouter}>
                <span className="bq-visuel">
                  <IcPlus size={28} />
                </span>
                <b>Ajouter</b>
                <span>un article</span>
              </button>
            )}
            {articles
              .filter((a) => a.categorie === c)
              .map((a) => (
                <button
                  type="button"
                  key={a.id}
                  className={`bq-gestion-carte ${a.actif ? '' : 'masque'}`}
                  onClick={() => onEditer({ ...a, tailles: a.tailles.join(', '), niveaux: a.niveaux.join(', '), description: a.description || '' })}
                >
                  <VisuelArticle article={a} />
                  {!a.actif && <span className="tag">Masqué</span>}
                  <b data-brut>{fcfa(a.prix)}</b>
                  <span data-brut>{a.nom}</span>
                </button>
              ))}
          </div>
        </div>
      ))}
    </>
  )
}

function FormArticle({ valeur, onFermer, onChange }) {
  const [a, setA] = useState(valeur)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [aRecadrer, setARecadrer] = useState(null)
  const maj = (k) => (e) => setA({ ...a, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  async function photo(dataUrl) {
    setARecadrer(null)
    setBusy(true)
    setError('')
    try {
      setA((x) => ({ ...x, image: null }))
      const url = await envoyerPhoto(dataUrl)
      setA((x) => ({ ...x, image: url }))
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

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
        <div className="bq-photo">
          <VisuelArticle article={a} />
          <div>
            <label className="btn btn-quiet bq-petit" style={{ cursor: 'pointer' }}>
              {a.image ? 'Changer la photo' : 'Ajouter une photo'}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) setARecadrer(f)
                }}
              />
            </label>
            {a.image ? (
              <button type="button" className="op-annuler" style={{ padding: 0, textAlign: 'left' }} onClick={() => setA({ ...a, image: null })}>
                Revenir à l’illustration
              </button>
            ) : (
              <small className="muted">Sans photo, une illustration est affichée.</small>
            )}
          </div>
        </div>
        {aRecadrer && <Recadreur fichier={aRecadrer} ratio={1} sortie={700} onValider={photo} onAnnuler={() => setARecadrer(null)} />}
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

function Listes({ kits, articles, onEditer }) {
  const prix = new Map(articles.map((a) => [a.id, a.prix]))
  if (!kits.length)
    return (
      <div className="bqg-vide">
        <IcSac size={26} />
        <b>Aucune liste pour le moment</b>
        <small>Une liste regroupe les fournitures d’une classe : le parent l’ajoute au panier en un geste.</small>
      </div>
    )
  return (
    <>
      <ul className="rows">
        {kits.map((k) => {
          const n = k.articles.reduce((s, x) => s + x.quantite, 0)
          const total = k.articles.reduce((s, x) => s + x.quantite * (prix.get(x.articleId) || 0), 0)
          return (
            <li className="row" key={k.id}>
              <button type="button" className="row-main bq-row-bouton" onClick={() => onEditer({ ...k, niveaux: k.niveaux.join(', '), description: k.description || '' })}>
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
              <VisuelArticle article={a} className="mini" />
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
