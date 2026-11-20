import { Fragment, useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'
import { IcChevron } from '../icones.jsx'
import { exporterExcel } from '../export.jsx'
import { comparerClasses, niveauClasse } from '../classes.js'
import { avisRelanceHtml, imprimer } from '../impression.js'

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

const nb = (n) => Number(n || 0).toLocaleString('fr-FR')

// Avis de relance a imprimer (une page A5 par eleve en retard), pour une classe ou tout l'etablissement
async function imprimerAvis(classe, setError) {
  try {
    const d = (await api.get(`/api/scolarite/avis-relance${classe ? `?classe=${encodeURIComponent(classe)}` : ''}`)).data
    if (!d.eleves.length) return setError('Aucun élève en retard : aucun avis à imprimer.')
    imprimer(avisRelanceHtml(d), 'a5')
  } catch (err) {
    setError(err.message)
  }
}

// Relances des parents : automatiques (avant et apres chaque echeance), ou a la demande ; avis imprimables
function Relances({ enRetard, onRappel, setError }) {
  const r = useApi('/api/scolarite/relances')
  const [auto, setAuto] = useState(null)
  const actif = auto ?? r.data?.auto ?? false
  async function basculer() {
    const v = !actif
    if (v && !window.confirm('Activer les relances automatiques ? Les parents seront prévenus 3 jours avant chaque échéance, puis 1, 8 et 15 jours après si les frais ne sont pas payés. Les parents déjà en retard recevront une première relance dans la journée.')) return
    setAuto(v)
    try {
      await api.put('/api/scolarite/relances', { auto: v })
    } catch (err) {
      setAuto(!v)
      setError(err.message)
    }
  }
  return (
    <div className="relances">
      <button type="button" className="relances-ligne" onClick={basculer} disabled={!r.data}>
        <span>
          <b>Relances automatiques</b>
          <small>3 jours avant chaque échéance, puis 1, 8 et 15 jours après, tant que les frais ne sont pas payés</small>
        </span>
        <span className={`interrupteur ${actif ? 'on' : ''}`} role="switch" aria-checked={actif}>
          <i />
        </span>
      </button>
      {r.data?.eleves30j > 0 && <small>{`${nb(r.data.eleves30j)} élève(s) relancé(s) ces 30 derniers jours`}</small>}
      {enRetard > 0 && (
        <div className="relances-actions">
          <button type="button" className="btn btn-quiet" onClick={() => onRappel(null)}>
            Rappeler maintenant
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => imprimerAvis(null, setError)}>
            {`Imprimer les avis (${nb(enRetard)})`}
          </button>
        </div>
      )}
    </div>
  )
}
const STATUTS = { solde: ['À jour', 'ok'], partiel: ['Partiel', 'neutre'], retard: ['En retard', 'alerte'], rien: ['Rien payé', 'alerte'] }

// Eleves d'une classe, en tableau : paye, reste et situation ; une ligne s'ouvre sur le detail des frais
function DetailClasse({ ligne, onRetour, onRappel, setError }) {
  const d = useApi(`/api/scolarite/comptabilite/eleves?classe=${encodeURIComponent(ligne.classe)}`)
  const [ouvert, setOuvert] = useState(null)
  const eleves = []
  const idx = new Map()
  for (const l of d.data || []) {
    if (!idx.has(l.id)) {
      const e = { id: l.id, nom: `${l.last_name} ${l.first_name}`, frais: [], du: 0, paye: 0, reste: 0, retard: false }
      idx.set(l.id, e)
      eleves.push(e)
    }
    const e = idx.get(l.id)
    e.frais.push(l)
    e.du += Number(l.montant)
    e.paye += Number(l.paye)
    e.reste += Number(l.reste)
    if (l.en_retard) e.retard = true
  }
  for (const e of eleves) e.statut = e.reste === 0 ? 'solde' : e.paye === 0 ? 'rien' : e.retard ? 'retard' : 'partiel'
  eleves.sort((a, b) => b.reste - a.reste || a.nom.localeCompare(b.nom))
  const tc = taux(ligne.encaisse, ligne.attendu)
  return (
    <>
      <button type="button" className="back" onClick={onRetour}>
        ← Toutes les classes
      </button>
      <div className="tab-entete">
        <div>
          <h2>{ligne.classe}</h2>
          <small>{`${nb(ligne.effectif)} élèves · ${fcfa(ligne.encaisse)} encaissés sur ${fcfa(ligne.attendu)}`}</small>
        </div>
        <b>{tc} %</b>
      </div>
      <Barre valeur={tc} />
      <div className="tab-chiffres">
        <span>
          <b>{nb(eleves.filter((e) => e.statut === 'solde').length)}</b> à jour
        </span>
        <span>
          <b>{nb(eleves.filter((e) => e.statut === 'partiel' || e.statut === 'retard').length)}</b> partiels
        </span>
        <span>
          <b className="rouge">{nb(eleves.filter((e) => e.statut === 'rien').length)}</b> rien payé
        </span>
        <span>
          Reste <b className={ligne.reste ? 'rouge' : ''}>{fcfa(ligne.reste)}</b>
        </span>
      </div>
      {ligne.en_retard > 0 && (
        <div className="relances-actions tab-rappel">
          <button type="button" className="btn btn-quiet" onClick={() => onRappel(ligne.classe)}>
            {`Rappeler les parents en retard (${ligne.en_retard})`}
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => imprimerAvis(ligne.classe, setError)}>
            Imprimer les avis de relance
          </button>
        </div>
      )}
      {d.loading && <p className="muted">Chargement…</p>}
      {eleves.length > 0 && (
        <div className="tab-cadre">
          <table className="tab-pro">
            <thead>
              <tr>
                <th>Élève</th>
                <th className="nombre col-ordi">Dû</th>
                <th className="nombre">Payé</th>
                <th className="nombre">Reste</th>
                <th>Situation</th>
              </tr>
            </thead>
            <tbody>
              {eleves.map((e) => (
                <Fragment key={e.id}>
                  <tr className={`cliquable ${ouvert === e.id ? 'ouvert' : ''}`} onClick={() => setOuvert(ouvert === e.id ? null : e.id)}>
                    <td data-brut>{e.nom}</td>
                    <td className="nombre col-ordi">{nb(e.du)}</td>
                    <td className="nombre">{nb(e.paye)}</td>
                    <td className={`nombre ${e.reste ? 'rouge' : ''}`}>{e.reste ? nb(e.reste) : '—'}</td>
                    <td>
                      <span className={`etiquette ${STATUTS[e.statut][1]}`}>{STATUTS[e.statut][0]}</span>
                    </td>
                  </tr>
                  {ouvert === e.id && (
                    <tr className="tab-detail">
                      <td colSpan={5}>
                        <table>
                          <tbody>
                            {e.frais.map((x) => (
                              <tr key={x.frais}>
                                <td>
                                  {x.frais}
                                  <small>{x.echeance ? `avant le ${jour(x.echeance)}` : 'sans échéance'}</small>
                                </td>
                                <td className="nombre">{`${nb(x.paye)} / ${nb(x.montant)}`}</td>
                                <td className={`nombre ${x.reste ? (x.en_retard ? 'rouge' : '') : 'vert'}`}>{x.reste ? nb(x.reste) : 'Payé'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <span className="suivi-liens-eleve">
                          <a href={`#/eleves/${e.id}`}>Fiche de l’élève</a>
                          <a href={`#/releve/${e.id}`}>Relevé des paiements</a>
                        </span>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="tab-unite">Montants en FCFA</p>
    </>
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
  const [niveaux, setNiveaux] = useState({}) // niveaux deplies (6e, 5e…) : leurs classes s'affichent
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
      <Relances enRetard={t.enRetard} onRappel={rappeler} setError={setError} />

      <div className="segments petit" role="tablist">
        <button type="button" role="tab" aria-selected={vue === 'classes'} onClick={() => setVue('classes')}>
          Par classe
        </button>
        <button type="button" role="tab" aria-selected={vue === 'frais'} onClick={() => setVue('frais')}>
          Par frais
        </button>
      </div>

      {vue === 'classes' && ouverte && (
        <DetailClasse ligne={classes.find((x) => x.classe === ouverte)} onRetour={() => setOuverte(null)} onRappel={rappeler} setError={setError} />
      )}
      {vue === 'classes' && !ouverte && (
        <>
          <div className="tab-cadre">
            <table className="tab-pro">
              <thead>
                <tr>
                  <th>Classe</th>
                  <th className="nombre col-ordi">Élèves</th>
                  <th className="nombre col-ordi">Attendu</th>
                  <th className="nombre col-ordi">Encaissé</th>
                  <th className="nombre">Reste</th>
                  <th className="nombre">Taux</th>
                  <th className="nombre">Retard</th>
                </tr>
              </thead>
              {niveauxDe(classes).map((n) => (
                <tbody key={n.nom}>
                  <tr className={`tab-niveau cliquable ${niveaux[n.nom] ? 'ouvert' : ''}`} onClick={() => setNiveaux((x) => ({ ...x, [n.nom]: !x[n.nom] }))} aria-expanded={Boolean(niveaux[n.nom])}>
                    <td>
                      <span className="tab-niveau-nom">
                        <IcChevron size={14} className="tab-niveau-fleche" />
                        {n.nom}
                        <small>{`${n.classes.length} classe${n.classes.length > 1 ? 's' : ''}`}</small>
                      </span>
                    </td>
                    <td className="nombre col-ordi">{nb(n.classes.reduce((a, x) => a + Number(x.effectif), 0))}</td>
                    <td className="nombre col-ordi">{nb(n.attendu)}</td>
                    <td className="nombre col-ordi">{nb(n.encaisse)}</td>
                    <td className="nombre">{nb(n.reste)}</td>
                    <td className="nombre">{`${taux(n.encaisse, n.attendu)} %`}</td>
                    <td className="nombre">{nb(n.classes.reduce((a, x) => a + Number(x.en_retard), 0))}</td>
                  </tr>
                  {niveaux[n.nom] && n.classes.map((x) => {
                    const tc = taux(x.encaisse, x.attendu)
                    return (
                      <tr key={x.classe} className="cliquable" onClick={() => setOuverte(x.classe)}>
                        <td>{x.classe}</td>
                        <td className="nombre col-ordi">{nb(x.effectif)}</td>
                        <td className="nombre col-ordi">{nb(x.attendu)}</td>
                        <td className="nombre col-ordi">{nb(x.encaisse)}</td>
                        <td className={`nombre ${x.reste ? '' : 'vert'}`}>{x.reste ? nb(x.reste) : '—'}</td>
                        <td className="nombre">
                          <span className="tab-taux">
                            {tc} %
                            <Barre valeur={tc} />
                          </span>
                        </td>
                        <td className={`nombre ${x.en_retard ? 'rouge' : ''}`}>{x.en_retard ? nb(x.en_retard) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              ))}
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="nombre col-ordi">{nb(classes.reduce((a, x) => a + Number(x.effectif), 0))}</td>
                  <td className="nombre col-ordi">{nb(t.attendu)}</td>
                  <td className="nombre col-ordi">{nb(t.encaisse)}</td>
                  <td className="nombre">{nb(t.reste)}</td>
                  <td className="nombre">{`${tx} %`}</td>
                  <td className="nombre">{nb(classes.reduce((a, x) => a + Number(x.en_retard), 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="tab-unite">Montants en FCFA · touchez un niveau pour voir ses classes, puis une classe pour voir ses élèves</p>
        </>
      )}

      {vue === 'frais' && (
        <>
          <div className="tab-cadre">
            <table className="tab-pro">
              <thead>
                <tr>
                  <th>Frais</th>
                  <th className="col-ordi">Échéance</th>
                  <th className="nombre col-ordi">Attendu</th>
                  <th className="nombre">Encaissé</th>
                  <th className="nombre">Reste</th>
                  <th className="nombre">Taux</th>
                </tr>
              </thead>
              <tbody>
                {d.frais.map((f) => {
                  const tf = taux(f.encaisse, f.attendu)
                  return (
                    <tr key={f.id}>
                      <td>
                        {f.nom}
                        <small>{CATEGORIES[f.categorie]}</small>
                      </td>
                      <td className="col-ordi">{f.echeance ? jour(f.echeance) : '—'}</td>
                      <td className="nombre col-ordi">{nb(f.attendu)}</td>
                      <td className="nombre">{nb(f.encaisse)}</td>
                      <td className={`nombre ${Number(f.reste) ? 'rouge' : 'vert'}`}>{Number(f.reste) ? nb(f.reste) : '—'}</td>
                      <td className="nombre">
                        <span className="tab-taux">
                          {tf} %
                          <Barre valeur={tf} />
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="tab-unite">Montants en FCFA</p>
        </>
      )}

      <p className="suivi-liens">
        <button type="button" className="lien-discret" onClick={exporter}>
          Exporter en Excel
        </button>
      </p>
    </>
  )
}
