// Boutique de l'etablissement, cote parent : une vitrine (packs de la classe, articles en images),
// fiche article, panier puis paiement direct au numero de l'etablissement (meme ordre que la scolarite).
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'
import { fraisPaiementDirect } from '../fraisPaiement.js'
import { ApercuEnvoi } from './Scolarite.jsx'
import { LogoEcole } from './OrdrePaiement.jsx'
import { VisuelArticle, visuelDe } from '../boutique-visuels.jsx'
import { IcSac } from '../icones.jsx'

export const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`
const prixCourt = (n) => `${Number(n || 0).toLocaleString('fr-FR')} F`
export const CATEGORIES = [
  ['tenue', 'Tenue'],
  ['fournitures', 'Fournitures'],
  ['livres', 'Livres'],
  ['autre', 'Autres'],
]
export const ETATS_COMMANDE = {
  a_payer: ['À payer', '#b45309', 'rgba(245, 158, 11, 0.16)'],
  payee: ['En préparation', 'var(--lien)', 'rgba(47, 107, 255, 0.14)'],
  prete: ['Prête', 'var(--ok)', 'rgba(22, 163, 74, 0.14)'],
  remise: ['Remise', 'var(--muted)', 'var(--card-2)'],
  annulee: ['Annulée', 'var(--muted)', 'var(--card-2)'],
}
export function EtatCommande({ statut }) {
  const [t, c, f] = ETATS_COMMANDE[statut] || ETATS_COMMANDE.annulee
  return (
    <span className="tag" style={{ color: c, background: f, whiteSpace: 'nowrap' }}>
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
// Les 4 images d'un pack : des articles de genres differents (pas quatre cahiers)
const famille = (a) => {
  const v = a.image ? `photo${a.id}` : visuelDe(a.nom, a.categorie)
  return /^(c100|c200|g200|g300|tp|dessin|textes|cahier)$/.test(v) ? 'cahier' : v.replace(/^dico_.*/, 'dico')
}
const collage = (liste) => {
  const vus = new Set()
  const choix = []
  for (const a of liste) {
    if (a && !vus.has(famille(a))) {
      vus.add(famille(a))
      choix.push(a)
    }
  }
  return choix.slice(0, 4)
}
const plage = (t) => (t.length > 2 ? `${t[0]} à ${t[t.length - 1]}` : t.join(', '))

export default function Boutique() {
  const d = useApi('/api/boutique')
  const [choix, setChoix] = useState(() => Number(new URLSearchParams(window.location.hash.split('?')[1] || '').get('eleve')) || null)
  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Chargement…</p>
  const { eleves, commandes } = d.data
  const eleve = eleves.find((e) => e.id === choix) || eleves.find((e) => e.ouverte) || eleves[0]
  const enCours = commandes.filter((c) => c.statut !== 'remise')
  if (!eleves.length)
    return (
      <div className="bq-page">
        <div className="bq-vide">
          <span className="bq-vide-ico">
            <IcSac size={30} />
          </span>
          <b>La boutique de l’établissement</b>
          <p>Reliez d’abord votre enfant à votre compte pour commander sa tenue et ses fournitures.</p>
          <a className="btn" href="#/trouver-eleve">
            Trouver mon enfant
          </a>
        </div>
      </div>
    )
  return (
    <div className="bq-page">
      <Catalogue
        key={eleve.id}
        id={eleve.id}
        enfants={
          eleves.length > 1 && (
            <div className="bq-enfants">
              {eleves.map((e) => (
                <button key={e.id} type="button" aria-pressed={e.id === eleve.id} onClick={() => setChoix(e.id)}>
                  <span className="bq-initiale">{(e.prenom || '?')[0]}</span>
                  <span data-brut>{e.prenom}</span>
                </button>
              ))}
            </div>
          )
        }
        commandes={enCours}
      />
    </div>
  )
}

// Commandes en cours : petites cartes defilantes
function CommandesEnCours({ commandes }) {
  if (!commandes.length) return null
  return (
    <>
      <div className="bq-section">
        <h2>Mes commandes</h2>
      </div>
      <div className="bq-defile">
        {commandes.map((c) => (
          <a key={c.id} className="bq-cmd-carte" href={`#/boutique/commandes/${c.id}`}>
            <span className="bq-cmd-ico">
              <IcSac size={20} />
            </span>
            <span className="bq-cmd-texte">
              <b data-brut>{`N° ${c.id} · ${c.prenom}`}</b>
              <small data-brut>{`${c.articles} article(s) · ${fcfa(c.montant)}`}</small>
            </span>
            <EtatCommande statut={c.statut} />
          </a>
        ))}
      </div>
    </>
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

function Catalogue({ id, enfants, commandes }) {
  const d = useApi(`/api/boutique/eleves/${id}`)
  const cleStock = `sukul-panier-${id}`
  const [panier, setPanier] = useState(() => lireStock(cleStock))
  const [categorie, setCategorie] = useState('tout')
  const [fiche, setFiche] = useState(null)
  const [pack, setPack] = useState(null)
  const [voirPanier, setVoirPanier] = useState(false)
  const [ajoute, setAjoute] = useState('')
  useEffect(() => ecrireStock(cleStock, panier), [cleStock, panier])
  useEffect(() => {
    if (!ajoute) return undefined
    const t = setTimeout(() => setAjoute(''), 2200)
    return () => clearTimeout(t)
  }, [ajoute])
  const articles = useMemo(() => new Map((d.data?.articles || []).map((a) => [a.id, a])), [d.data])

  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Chargement…</p>
  const { eleve, ouverte, kits, moyens } = d.data

  const lignes = Object.entries(panier)
    .map(([k, l]) => ({ k, ...l, a: articles.get(l.articleId) }))
    .filter((l) => l.a && l.quantite > 0)
  const nbArticles = lignes.reduce((s, l) => s + l.quantite, 0)
  const total = lignes.reduce((s, l) => s + l.quantite * l.a.prix, 0)
  const presentes = CATEGORIES.filter(([c]) => d.data.articles.some((a) => a.categorie === c))
  const visibles = d.data.articles.filter((a) => categorie === 'tout' || a.categorie === categorie)

  const ajouter = (articleId, taille, n = 1) =>
    setPanier((p) => {
      const k = cleLigne(articleId, taille)
      const q = Math.max(0, Math.min(99, (p[k]?.quantite || 0) + n))
      const suite = { ...p }
      if (q) suite[k] = { articleId, taille: taille || '', quantite: q }
      else delete suite[k]
      return suite
    })
  const ajouterKit = (kit) => {
    setPanier((p) => {
      const suite = { ...p }
      for (const x of kit.articles) {
        const a = articles.get(x.articleId)
        if (!a) continue
        const k = cleLigne(a.id, '')
        suite[k] = { articleId: a.id, taille: '', quantite: Math.min(99, (suite[k]?.quantite || 0) + x.quantite) }
      }
      return suite
    })
    setAjoute(`${kit.nom} ajouté au panier`)
  }
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
  const qteDe = (articleId) => lignes.filter((l) => l.articleId === articleId).reduce((s, l) => s + l.quantite, 0)
  const ajoutRapide = (a) => {
    if (a.tailles.length) return setFiche(a)
    ajouter(a.id, '', 1)
    setAjoute(`${a.nom} ajouté au panier`)
  }

  return (
    <>
      {/* ------------------------------ vitrine de l'etablissement */}
      <header className="bq-vitrine">
        <div className="bq-vitrine-fond">
          <small className="bq-officiel">Boutique officielle</small>
        </div>
        <div className="bq-vitrine-corps">
          <LogoEcole id={eleve.schoolId} nom={eleve.ecole} taille={58} />
          <div>
            <h1 data-brut>{eleve.ecole}</h1>
            <p>Tenues et fournitures · retrait à l’établissement</p>
          </div>
        </div>
        <div className="bq-pour" data-brut>
          <span>{`Pour ${eleve.prenom} ${eleve.nom}`}</span>
          <b>{eleve.classe || 'Classe non précisée'}</b>
        </div>
      </header>
      {enfants}
      <CommandesEnCours commandes={commandes} />

      {!ouverte && (
        <div className="bq-vide">
          <b>Boutique fermée</b>
          <p data-brut>{`La boutique de ${eleve.ecole} n’est pas encore ouverte.`}</p>
        </div>
      )}

      {/* ------------------------------ packs de la classe */}
      {ouverte && kits.length > 0 && (
        <>
          <div className="bq-section empile">
            <h2>Packs de la rentrée</h2>
            <small data-brut>{`Choisis par l’établissement pour la ${eleve.classe || 'classe'}`}</small>
          </div>
          <div className="bq-defile bq-packs">
            {kits.map((k) => {
              const n = k.articles.reduce((s, x) => s + x.quantite, 0)
              const prix = k.articles.reduce((s, x) => s + x.quantite * (articles.get(x.articleId)?.prix || 0), 0)
              const vitrine = collage(k.articles.map((x) => articles.get(x.articleId)))
              return (
                <article className="bq-pack" key={k.id}>
                  <button type="button" className="bq-pack-collage" onClick={() => setPack(k)} aria-label={`Voir ${k.nom}`}>
                    {vitrine.map((a) => (
                      <VisuelArticle key={a.id} article={a} />
                    ))}
                    <span className="bq-pack-nb">{`${n} articles`}</span>
                  </button>
                  <div className="bq-pack-pied">
                    <div>
                      <b data-brut>{k.nom.replace(/^Liste de fournitures /, 'Fournitures ')}</b>
                      <span data-brut>{fcfa(prix)}</span>
                    </div>
                    <button type="button" className="bq-pack-ajout" onClick={() => ajouterKit(k)}>
                      Ajouter
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </>
      )}

      {/* ------------------------------ articles en grille */}
      {ouverte && d.data.articles.length > 0 && (
        <>
          <div className="bq-section">
            <h2>Articles</h2>
          </div>
          <div className="bq-filtres">
            {[['tout', 'Tout'], ...presentes].map(([c, t]) => (
              <button key={c} type="button" aria-pressed={categorie === c} onClick={() => setCategorie(c)}>
                {t}
              </button>
            ))}
          </div>
          <div className="bq-grille">
            {visibles.map((a) => {
              const q = qteDe(a.id)
              return (
                <article className="bq-carte" key={a.id}>
                  <div className="bq-carte-media">
                    <button type="button" className="bq-carte-image" onClick={() => setFiche(a)} aria-label={a.nom}>
                      <VisuelArticle article={a} />
                    </button>
                    {q > 0 && <span className="bq-carte-nb">{q}</span>}
                    <button type="button" className="bq-carte-plus" onClick={() => ajoutRapide(a)} aria-label={`Ajouter ${a.nom}`}>
                      +
                    </button>
                  </div>
                  <button type="button" className="bq-carte-texte" onClick={() => setFiche(a)}>
                    <b data-brut>{prixCourt(a.prix)}</b>
                    <span data-brut>{a.nom}</span>
                    {a.tailles.length > 0 && <small data-brut>{`Tailles ${plage(a.tailles)}`}</small>}
                  </button>
                </article>
              )
            })}
          </div>
        </>
      )}

      {ajoute && (
        <div className="bq-toast" role="status" data-brut>
          {ajoute}
        </div>
      )}

      {nbArticles > 0 && (
        <button type="button" className="bq-panier-flottant" onClick={() => setVoirPanier(true)}>
          <span className="bq-panier-ico">
            <IcSac size={20} />
            <i>{nbArticles}</i>
          </span>
          <span>Voir le panier</span>
          <b data-brut>{fcfa(total)}</b>
        </button>
      )}

      {fiche && (
        <FicheArticle
          a={fiche}
          ecole={eleve.ecole}
          onFermer={() => setFiche(null)}
          onAjouter={(taille, n) => {
            ajouter(fiche.id, taille, n)
            setAjoute(`${fiche.nom} ajouté au panier`)
            setFiche(null)
          }}
        />
      )}
      {pack && (
        <FichePack
          k={pack}
          articles={articles}
          onFermer={() => setPack(null)}
          onAjouter={() => {
            ajouterKit(pack)
            setPack(null)
          }}
        />
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

// Fiche d'un article : grande image, prix, taille et quantite
function FicheArticle({ a, ecole, onFermer, onAjouter }) {
  const [taille, setTaille] = useState('')
  const [n, setN] = useState(1)
  const [error, setError] = useState('')
  return (
    <div className="voile" onClick={onFermer}>
      <div className="feuille bq-feuille bq-fiche" onClick={(e) => e.stopPropagation()}>
        <div className="feuille-poignee" />
        <VisuelArticle article={a} className="grand" />
        <div className="bq-fiche-tete">
          <h3 data-brut>{a.nom}</h3>
          <b data-brut>{fcfa(a.prix)}</b>
        </div>
        {a.description && (
          <p className="bq-fiche-desc" data-brut>
            {a.description}
          </p>
        )}
        <p className="bq-vendeur" data-brut>{`Vendu par ${ecole} · retrait à l’établissement`}</p>
        {a.tailles.length > 0 && (
          <>
            <p className="bq-libelle">Taille</p>
            <div className="bq-tailles">
              {a.tailles.map((t) => (
                <button key={t} type="button" aria-pressed={taille === t} onClick={() => setTaille(t)} data-brut>
                  {t}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="bq-fiche-pied">
          <Compteur valeur={n} onMoins={() => setN(Math.max(1, n - 1))} onPlus={() => setN(Math.min(99, n + 1))} />
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (a.tailles.length && !taille) return setError('Choisissez une taille.')
              onAjouter(taille, n)
            }}
          >
            {`Ajouter · ${fcfa(a.prix * n)}`}
          </button>
        </div>
        <Note>{error}</Note>
      </div>
    </div>
  )
}

// Contenu d'un pack
function FichePack({ k, articles, onFermer, onAjouter }) {
  const prix = k.articles.reduce((s, x) => s + x.quantite * (articles.get(x.articleId)?.prix || 0), 0)
  return (
    <div className="voile" onClick={onFermer}>
      <div className="feuille bq-feuille" onClick={(e) => e.stopPropagation()}>
        <div className="feuille-poignee" />
        <div className="bq-fiche-tete" style={{ marginTop: 4 }}>
          <h3 data-brut>{k.nom}</h3>
          <b data-brut>{fcfa(prix)}</b>
        </div>
        {k.description && <p className="bq-fiche-desc" data-brut>{k.description}</p>}
        <ul className="bq-pack-liste">
          {k.articles.map((x) => {
            const a = articles.get(x.articleId)
            return (
              <li key={x.articleId}>
                <VisuelArticle article={a} className="mini" />
                <span data-brut>{a.nom}</span>
                <b data-brut>{`× ${x.quantite}`}</b>
              </li>
            )
          })}
        </ul>
        <div className="bq-paiement">
          <button type="button" className="btn btn-block" onClick={onAjouter}>
            {`Ajouter le pack · ${fcfa(prix)}`}
          </button>
        </div>
      </div>
    </div>
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
              <VisuelArticle article={l.a} className="mini" />
              <div className="bq-panier-texte">
                <b data-brut>{l.a.nom}</b>
                <small data-brut>{fcfa(l.a.prix * l.quantite)}</small>
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
        <div className="bq-paiement">
          <div className="chips" style={{ margin: 0 }}>
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
          <button type="button" className="btn btn-block" disabled={busy || (!moyens.orange && !moyens.mtn)} onClick={commander}>
            {busy ? 'Un instant…' : 'Commander et payer'}
          </button>
          <button type="button" className="op-annuler" onClick={onVider}>
            Vider le panier
          </button>
        </div>
      </div>
    </div>
  )
}
