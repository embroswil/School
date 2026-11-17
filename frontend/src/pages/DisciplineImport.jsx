import { useRef, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { Note, annoncer } from '../ui.jsx'
import { preparerDocument } from '../lecture-fichier.js'
import { useDepotPage } from '../depot.jsx'
import CompteurIA from '../CompteurIA.jsx'
import { IcImport } from '../icones.jsx'
import { comparerClasses, niveauClasse } from '../classes.js'
import { TYPES_SANCTION } from './Discipline.jsx'

const jour = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '')
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const GRAVITE = { observation: 'neutre', avertissement: 'neutre', retenue: 'neutre', convocation_parents: 'alerte', blame: 'alerte', exclusion_temporaire: 'alerte', exclusion_definitive: 'alerte' }

// Discipline : les sanctions de l'etablissement (par classe ou par date), et l'import d'un document
// (proces-verbal, liste de sanctions, rapport) lu automatiquement puis verifie avant l'enregistrement.
// Chaque parent concerne recoit un message detaille dans sa messagerie.
export default function DisciplineImport() {
  const { user } = useAuth()
  const admin = ['principal', 'admin'].includes(user.role)
  const champ = useRef(null)
  const liste = useApi(admin ? '/api/vie-scolaire/sanctions' : null)
  const [entrees, setEntrees] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [vue, setVue] = useState('classes')
  const [classe, setClasse] = useState('')

  async function lire(e) {
    const fichiers = [...(e.target.files || [])]
    e.target.value = ''
    if (!fichiers.length) return
    setError('')
    setEntrees(null)
    setBusy('Lecture du document…')
    try {
      const doc = await preparerDocument(fichiers)
      const r = await api.post('/api/vie-scolaire/sanctions/lire', doc)
      if (!r.data.length) throw new Error('Aucune sanction trouvée dans ce document.')
      setEntrees(r.data.map((x, i) => ({ ...x, cle: i, studentId: x.eleve?.id || '', garder: Boolean(x.eleve) })))
    } catch (err) {
      setError(err.message)
    }
    setBusy('')
  }
  const zoneDepot = useDepotPage(lire, { texte: 'Déposez le document de discipline', detail: 'PDF, Excel, Word ou photo' })
  const maj = (cle, champs) => setEntrees((l) => l && l.map((x) => (x.cle === cle ? { ...x, ...champs } : x)))

  async function enregistrer() {
    setError('')
    let faits = 0
    const erreurs = []
    const choisies = entrees.filter((y) => y.garder && y.studentId)
    for (const [k, x] of choisies.entries()) {
      setBusy(`Enregistrement ${k + 1} / ${choisies.length}…`)
      try {
        await api.post('/api/vie-scolaire/sanctions', {
          studentId: Number(x.studentId),
          type: x.type,
          motif: x.motif || TYPES_SANCTION[x.type],
          date: x.date,
          dureeJours: x.dureeJours,
        })
        faits++
      } catch (err) {
        erreurs.push(`${x.nomLu} : ${err.message}`)
      }
    }
    setBusy('')
    setEntrees(null)
    if (faits) annoncer(`${faits} sanction(s) enregistrée(s) · les parents ont reçu un message`)
    if (erreurs.length) setError(erreurs.join(' · '))
    liste.reload()
  }

  // ---------- verification d'un document lu ----------
  if (entrees) {
    const aVerifier = entrees.filter((x) => !x.eleve)
    const reconnues = [...entrees.filter((x) => x.eleve)].sort((a, b) => comparerClasses(a.eleve.classe || '', b.eleve.classe || '') || String(a.date).localeCompare(String(b.date)))
    const retenues = entrees.filter((x) => x.garder && x.studentId).length
    const ligne = (x) => (
      <li key={x.cle} className={x.garder ? '' : 'disc-ignore'}>
        <input type="checkbox" checked={x.garder} disabled={!x.studentId} onChange={(e) => maj(x.cle, { garder: e.target.checked })} aria-label="Enregistrer cette sanction" />
        <span className="ls-texte">
          <b data-brut>{x.eleve ? x.eleve.nom : x.nomLu}</b>
          <small>
            {[x.eleve?.classe || x.classeLue, jour(x.date), x.motif].filter(Boolean).join(' · ')}
          </small>
          {x.ouvert && (
            <span className="disc-edition">
              <select className="input" value={x.type} onChange={(e) => maj(x.cle, { type: e.target.value })}>
                {Object.entries(TYPES_SANCTION).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <input className="input" type="date" value={x.date} onChange={(e) => maj(x.cle, { date: e.target.value })} />
              <input className="input" value={x.motif} placeholder="Motif" onChange={(e) => maj(x.cle, { motif: e.target.value })} />
            </span>
          )}
          <span className="ls-actions">
            <button type="button" className="lien-action discret" onClick={() => maj(x.cle, { ouvert: !x.ouvert })}>
              {x.ouvert ? 'Fermer' : 'Modifier'}
            </button>
          </span>
        </span>
        <span className={`etiquette ${GRAVITE[x.type] || 'neutre'}`}>{TYPES_SANCTION[x.type]}</span>
      </li>
    )
    return (
      <>
        <div className="page-tete">
          <div>
            <h1 className="page-title">Discipline</h1>
            <p className="muted">{`${entrees.length} sanction(s) lue(s) · ${reconnues.length} élève(s) reconnu(s)`}</p>
          </div>
        </div>
        <div className="disc-barre">
          <button type="button" className="btn" disabled={Boolean(busy) || !retenues} onClick={enregistrer}>
            {busy || `Enregistrer ${retenues} sanction(s)`}
          </button>
          <button type="button" className="btn btn-quiet" disabled={Boolean(busy)} onClick={() => setEntrees(null)}>
            Annuler
          </button>
        </div>
        <p className="muted disc-info">Chaque parent concerné reçoit un message détaillé dans sa messagerie Sùkûl.</p>
        <Note>{error}</Note>

        {aVerifier.length > 0 && (
          <>
            <p className="niveau-titre">{`À vérifier · ${aVerifier.length}`}</p>
            {aVerifier.map((x) => (
              <div key={x.cle} className="doc-carte">
                <p className="disc-lu">
                  Lu : <b data-brut>{x.nomLu}</b>
                  {x.classeLue ? ` (${x.classeLue})` : ''} · {TYPES_SANCTION[x.type]}
                </p>
                <select className="input" value={x.studentId} onChange={(e) => maj(x.cle, { studentId: e.target.value, garder: Boolean(e.target.value) })}>
                  <option value="">{x.suggestions.length ? 'Choisir l’élève…' : 'Élève non retrouvé'}</option>
                  {x.suggestions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nom} {s.classe ? `· ${s.classe}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </>
        )}
        {reconnues.length > 0 && (
          <>
            <p className="niveau-titre">{`Élèves reconnus · ${reconnues.length}`}</p>
            <ul className="liste-simple disc-liste">{reconnues.map(ligne)}</ul>
          </>
        )}
      </>
    )
  }

  // ---------- sanctions enregistrees ----------
  const toutes = liste.data || []
  const parClasse = new Map()
  for (const s of toutes) {
    const c = s.classe || 'Sans classe'
    if (!parClasse.has(c)) parClasse.set(c, [])
    parClasse.get(c).push(s)
  }
  const niveaux = []
  for (const c of [...parClasse.keys()].sort(comparerClasses)) {
    const n = c === 'Sans classe' ? 'Autres' : niveauClasse(c)
    const dernier = niveaux[niveaux.length - 1]
    if (dernier && dernier.nom === n) dernier.classes.push(c)
    else niveaux.push({ nom: n, classes: [c] })
  }
  const mois = []
  for (const s of toutes) {
    const d = new Date(`${String(s.date_faits).slice(0, 10)}T12:00:00`)
    const cle = `${MOIS[d.getMonth()]} ${d.getFullYear()}`
    if (!mois.length || mois[mois.length - 1].cle !== cle) mois.push({ cle, liste: [] })
    mois[mois.length - 1].liste.push(s)
  }
  const ceMois = toutes.filter((s) => String(s.date_faits).slice(0, 7) === new Date().toISOString().slice(0, 7)).length
  const ligneSanction = (s, avecClasse) => (
    <li key={s.id}>
      <span className="ls-texte">
        <b data-brut>
          {s.last_name} {s.first_name}
        </b>
        <small>
          {[avecClasse ? s.classe : '', jour(s.date_faits), s.motif, s.duree_jours ? `${s.duree_jours} j` : ''].filter(Boolean).join(' · ')}
          {s.parents ? '' : ' · aucun parent relié'}
        </small>
      </span>
      <span className={`etiquette ${GRAVITE[s.type] || 'neutre'}`}>{s.libelle}</span>
    </li>
  )

  return (
    <>
      {zoneDepot}
      <div className="page-tete">
        <div>
          <h1 className="page-title">Discipline</h1>
          {admin && liste.data && <p className="muted">{toutes.length ? `${toutes.length} sanction(s) · ${ceMois} ce mois` : 'Aucune sanction enregistrée'}</p>}
        </div>
        <button type="button" className="btn bouton-icone" disabled={Boolean(busy)} onClick={() => champ.current?.click()}>
          <IcImport size={18} /> Importer
        </button>
      </div>
      <input ref={champ} type="file" hidden multiple accept=".pdf,.xlsx,.xls,.csv,.ods,.docx,image/*" onChange={lire} />
      <CompteurIA discret />
      {busy && <p className="muted">{busy}</p>}
      <Note>{error}</Note>

      {(!admin || (liste.data && toutes.length === 0)) && !busy && (
        <button type="button" className="import-zone" onClick={() => champ.current?.click()}>
          <IcImport size={26} />
          <b>Importer un document de discipline</b>
          <small>Procès-verbal du conseil de discipline, liste de sanctions ou rapport : Excel, Word, PDF ou photo. Les élèves sont reconnus et chaque parent reçoit un message.</small>
        </button>
      )}

      {admin && toutes.length > 0 && (
        <>
          <div className="segments" role="tablist">
            <button type="button" role="tab" aria-selected={vue === 'classes'} onClick={() => setVue('classes')}>
              Par classe
            </button>
            <button type="button" role="tab" aria-selected={vue === 'dates'} onClick={() => setVue('dates')}>
              Par date
            </button>
          </div>

          {vue === 'classes' && !classe &&
            niveaux.map((n) => (
              <section className="eleves-niveau" key={n.nom}>
                <h2>{n.nom}</h2>
                <div className="eleves-classes">
                  {n.classes.map((c) => (
                    <button type="button" key={c} onClick={() => setClasse(c)}>
                      <b>{c}</b>
                      <small>{`${parClasse.get(c).length} sanction(s)`}</small>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          {vue === 'classes' && classe && (
            <>
              <div className="eleves-barre">
                <button type="button" className="back" onClick={() => setClasse('')}>
                  ← Toutes les classes
                </button>
              </div>
              <h2 className="eleves-titre">
                {classe}
                <small>{`${(parClasse.get(classe) || []).length} sanction(s)`}</small>
              </h2>
              <ul className="liste-simple">{(parClasse.get(classe) || []).map((s) => ligneSanction(s, false))}</ul>
            </>
          )}

          {vue === 'dates' &&
            mois.map((m) => (
              <section key={m.cle}>
                <p className="niveau-titre">{`${m.cle} · ${m.liste.length}`}</p>
                <ul className="liste-simple">{m.liste.map((s) => ligneSanction(s, true))}</ul>
              </section>
            ))}
        </>
      )}
    </>
  )
}
