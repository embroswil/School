import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'
import { IcChevron } from '../icones.jsx'
import { exporterExcel } from '../export.jsx'
import { comparerClasses, niveauClasse } from '../classes.js'

const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`
const taux = (e, a) => (Number(a) > 0 ? Math.round((Number(e) / Number(a)) * 100) : 0)
const CATEGORIES = { scolarite: 'Scolarité / pension', inscription: 'Inscription', apee: 'APEE / APE', examen: 'Examens', tenue: 'Tenue scolaire', cantine: 'Cantine', transport: 'Transport', activite: 'Activités / sorties', autre: 'Autre' }
const jour = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Sans échéance')

function Barre({ valeur }) {
  return (
    <span className="suivi-barre" aria-hidden="true">
      <i style={{ width: `${Math.min(100, valeur)}%` }} className={valeur >= 80 ? '' : valeur >= 50 ? 'moyen' : 'faible'} />
    </span>
  )
}

// Eleves d'une classe : ce que chacun doit encore, frais par frais
function DetailClasse({ classe, enRetard, onRappel }) {
  const d = useApi(`/api/scolarite/comptabilite/eleves?classe=${encodeURIComponent(classe)}`)
  const eleves = []
  const idx = new Map()
  for (const l of d.data || []) {
    if (!idx.has(l.id)) {
      const e = { id: l.id, nom: `${l.last_name} ${l.first_name}`, frais: [], reste: 0, retard: false }
      idx.set(l.id, e)
      eleves.push(e)
    }
    const e = idx.get(l.id)
    e.frais.push(l)
    e.reste += l.reste
    if (l.en_retard) e.retard = true
  }
  const aRegler = eleves.filter((e) => e.reste > 0).sort((a, b) => b.reste - a.reste)
  return (
    <div className="suivi-detail">
      {d.loading && <p className="muted">Chargement…</p>}
      {enRetard > 0 && (
        <button type="button" className="lien-action" onClick={() => onRappel(classe)}>
          Rappeler les parents en retard
        </button>
      )}
      {!d.loading && aRegler.length === 0 && <p className="muted">Tous les élèves de la classe sont à jour.</p>}
      {aRegler.map((e) => (
        <details key={e.id}>
          <summary>
            <b data-brut>{e.nom}</b>
            <span className={e.retard ? 'rouge' : ''}>{fcfa(e.reste)}</span>
          </summary>
          <ul>
            {e.frais
              .filter((f) => f.reste > 0)
              .map((f) => (
                <li key={f.frais}>
                  <span>
                    {f.frais}
                    <small>{f.echeance ? `avant le ${jour(f.echeance)}` : 'sans échéance'}</small>
                  </span>
                  <b className={f.en_retard ? 'rouge' : ''}>{fcfa(f.reste)}</b>
                </li>
              ))}
          </ul>
          <a href={`#/eleves/${e.id}`}>Fiche de l’élève</a>
        </details>
      ))}
    </div>
  )
}

// Classes regroupees par niveau (6e, 5e… Tle), avec les totaux du niveau
function niveauxDe(classes) {
  const niveaux = []
  for (const c of classes) {
    const nom = niveauClasse(c.classe)
    let n = niveaux[niveaux.length - 1]
    if (!n || n.nom !== nom) niveaux.push((n = { nom, classes: [], attendu: 0, encaisse: 0, reste: 0 }))
    n.classes.push(c)
    n.attendu += Number(c.attendu)
    n.encaisse += Number(c.encaisse)
    n.reste += Number(c.reste)
  }
  return niveaux
}

// Suivi de la scolarite : ce qui est encaisse, ce qui reste, par classe et par type de frais
export default function Comptabilite() {
  const c = useApi('/api/scolarite/comptabilite')
  const [ouverte, setOuverte] = useState(null)
  const [vue, setVue] = useState('classes')
  const [info, setInfo] = useState('')
  const [error, setError] = useState('')
  const d = c.data
  if (c.loading && !d) return <p className="muted">Chargement…</p>
  if (c.error) return <Note>{c.error}</Note>
  if (!d) return null
  const t = d.totaux
  const tx = taux(t.encaisse, t.attendu)
  const classes = [...d.classes].sort((a, b) => comparerClasses(a.classe, b.classe))

  async function rappeler(classe) {
    setInfo('')
    setError('')
    if (!window.confirm(classe ? `Envoyer un rappel aux parents des élèves en retard de ${classe} ?` : 'Envoyer un rappel aux parents de tous les élèves en retard ?')) return
    try {
      const r = await api.post('/api/scolarite/relancer', classe ? { classe } : {})
      setInfo(`Rappel envoyé à ${r.data.parents} parent(s).`)
    } catch (err) {
      setError(err.message)
    }
  }

  async function exporter() {
    const detail = (await api.get('/api/scolarite/comptabilite/eleves')).data
    await exporterExcel('scolarite', [
      { nom: 'Par classe', lignes: classes.map((x) => ({ Classe: x.classe, Effectif: x.effectif, 'Attendu (FCFA)': Number(x.attendu), 'Encaissé (FCFA)': Number(x.encaisse), 'Reste (FCFA)': Number(x.reste), 'Taux (%)': taux(x.encaisse, x.attendu), 'Élèves en retard': x.en_retard })) },
      { nom: 'Par type de frais', lignes: d.frais.map((x) => ({ Frais: x.nom, Type: CATEGORIES[x.categorie], Échéance: x.echeance ? jour(x.echeance) : 'Sans échéance', 'Attendu (FCFA)': Number(x.attendu), 'Encaissé (FCFA)': Number(x.encaisse), 'Reste (FCFA)': Number(x.reste), 'Taux (%)': taux(x.encaisse, x.attendu) })) },
      { nom: 'Élèves', lignes: detail.map((l) => ({ Classe: l.classe, Nom: l.last_name, 'Prénom(s)': l.first_name, Frais: l.frais, 'Montant (FCFA)': l.montant, 'Payé (FCFA)': l.paye, 'Reste (FCFA)': l.reste, 'En retard': l.en_retard ? 'Oui' : '' })) },
    ])
  }

  if (!d.categories.length) {
    return (
      <div className="vide">
        <b>Aucun frais défini</b>
        <small>Ajoutez vos frais de scolarité : le suivi des paiements se calcule automatiquement.</small>
      </div>
    )
  }

  return (
    <>
      <div className="suivi-total">
        <div className="suivi-total-tete">
          <span>Encaissé</span>
          <b>{tx} %</b>
        </div>
        <strong>{fcfa(t.encaisse)}</strong>
        <small>sur {fcfa(t.attendu)} attendus</small>
        <Barre valeur={tx} />
        <div className="suivi-total-pied">
          <span>
            Reste <b className={t.reste ? 'rouge' : ''}>{fcfa(t.reste)}</b>
          </span>
          <span>
            En retard <b className={t.enRetard ? 'rouge' : ''}>{t.enRetard.toLocaleString('fr-FR')} élève(s)</b>
          </span>
        </div>
      </div>
      <Note kind="ok">{info}</Note>
      <Note>{error}</Note>
      {t.enRetard > 0 && (
        <button type="button" className="btn btn-quiet btn-block" style={{ marginBottom: 14 }} onClick={() => rappeler(null)}>
          Rappeler tous les parents en retard
        </button>
      )}

      <div className="segments petit" role="tablist">
        <button type="button" role="tab" aria-selected={vue === 'classes'} onClick={() => setVue('classes')}>
          Par classe
        </button>
        <button type="button" role="tab" aria-selected={vue === 'frais'} onClick={() => setVue('frais')}>
          Par frais
        </button>
      </div>

      {vue === 'classes' &&
        niveauxDe(classes).map((n) => (
          <section key={n.nom}>
            <p className="niveau-titre suivi-niveau">
              <span>{n.nom}</span>
              <span>{`${taux(n.encaisse, n.attendu)} % · reste ${fcfa(n.reste)}`}</span>
            </p>
        <ul className="liste-simple">
          {n.classes.map((x) => {
            const ouvert = ouverte === x.classe
            const tc = taux(x.encaisse, x.attendu)
            return (
              <li key={x.classe} className="suivi-ligne">
                <button type="button" onClick={() => setOuverte(ouvert ? null : x.classe)} aria-expanded={ouvert}>
                  <span className="ls-texte">
                    <b>{x.classe}</b>
                    <small>
                      Reste {fcfa(x.reste)}
                      {x.en_retard ? ` · ${x.en_retard} en retard` : ''}
                    </small>
                  </span>
                  <span className="suivi-taux">
                    <b>{tc} %</b>
                    <Barre valeur={tc} />
                  </span>
                  <IcChevron size={16} style={{ transform: ouvert ? 'rotate(90deg)' : 'none' }} />
                </button>
                {ouvert && <DetailClasse classe={x.classe} enRetard={x.en_retard} onRappel={rappeler} />}
              </li>
            )
          })}
        </ul>
          </section>
        ))}

      {vue === 'frais' && (
        <ul className="liste-simple">
          {d.frais.map((f) => {
            const tf = taux(f.encaisse, f.attendu)
            return (
              <li key={f.id} className="suivi-ligne">
                <div className="suivi-ligne-fixe">
                  <span className="ls-texte">
                    <b>{f.nom}</b>
                    <small>
                      {CATEGORIES[f.categorie]} · reste {fcfa(f.reste)}
                    </small>
                  </span>
                  <span className="suivi-taux">
                    <b>{tf} %</b>
                    <Barre valeur={tf} />
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <p className="suivi-liens">
        <button
          type="button"
          className="lien-discret"
          onClick={() => {
            try {
              sessionStorage.setItem('sukul-documents-dossier', 'Administration')
            } catch (_) {
              /* stockage indisponible */
            }
            window.location.hash = '/document'
          }}
        >
          Budget et documents comptables
        </button>
        <button type="button" className="lien-discret" onClick={exporter}>
          Exporter en Excel
        </button>
      </p>
    </>
  )
}
