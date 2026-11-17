import { useRef, useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Field, Note, annoncer } from '../ui.jsx'
import { IcImport, IcPlus } from '../icones.jsx'
import { preparerDocument } from '../lecture-fichier.js'
import { useDepotPage } from '../depot.jsx'
import { exporterExcel } from '../export.jsx'
import { fcfa } from '../recus.js'
import { langue } from '../i18n.jsx'

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const nomMois = (m) => {
  const [a, n] = String(m).split('-')
  return `${MOIS[Number(n) - 1]} ${a}`
}
const court = (m) => new Date(`${m}-15T12:00:00`).toLocaleDateString(langue === 'en' ? 'en-GB' : 'fr-FR', { month: 'short' })
// textes separes par des points (chaque morceau est traduit a part)
const points = (liste) => liste.filter(Boolean).flatMap((x, i) => (i ? [' · ', <span key={i}>{x}</span>] : [<span key={i}>{x}</span>]))
const jour = (d) => new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
const aujourdhui = () => new Date().toISOString().slice(0, 10)
const taux = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0)

const CAT_DEPENSES = ['Personnel', 'Fonctionnement', 'Pédagogie', 'Infrastructures', 'Vie scolaire', 'Autre']
const CAT_RECETTES = ['Subvention', 'Location', 'Dons et partenariats', 'Activités', 'Autre']
const MODES = ['Espèces', 'Virement', 'Chèque', 'Mobile Money']

function Barre({ valeur, sens }) {
  const v = Math.min(100, valeur)
  const classe = sens === 'part' ? '' : sens === 'depense' ? (valeur > 100 ? 'faible' : valeur >= 85 ? 'moyen' : '') : valeur >= 80 ? '' : valeur >= 50 ? 'moyen' : 'faible'
  return (
    <span className="suivi-barre" aria-hidden="true">
      <i style={{ width: `${v}%` }} className={classe} />
    </span>
  )
}

// Fenetre d'ajout ou de modification d'une operation
function FormOperation({ op, postes, onFermer, onFait }) {
  const [f, setF] = useState(() => ({
    sens: op?.sens || 'depense',
    date: op?.date_op ? String(op.date_op).slice(0, 10) : aujourdhui(),
    libelle: op?.libelle || '',
    montant: op?.montant ? String(op.montant) : '',
    categorie: op?.categorie || '',
    posteId: op?.poste_id ? String(op.poste_id) : '',
    tiers: op?.tiers || '',
    mode: op?.mode || '',
    piece: op?.piece || '',
    etat: op?.etat || 'paye',
  }))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const maj = (champs) => setF((x) => ({ ...x, ...champs }))
  const listePostes = postes.filter((p) => p.sens === f.sens && !p.scolarite)
  const cats = f.sens === 'depense' ? CAT_DEPENSES : CAT_RECETTES

  async function enregistrer(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (op) await api.put(`/api/comptabilite/operations/${op.id}`, f)
      else await api.post('/api/comptabilite/operations', f)
      annoncer(op ? 'Opération modifiée' : f.sens === 'depense' ? 'Dépense enregistrée' : 'Recette enregistrée')
      onFait()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  async function supprimer() {
    if (!window.confirm('Supprimer cette opération ?')) return
    try {
      await api.delete(`/api/comptabilite/operations/${op.id}`)
      annoncer('Opération supprimée')
      onFait()
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <div className="voile" onClick={(e) => e.target === e.currentTarget && onFermer()}>
      <form className="feuille cpt-feuille" onSubmit={enregistrer}>
        <div className="feuille-poignee" />
        <p className="feuille-titre">{op ? 'Modifier l’opération' : 'Nouvelle opération'}</p>
        <div className="segments petit" role="tablist">
          <button type="button" role="tab" aria-selected={f.sens === 'depense'} onClick={() => maj({ sens: 'depense', categorie: '', posteId: '' })}>
            Dépense
          </button>
          <button type="button" role="tab" aria-selected={f.sens === 'recette'} onClick={() => maj({ sens: 'recette', categorie: '', posteId: '' })}>
            Recette
          </button>
        </div>
        <Field label="Libellé">
          <input className="input" required value={f.libelle} onChange={(e) => maj({ libelle: e.target.value })} placeholder={f.sens === 'depense' ? 'Ex. Achat de craies et marqueurs' : 'Ex. Subvention de l’État'} />
        </Field>
        <div className="cpt-deux">
          <Field label="Montant (FCFA)">
            <input className="input" required inputMode="numeric" value={f.montant} onChange={(e) => maj({ montant: e.target.value.replace(/[^\d]/g, '') })} />
          </Field>
          <Field label="Date">
            <input className="input" type="date" required value={f.date} onChange={(e) => maj({ date: e.target.value })} />
          </Field>
        </div>
        <div className="cpt-deux">
          <Field label="Catégorie">
            <select className="input" value={f.categorie} onChange={(e) => maj({ categorie: e.target.value })}>
              <option value="">—</option>
              {[...new Set([...cats, ...(f.categorie ? [f.categorie] : [])])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Poste du budget">
            <select className="input" value={f.posteId} onChange={(e) => maj({ posteId: e.target.value })}>
              <option value="">Aucun</option>
              {listePostes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="cpt-deux">
          <Field label={f.sens === 'depense' ? 'Bénéficiaire' : 'Payeur'}>
            <input className="input" value={f.tiers} onChange={(e) => maj({ tiers: e.target.value })} />
          </Field>
          <Field label="Mode de règlement">
            <select className="input" value={f.mode} onChange={(e) => maj({ mode: e.target.value })}>
              <option value="">—</option>
              {[...new Set([...MODES, ...(f.mode ? [f.mode] : [])])].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="cpt-deux">
          <Field label="N° de pièce">
            <input className="input" value={f.piece} onChange={(e) => maj({ piece: e.target.value })} placeholder="Bon, facture…" />
          </Field>
          {f.sens === 'depense' && (
            <Field label="État">
              <select className="input" value={f.etat} onChange={(e) => maj({ etat: e.target.value })}>
                <option value="paye">Payée</option>
                <option value="engage">Engagée (à payer)</option>
              </select>
            </Field>
          )}
        </div>
        <Note>{error}</Note>
        <button type="submit" className="btn btn-block" disabled={busy}>
          {busy ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <div className="cpt-pied-form">
          <button type="button" className="lien-discret" onClick={onFermer}>
            Annuler
          </button>
          {op && (
            <button type="button" className="lien-discret rouge" onClick={supprimer}>
              Supprimer
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

// Fenetre d'ajout ou de modification d'un poste du budget
function FormPoste({ poste, sens, onFermer, onFait }) {
  const [f, setF] = useState(() => ({ nom: poste?.nom || '', sens: poste?.sens || sens, categorie: poste?.categorie || '', prevu: poste ? String(poste.prevu) : '', scolarite: Boolean(poste?.scolarite) }))
  const [error, setError] = useState('')
  const maj = (champs) => setF((x) => ({ ...x, ...champs }))
  async function enregistrer(e) {
    e.preventDefault()
    setError('')
    try {
      if (poste) await api.put(`/api/comptabilite/postes/${poste.id}`, f)
      else await api.post('/api/comptabilite/postes', f)
      annoncer(poste ? 'Poste modifié' : 'Poste ajouté au budget')
      onFait()
    } catch (err) {
      setError(err.message)
    }
  }
  async function supprimer() {
    if (!window.confirm('Retirer ce poste du budget ? Les opérations rattachées sont conservées.')) return
    try {
      await api.delete(`/api/comptabilite/postes/${poste.id}`)
      annoncer('Poste retiré du budget')
      onFait()
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <div className="voile" onClick={(e) => e.target === e.currentTarget && onFermer()}>
      <form className="feuille cpt-feuille" onSubmit={enregistrer}>
        <div className="feuille-poignee" />
        <p className="feuille-titre">{poste ? 'Modifier le poste' : f.sens === 'recette' ? 'Nouveau poste de recettes' : 'Nouveau poste de dépenses'}</p>
        <Field label="Poste">
          <input className="input" required value={f.nom} onChange={(e) => maj({ nom: e.target.value })} />
        </Field>
        <div className="cpt-deux">
          <Field label="Montant prévu (FCFA)">
            <input className="input" required inputMode="numeric" value={f.prevu} onChange={(e) => maj({ prevu: e.target.value.replace(/[^\d]/g, '') })} />
          </Field>
          <Field label="Catégorie">
            <select className="input" value={f.categorie} onChange={(e) => maj({ categorie: e.target.value })}>
              <option value="">—</option>
              {[...new Set([...(f.sens === 'depense' ? CAT_DEPENSES : CAT_RECETTES), ...(f.categorie ? [f.categorie] : [])])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {f.sens === 'recette' && (
          <label className="cpt-case">
            <input type="checkbox" checked={f.scolarite} onChange={(e) => maj({ scolarite: e.target.checked })} />
            <span>Alimenté par les paiements de scolarité encaissés dans Sùkûl</span>
          </label>
        )}
        <Note>{error}</Note>
        <button type="submit" className="btn btn-block">
          Enregistrer
        </button>
        <div className="cpt-pied-form">
          <button type="button" className="lien-discret" onClick={onFermer}>
            Annuler
          </button>
          {poste && (
            <button type="button" className="lien-discret rouge" onClick={supprimer}>
              Retirer du budget
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

// Comptabilite de l'etablissement : tableau de bord, journal des operations et budget
export default function Compta() {
  const resume = useApi('/api/comptabilite')
  const budget = useApi('/api/comptabilite/budget')
  const ops = useApi('/api/comptabilite/operations')
  const champ = useRef(null)
  const [vue, setVue] = useState('bord')
  const [filtre, setFiltre] = useState('tout')
  const [cherche, setCherche] = useState('')
  const [form, setForm] = useState(null)
  const [import_, setImport] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const recharger = () => {
    resume.reload()
    budget.reload()
    ops.reload()
  }
  const fait = () => {
    setForm(null)
    recharger()
  }

  async function lire(e) {
    const fichiers = [...(e.target.files || [])]
    if (e.target) e.target.value = ''
    if (!fichiers.length) return
    setError('')
    setBusy('Lecture du classeur…')
    try {
      const doc = await preparerDocument(fichiers)
      if (!doc.texte.trim()) throw new Error('Utilisez un fichier Excel ou CSV : le budget et le journal des dépenses sont lus directement dans le tableau.')
      const r = await api.post('/api/comptabilite/importer', { texte: doc.texte, apercu: true })
      setImport({ texte: doc.texte, nom: fichiers[0].name, ...r.data })
    } catch (err) {
      setError(err.message)
    }
    setBusy('')
  }
  const zoneDepot = useDepotPage(lire, { texte: 'Déposez le budget ou le journal des dépenses', detail: 'Excel ou CSV' })

  async function confirmerImport() {
    setBusy('Import…')
    try {
      const r = await api.post('/api/comptabilite/importer', { texte: import_.texte })
      annoncer(`${r.data.operations} opération(s) et ${r.data.postesNouveaux + r.data.postesMaj} poste(s) importés`)
      setImport(null)
      recharger()
    } catch (err) {
      setError(err.message)
    }
    setBusy('')
  }

  async function exporter() {
    await exporterExcel('comptabilite', [
      { nom: 'Opérations', lignes: (ops.data || []).map((o) => ({ Date: String(o.date_op).slice(0, 10), Sens: o.sens === 'depense' ? 'Dépense' : 'Recette', Libellé: o.libelle, Catégorie: o.categorie || '', Poste: o.poste || '', 'Bénéficiaire / payeur': o.tiers || '', 'Montant (FCFA)': Number(o.montant), Mode: o.mode || '', Pièce: o.piece || '', État: o.etat === 'engage' ? 'Engagée' : 'Payée' })) },
      { nom: 'Budget', lignes: (budget.data || []).map((p) => ({ Poste: p.nom, Nature: p.sens === 'depense' ? 'Dépense' : 'Recette', Catégorie: p.categorie || '', 'Prévu (FCFA)': p.prevu, 'Réalisé (FCFA)': p.realise, 'Taux (%)': taux(p.realise, p.prevu) })) },
    ])
  }

  const d = resume.data
  if (resume.error) return <Note>{resume.error}</Note>
  if (!d) return <p className="muted">Chargement…</p>
  const postes = budget.data || []
  const vide = !postes.length && !(ops.data || []).length

  // ---------- apercu d'un import ----------
  if (import_) {
    return (
      <>
        <div className="page-tete">
          <div>
            <h1 className="page-title">Importer</h1>
            <p className="muted" data-brut>
              {import_.nom}
            </p>
          </div>
        </div>
        <div className="cpt-apercu">
          {import_.postesNouveaux + import_.postesMaj > 0 && (
            <div>
              <span>Budget</span>
              <b>{`${import_.postesNouveaux + import_.postesMaj} poste(s)`}</b>
              <small>{`Recettes prévues ${fcfa(import_.prevuRecettes)} · dépenses prévues ${fcfa(import_.prevuDepenses)}`}</small>
              {import_.postesMaj > 0 && <small>{`${import_.postesMaj} poste(s) déjà présent(s) seront mis à jour`}</small>}
            </div>
          )}
          {import_.operations + import_.dejaImportees > 0 && (
            <div>
              <span>Journal</span>
              <b>{`${import_.operations} opération(s) nouvelle(s)`}</b>
              <small>{import_.depenses || import_.recettes ? points([import_.depenses ? `Dépenses ${fcfa(import_.depenses)}` : '', import_.recettes ? `Recettes ${fcfa(import_.recettes)}` : '']) : 'Rien de nouveau'}</small>
              {import_.dejaImportees > 0 && <small>{`${import_.dejaImportees} déjà importée(s), ignorée(s)`}</small>}
            </div>
          )}
        </div>
        <Note>{error}</Note>
        <div className="disc-barre">
          <button type="button" className="btn" disabled={Boolean(busy)} onClick={confirmerImport}>
            {busy || 'Importer'}
          </button>
          <button type="button" className="btn btn-quiet" disabled={Boolean(busy)} onClick={() => setImport(null)}>
            Annuler
          </button>
        </div>
      </>
    )
  }

  const maxMois = Math.max(1, ...d.mois.map((m) => Math.max(m.recettes, m.depenses)))
  const totalCat = d.categories.reduce((s, c) => s + c.total, 0)
  const lignesOps = (ops.data || []).filter((o) => (filtre === 'tout' || o.sens === filtre) && (!cherche || `${o.libelle} ${o.tiers || ''} ${o.categorie || ''} ${o.piece || ''}`.toLowerCase().includes(cherche.toLowerCase())))
  const parMois = []
  for (const o of lignesOps) {
    const m = String(o.date_op).slice(0, 7)
    if (!parMois.length || parMois[parMois.length - 1].m !== m) parMois.push({ m, liste: [], total: 0 })
    const g = parMois[parMois.length - 1]
    g.liste.push(o)
    g.total += (o.sens === 'recette' ? 1 : -1) * Number(o.montant)
  }
  const ligneOp = (o) => (
    <li key={o.id}>
      <button type="button" className="cpt-op" onClick={() => setForm({ type: 'op', op: o })}>
        <span className="ls-texte">
          <b>{o.libelle}</b>
          <small>{points([jour(o.date_op), o.categorie, o.tiers])}</small>
        </span>
        <span className={`cpt-montant ${o.sens}`}>
          {`${o.sens === 'depense' ? '−' : '+'} ${fcfa(o.montant)}`}
          {o.etat === 'engage' && <small>à payer</small>}
        </span>
      </button>
    </li>
  )
  const sectionPostes = (sens) => {
    const liste = postes.filter((p) => p.sens === sens)
    const prevu = liste.reduce((s, p) => s + p.prevu, 0)
    const realise = liste.reduce((s, p) => s + p.realise, 0)
    return (
      <section key={sens}>
        <p className="niveau-titre suivi-niveau">
          <span>{sens === 'recette' ? 'Recettes' : 'Dépenses'}</span>
          <span>{`${fcfa(realise)} / ${fcfa(prevu)} · ${taux(realise, prevu)} %`}</span>
        </p>
        {liste.length > 0 && (
          <ul className="liste-simple">
            {liste.map((p) => {
              const t = taux(p.realise, p.prevu)
              return (
                <li key={p.id} className="suivi-ligne">
                  <button type="button" onClick={() => setForm({ type: 'poste', poste: p })}>
                    <span className="ls-texte">
                      <b>{p.nom}</b>
                      <small>{points([p.categorie, `${fcfa(p.realise)} / ${fcfa(p.prevu)}`, p.scolarite ? 'paiements Sùkûl' : '', p.engage ? `À payer ${fcfa(p.engage)}` : ''])}</small>
                    </span>
                    <span className="suivi-taux">
                      <b className={sens === 'depense' && t > 100 ? 'rouge' : ''}>{t} %</b>
                      <Barre valeur={t} sens={sens} />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <button type="button" className="lien-action cpt-ajout" onClick={() => setForm({ type: 'poste', sens })}>
          {sens === 'recette' ? '+ Poste de recettes' : '+ Poste de dépenses'}
        </button>
      </section>
    )
  }

  return (
    <>
      {zoneDepot}
      <div className="page-tete">
        <div>
          <h1 className="page-title">Comptabilité</h1>
          <p className="muted">{`Année scolaire ${d.annee}`}</p>
        </div>
      </div>
      <div className="cpt-boutons">
          <button type="button" className="btn btn-quiet bouton-icone" disabled={Boolean(busy)} onClick={() => champ.current?.click()}>
            <IcImport size={18} /> Importer
          </button>
          <button type="button" className="btn bouton-icone" onClick={() => setForm({ type: 'op' })}>
            <IcPlus size={18} /> Opération
          </button>
      </div>
      <input ref={champ} type="file" hidden accept=".xlsx,.xls,.csv,.ods" onChange={lire} />
      {busy && <p className="muted">{busy}</p>}
      <Note>{error}</Note>

      <div className="suivi-total">
        <div className="suivi-total-tete">
          <span>Solde de l’année</span>
        </div>
        <strong className={d.solde < 0 ? 'rouge' : ''}>{fcfa(d.solde)}</strong>
        <small>{`Recettes encaissées moins dépenses payées depuis septembre`}</small>
        <div className="suivi-total-pied">
          <span>
            Recettes <b>{fcfa(d.recettes.total)}</b>
          </span>
          <span>
            Dépenses <b>{fcfa(d.depenses.payees)}</b>
          </span>
          {d.depenses.engagees > 0 && (
            <span>
              À payer <b>{fcfa(d.depenses.engagees)}</b>
            </span>
          )}
        </div>
      </div>

      <div className="segments" role="tablist">
        <button type="button" role="tab" aria-selected={vue === 'bord'} onClick={() => setVue('bord')}>
          Tableau de bord
        </button>
        <button type="button" role="tab" aria-selected={vue === 'ops'} onClick={() => setVue('ops')}>
          Opérations
        </button>
        <button type="button" role="tab" aria-selected={vue === 'budget'} onClick={() => setVue('budget')}>
          Budget
        </button>
      </div>

      {vide && vue !== 'budget' && (
        <button type="button" className="import-zone" onClick={() => champ.current?.click()}>
          <IcImport size={26} />
          <b>Importer le budget et le journal des dépenses</b>
          <small>Classeur Excel ou CSV avec les colonnes Poste, Nature, Montant (budget) et Date, Libellé, Montant (dépenses). Les paiements de scolarité sont déjà comptés automatiquement.</small>
        </button>
      )}

      {vue === 'bord' && (
        <>
          <div className="compta-kpis">
            <div className="compta-kpi">
              <span>Scolarité encaissée</span>
              <b>{fcfa(d.recettes.scolarite)}</b>
              <small>Paiements enregistrés dans Sùkûl</small>
            </div>
            <div className="compta-kpi">
              <span>Autres recettes</span>
              <b>{fcfa(d.recettes.autres)}</b>
              <small>Subventions, locations, dons…</small>
            </div>
            {d.budget.postes > 0 && (
              <>
                <div className="compta-kpi">
                  <span>Recettes prévues</span>
                  <b>{`${taux(d.recettes.total, d.budget.recettesPrevues)} %`}</b>
                  <small>{`de ${fcfa(d.budget.recettesPrevues)}`}</small>
                </div>
                <div className="compta-kpi">
                  <span>Budget dépensé</span>
                  <b>{`${taux(d.depenses.payees, d.budget.depensesPrevues)} %`}</b>
                  <small>{`de ${fcfa(d.budget.depensesPrevues)}`}</small>
                </div>
              </>
            )}
          </div>

          <p className="niveau-titre">Par mois</p>
          <div className="cpt-mois card">
            <div className="cpt-legende">
              <span className="recette">Recettes</span>
              <span className="depense">Dépenses</span>
            </div>
            <div className="cpt-colonnes">
              {d.mois.map((m) => (
                <div key={m.mois} title={`${nomMois(m.mois)} · recettes ${fcfa(m.recettes)} · dépenses ${fcfa(m.depenses)}`}>
                  <span className="cpt-barres">
                    <i className="recette" style={{ height: `${(m.recettes / maxMois) * 100}%` }} />
                    <i className="depense" style={{ height: `${(m.depenses / maxMois) * 100}%` }} />
                  </span>
                  <small>{court(m.mois)}</small>
                </div>
              ))}
            </div>
          </div>

          {d.categories.length > 0 && (
            <>
              <p className="niveau-titre">Dépenses par catégorie</p>
              <ul className="liste-simple cpt-cats">
                {d.categories.map((c) => (
                  <li key={c.nom}>
                    <span className="ls-texte">
                      <b>{c.nom}</b>
                      <small>{`${taux(c.total, totalCat)} % des dépenses`}</small>
                    </span>
                    <span className="suivi-taux">
                      <b>{fcfa(c.total)}</b>
                      <Barre valeur={taux(c.total, totalCat)} sens="part" />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {d.dernieres.length > 0 && (
            <>
              <p className="niveau-titre">Dernières opérations</p>
              <ul className="liste-simple">{d.dernieres.map(ligneOp)}</ul>
              <button type="button" className="lien-action cpt-ajout" onClick={() => setVue('ops')}>
                Tout le journal
              </button>
            </>
          )}
        </>
      )}

      {vue === 'ops' && !vide && (
        <>
          <div className="cpt-filtres">
            <div className="chips">
              {[
                ['tout', 'Tout'],
                ['depense', 'Dépenses'],
                ['recette', 'Recettes'],
              ].map(([k, v]) => (
                <button key={k} type="button" className="chip" aria-pressed={filtre === k} onClick={() => setFiltre(k)}>
                  {v}
                </button>
              ))}
            </div>
            <input className="input" type="search" placeholder="Rechercher un libellé, un bénéficiaire…" value={cherche} onChange={(e) => setCherche(e.target.value)} />
          </div>
          {lignesOps.length === 0 && <p className="muted">Aucune opération.</p>}
          {parMois.map((g) => (
            <section key={g.m}>
              <p className="niveau-titre suivi-niveau">
                <span>{nomMois(g.m)}</span>
                <span>{`${g.liste.length} · ${g.total < 0 ? '−' : '+'} ${fcfa(Math.abs(g.total))}`}</span>
              </p>
              <ul className="liste-simple">{g.liste.map(ligneOp)}</ul>
            </section>
          ))}
          <p className="muted cpt-note">Les paiements de scolarité n’apparaissent pas ici : ils sont suivis dans Scolarité et comptés automatiquement dans les recettes.</p>
        </>
      )}

      {vue === 'budget' && (
        <>
          {sectionPostes('recette')}
          {sectionPostes('depense')}
        </>
      )}

      <p className="suivi-liens">
        <a className="lien-discret" href="#/scolarite?onglet=suivi">
          Suivi de la scolarité
        </a>
        {!vide && (
          <button type="button" className="lien-discret" onClick={exporter}>
            Exporter en Excel
          </button>
        )}
      </p>

      {form?.type === 'op' && <FormOperation op={form.op} postes={postes} onFermer={() => setForm(null)} onFait={fait} />}
      {form?.type === 'poste' && <FormPoste poste={form.poste} sens={form.sens} onFermer={() => setForm(null)} onFait={fait} />}
    </>
  )
}
