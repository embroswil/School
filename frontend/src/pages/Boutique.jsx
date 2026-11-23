// Boutique de l'etablissement, cote parent : listes de la classe, tenues, fournitures,
// panier puis paiement direct au numero de l'etablissement (meme ordre que la scolarite).
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'
import { fraisPaiementDirect } from '../fraisPaiement.js'
import { ApercuEnvoi } from './Scolarite.jsx'

export const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`
export const CATEGORIES = [
  ['tenue', 'Tenue'],
  ['fournitures', 'Fournitures'],
  ['livres', 'Livres'],
  ['autre', 'Autres'],
]
export const ETATS_COMMANDE = {
  a_payer: ['À payer', 'var(--accent-text, #b26a00)', 'rgba(245, 166, 35, 0.16)'],
  payee: ['En préparation', 'var(--lien)', 'rgba(47, 107, 255, 0.14)'],
  prete: ['Prête', 'var(--ok)', 'rgba(22, 163, 74, 0.14)'],
  remise: ['Remise', 'var(--muted)', 'var(--card-2)'],
  annulee: ['Annulée', 'var(--muted)', 'var(--card-2)'],
}
export function EtatCommande({ statut }) {
  const [t, c, f] = ETATS_COMMANDE[statut] || ETATS_COMMANDE.annulee
  return (
    <span className="tag" style={{ color: c, background: f }}>
      {t}
    </span>
  )
}

const lireStock = (cle) => {
  try {
    return JSON.parse(localStorage.getItem(cle) || '{}') || {}
  } catch (_) {
    return {}
  }
}
const ecrireStock = (cle, v) => {
  try {
    if (Object.keys(v).length) localStorage.setItem(cle, JSON.stringify(v))
    else localStorage.removeItem(cle)
  } catch (_) {}
}
const cleLigne = (id, taille) => `${id}|${taille || ''}`

export default function Boutique() {
  const d = useApi('/api/boutique')
  const [choix, setChoix] = useState(() => Number(new URLSearchParams(window.location.hash.split('?')[1] || '').get('eleve')) || null)
  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Chargement…</p>
  const { eleves, commandes } = d.data
  const eleve = eleves.find((e) => e.id === choix) || eleves.find((e) => e.ouverte) || eleves[0]
  const enCours = commandes.filter((c) => c.statut !== 'remise')
  return (
    <div className="bq-page">
      <h1 className="page-title">Boutique</h1>
      {!eleves.length && (
        <div className="card">
          <p>Reliez d’abord votre enfant à votre compte pour commander sa tenue et ses fournitures.</p>
          <a className="btn" href="#/trouver-eleve" style={{ marginTop: 10 }}>
            Trouver mon enfant
          </a>
        </div>
      )}
      {eleves.length > 1 && (
        <div className="chips">
          {eleves.map((e) => (
            <button key={e.id} type="button" className="chip" aria-pressed={e.id === eleve.id} onClick={() => setChoix(e.id)} data-brut>
              {e.prenom}
            </button>
          ))}
        </div>
      )}
      {enCours.length > 0 && (
        <>
          <h2 className="section-title">Mes commandes</h2>
          <ListeCommandes commandes={enCours} />
        </>
      )}
      {eleve && <Catalogue key={eleve.id} id={eleve.id} />}
    </div>
  )
}

export function ListeCommandes({ commandes, ecole }) {
  return (
    <ul className="rows" style={{ marginBottom: 14 }}>
      {commandes.map((c) => (
        <li className="row" key={c.id}>
          <a className="row-main" href={`#/boutique/commandes/${c.id}`} style={{ color: 'inherit' }}>
            <div className="row-title" data-brut>{`N° ${c.id} · ${c.prenom} ${c.nom}`}</div>
            <div className="row-sub" data-brut>
              {`${c.articles} article(s) · ${fcfa(c.montant)}${ecole && c.classe ? ` · ${c.classe}` : ''}`}
            </div>
          </a>
          <EtatCommande statut={c.statut} />
        </li>
      ))}
    </ul>
  )
}

function Catalogue({ id }) {
  const d = useApi(`/api/boutique/eleves/${id}`)
  const cleStock = `sukul-panier-${id}`
  const [panier, setPanier] = useState(() => lireStock(cleStock))
  const [categorie, setCategorie] = useState('')
  const [tailleOuverte, setTailleOuverte] = useState(null)
  const [voirPanier, setVoirPanier] = useState(false)
  useEffect(() => ecrireStock(cleStock, panier), [cleStock, panier])
  const articles = useMemo(() => new Map((d.data?.articles || []).map((a) => [a.id, a])), [d.data])

  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Chargement…</p>
  const { eleve, ouverte, kits, moyens } = d.data
  if (!ouverte)
    return (
      <div className="card">
        <p className="muted" data-brut>{`La boutique de ${eleve.ecole} n’est pas encore ouverte.`}</p>
      </div>
    )

  // le panier ne garde que les articles encore en vente pour cette classe
  const lignes = Object.entries(panier)
    .map(([k, l]) => ({ k, ...l, a: articles.get(l.articleId) }))
    .filter((l) => l.a && l.quantite > 0)
  const nbArticles = lignes.reduce((s, l) => s + l.quantite, 0)
  const total = lignes.reduce((s, l) => s + l.quantite * l.a.prix, 0)
  const presentes = CATEGORIES.filter(([c]) => d.data.articles.some((a) => a.categorie === c))
  const cat = presentes.some(([c]) => c === categorie) ? categorie : presentes[0]?.[0]

  const ajouter = (articleId, taille, n = 1) =>
    setPanier((p) => {
      const k = cleLigne(articleId, taille)
      const q = Math.max(0, Math.min(99, (p[k]?.quantite || 0) + n))
      const suite = { ...p }
      if (q) suite[k] = { articleId, taille: taille || '', quantite: q }
      else delete suite[k]
      return suite
    })
  const ajouterKit = (kit) =>
    setPanier((p) => {
      const suite = { ...p }
      for (const x of kit.articles) {
        const a = articles.get(x.articleId)
        if (!a) continue
        // vetement : la taille se choisit ensuite dans le panier
        const k = cleLigne(a.id, '')
        suite[k] = { articleId: a.id, taille: '', quantite: Math.min(99, (suite[k]?.quantite || 0) + x.quantite) }
      }
      return suite
    })
  const changerTaille = (k, taille) =>
    setPanier((p) => {
      const l = p[k]
      if (!l) return p
      const suite = { ...p }
      delete suite[k]
      const nk = cleLigne(l.articleId, taille)
      suite[nk] = { ...l, taille, quantite: Math.min(99, (suite[nk]?.quantite || 0) + l.quantite) }
      return suite
    })
  const dansPanier = (articleId) => lignes.filter((l) => l.articleId === articleId)

  return (
    <>
      <p className="bq-eleve" data-brut>
        {`${eleve.prenom} ${eleve.nom}`}
        <span>{eleve.classe || 'Classe non précisée'}</span>
      </p>

      {kits.length > 0 && (
        <>
          <h2 className="section-title">Listes de l’établissement</h2>
          <div className="bq-kits">
            {kits.map((k) => {
              const n = k.articles.reduce((s, x) => s + x.quantite, 0)
              const prix = k.articles.reduce((s, x) => s + x.quantite * (articles.get(x.articleId)?.prix || 0), 0)
              return (
                <div className="bq-kit" key={k.id}>
                  <div>
                    <b data-brut>{k.nom}</b>
                    <small data-brut>{`${n} articles · ${fcfa(prix)}`}</small>
                  </div>
                  <button type="button" className="btn btn-quiet bq-petit" onClick={() => ajouterKit(k)}>
                    Tout ajouter
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}

      <h2 className="section-title">Articles</h2>
      {presentes.length > 1 && (
        <div className="segments petit" role="tablist">
          {presentes.map(([c, t]) => (
            <button key={c} type="button" role="tab" aria-selected={cat === c} onClick={() => setCategorie(c)}>
              {t}
            </button>
          ))}
        </div>
      )}
      <ul className="rows bq-articles">
        {d.data.articles
          .filter((a) => a.categorie === cat)
          .map((a) => {
            const pris = dansPanier(a.id)
            const q = pris.reduce((s, l) => s + l.quantite, 0)
            return (
              <li className="bq-article" key={a.id}>
                <div className="bq-article-ligne">
                  <div className="bq-article-texte">
                    <b data-brut>{a.nom}</b>
                    {a.description && <small data-brut>{a.description}</small>}
                    <span className="bq-prix" data-brut>
                      {fcfa(a.prix)}
                    </span>
                  </div>
                  {a.tailles.length ? (
                    <button type="button" className={`btn bq-petit ${q ? '' : 'btn-quiet'}`} onClick={() => setTailleOuverte(tailleOuverte === a.id ? null : a.id)}>
                      {q ? `${q} au panier` : 'Ajouter'}
                    </button>
                  ) : q ? (
                    <Compteur valeur={q} onMoins={() => ajouter(a.id, '', -1)} onPlus={() => ajouter(a.id, '', 1)} />
                  ) : (
                    <button type="button" className="btn btn-quiet bq-petit" onClick={() => ajouter(a.id, '', 1)}>
                      Ajouter
                    </button>
                  )}
                </div>
                {tailleOuverte === a.id && (
                  <div className="bq-tailles">
                    <small>Taille</small>
                    {a.tailles.map((t) => {
                      const n = pris.find((l) => l.taille === t)?.quantite || 0
                      return (
                        <button key={t} type="button" className="chip" aria-pressed={n > 0} onClick={() => ajouter(a.id, t, 1)} data-brut>
                          {n ? `${t} ×${n}` : t}
                        </button>
                      )
                    })}
                  </div>
                )}
              </li>
            )
          })}
      </ul>

      {nbArticles > 0 && (
        <div className="bq-barre">
          <div>
            <b>{fcfa(total)}</b>
            <small>{`${nbArticles} article(s)`}</small>
          </div>
          <button type="button" className="btn" onClick={() => setVoirPanier(true)}>
            Voir le panier
          </button>
        </div>
      )}
      {voirPanier && nbArticles > 0 && (
        <Panier
          eleve={eleve}
          lignes={lignes}
          total={total}
          moyens={moyens}
          onFermer={() => setVoirPanier(false)}
          ajouter={ajouter}
          changerTaille={changerTaille}
          onVider={() => {
            setPanier({})
            setVoirPanier(false)
          }}
        />
      )}
    </>
  )
}

function Compteur({ valeur, onMoins, onPlus }) {
  return (
    <span className="bq-compteur">
      <button type="button" onClick={onMoins} aria-label="Retirer un">
        −
      </button>
      <b>{valeur}</b>
      <button type="button" onClick={onPlus} aria-label="Ajouter un">
        +
      </button>
    </span>
  )
}

function Panier({ eleve, lignes, total, moyens, onFermer, ajouter, changerTaille, onVider }) {
  const [moyen, setMoyen] = useState(moyens.orange ? 'orange_money' : moyens.mtn ? 'mtn_momo' : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sansTaille = lignes.some((l) => l.a.tailles.length && !l.taille)

  async function commander() {
    setError('')
    if (sansTaille) return setError('Choisissez la taille de chaque vêtement.')
    if (!moyen) return setError('Choisissez Orange Money ou MTN MoMo.')
    setBusy(true)
    try {
      const r = await api.post('/api/boutique/commandes', {
        studentId: eleve.id,
        moyen,
        lignes: lignes.map((l) => ({ articleId: l.articleId, taille: l.taille || null, quantite: l.quantite })),
      })
      onVider()
      window.location.hash = `/ordres/${r.data.ordreId}`
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="voile" onClick={onFermer}>
      <div className="feuille bq-feuille" onClick={(e) => e.stopPropagation()}>
        <div className="feuille-poignee" />
        <p className="feuille-titre" data-brut>{`Panier · ${eleve.prenom}`}</p>
        <ul className="bq-panier">
          {lignes.map((l) => (
            <li key={l.k}>
              <div className="bq-panier-texte">
                <b data-brut>{l.a.nom}</b>
                <small data-brut>{`${fcfa(l.a.prix)} · ${fcfa(l.a.prix * l.quantite)}`}</small>
                {l.a.tailles.length > 0 && (
                  <select className={`input bq-taille ${l.taille ? '' : 'manque'}`} value={l.taille} onChange={(e) => changerTaille(l.k, e.target.value)}>
                    <option value="">Taille ?</option>
                    {l.a.tailles.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <Compteur valeur={l.quantite} onMoins={() => ajouter(l.articleId, l.taille, -1)} onPlus={() => ajouter(l.articleId, l.taille, 1)} />
            </li>
          ))}
        </ul>
        <div className="chips" style={{ margin: '12px 0 0' }}>
          {moyens.orange && (
            <button type="button" className="chip" aria-pressed={moyen === 'orange_money'} onClick={() => setMoyen('orange_money')}>
              <img className="moyen-logo petit" src="/paiement/orange-money.png" alt="" /> Orange Money
            </button>
          )}
          {moyens.mtn && (
            <button type="button" className="chip" aria-pressed={moyen === 'mtn_momo'} onClick={() => setMoyen('mtn_momo')}>
              <img className="moyen-logo petit" src="/paiement/mtn-momo.png" alt="" /> MTN MoMo
            </button>
          )}
        </div>
        {!moyens.orange && !moyens.mtn && <Note>L’établissement n’a pas encore de numéro de paiement.</Note>}
        <ApercuEnvoi calcul={fraisPaiementDirect(total)} libelle="Articles" />
        <Note>{error}</Note>
        <button type="button" className="btn btn-block" disabled={busy || (!moyens.orange && !moyens.mtn)} onClick={commander} style={{ marginTop: 8 }}>
          {busy ? 'Un instant…' : 'Commander et payer'}
        </button>
        <button type="button" className="op-annuler" onClick={onVider}>
          Vider le panier
        </button>
      </div>
    </div>
  )
}
