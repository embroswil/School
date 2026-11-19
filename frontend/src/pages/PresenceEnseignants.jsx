import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'
import { IcChevron, IcImport } from '../icones.jsx'
import { demandeAppel } from './Appel.jsx'
import { comparerClasses, niveauClasse } from '../classes.js'

const enChaine = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const aujourdhui = () => enChaine(new Date())
const decaler = (jour, n) => {
  const d = new Date(`${jour}T12:00:00`)
  d.setDate(d.getDate() + n)
  return enChaine(d)
}
const jourLisible = (jour) => {
  if (jour === aujourdhui()) return 'Aujourd’hui'
  if (jour === decaler(aujourdhui(), -1)) return 'Hier'
  return new Date(`${jour}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}
const ETAT = {
  assure: ['Confirmé', 'ok'],
  a_verifier: ['À vérifier', 'gris'],
  absent: ['Absent', 'alerte'],
  absent_prevu: ['Absence prévue', 'alerte'],
  en_cours: ['En cours', 'encours'],
  a_venir: ['À venir', 'neutre'],
}
const heureDe = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Douala' })
// Ce qui confirme le cours (l'appel n'est qu'un signal parmi d'autres)
const signauxDe = (c) =>
  [
    c.signaux.includes('confirme') && `Confirmé par l’enseignant à ${heureDe(c.confirme_le)}`,
    c.signaux.includes('cahier') && 'Cahier de textes rempli',
    c.signaux.includes('appel') && 'Appel fait',
    c.signaux.includes('ronde') && 'Présence constatée par la direction',
    c.signaux.includes('liste') && 'Liste de l’établissement',
    c.constat === 'absent' && (c.constat_source === 'liste' ? 'Absent sur la liste de l’établissement' : 'Absence constatée par la direction'),
  ].filter(Boolean)
const SOURCE_ABSENCE = { enseignant: 'Signalée par l’enseignant', liste: 'Liste de l’établissement', direction: 'Marquée par la direction' }

// Enseignants : la journee (cours, appels, absences), l'equipe, et le bilan sur 30 jours.
// Un seul bouton « Importer » pour la liste des enseignants (Excel, PDF, Word ou photo).
export default function PresenceEnseignants() {
  const [onglet, setOnglet] = useState('jour')
  const [date, setDate] = useState(aujourdhui())
  const d = useApi(onglet === 'equipe' ? null : `/api/presence-enseignants?date=${date}`)
  const equipe = useApi('/api/etablissement/enseignants/attendus')
  const actifs = useApi('/api/etablissement/enseignants')
  const tableau = useApi('/api/etablissement/tableau')
  const [error, setError] = useState('')
  const [classeEq, setClasseEq] = useState('')
  const [classeJ, setClasseJ] = useState('')
  const [qEq, setQEq] = useState('')
  const v = d.data
  const attente = tableau.data?.enseignants_attente || 0

  // Ronde de la direction : present, absent, ou annuler le constat
  async function constater(c, etat) {
    let note = ''
    if (etat === 'absent') {
      note = window.prompt(`${c.last_name ? `${c.first_name} ${c.last_name}` : 'L’enseignant'} absent(e) à ce cours (${c.classe}, ${c.debut}). Remarque (facultatif) :`, '')
      if (note === null) return
    }
    try {
      await api.post('/api/presence-enseignants/constat', { classId: c.class_id, debut: c.debut, date, etat, note })
      d.reload()
    } catch (err) {
      setError(err.message)
    }
  }
  async function retirerAbsence(id) {
    await api.delete(`/api/presence-enseignants/${id}`)
    d.reload()
  }
  async function retirerDeLaListe(id) {
    if (!window.confirm('Retirer cet enseignant de la liste ? Son compte, s’il existe, n’est pas supprimé.')) return
    await api.delete(`/api/etablissement/enseignants/attendus/${id}`)
    equipe.reload()
  }

  // Equipe : la liste importee, completee des comptes actifs qui n'y figurent pas
  const membres = (() => {
    const liste = (equipe.data || []).map((a) => ({
      cle: `l${a.id}`,
      idListe: a.id,
      nom: `${a.last_name} ${a.first_name || ''}`.trim(),
      matiere: a.matieres,
      classes: a.classes,
      pp: a.principal_de || '',
      etat: !a.a_un_compte ? 'sans' : a.status === 'active' ? 'actif' : 'attente',
      userId: a.user_id,
    }))
    const deja = new Set(liste.map((m) => m.userId).filter(Boolean))
    for (const u of actifs.data || []) {
      if (!deja.has(u.id)) liste.push({ cle: `u${u.id}`, nom: `${u.last_name} ${u.first_name || ''}`.trim(), matiere: u.matieres, classes: u.classes, etat: 'actif' })
    }
    return liste.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
  })()
  const ETAT_COMPTE = { actif: ['Compte actif', 'ok'], attente: ['À valider', 'alerte'], sans: ['Sans compte', 'neutre'] }
  // Equipe rangee par classe : chaque classe et ses enseignants
  const listeDe = (t) => String(t || '').split(',').map((c) => c.trim()).filter(Boolean)
  const parClasse = new Map()
  for (const m of membres) for (const c of listeDe(m.classes)) (parClasse.get(c) || parClasse.set(c, []).get(c)).push(m)
  const sansClasse = membres.filter((m) => !listeDe(m.classes).length)
  const niveauxEq = []
  for (const c of [...parClasse.keys()].sort(comparerClasses)) {
    const n = niveauClasse(c)
    const dernier = niveauxEq[niveauxEq.length - 1]
    if (dernier && dernier.nom === n) dernier.classes.push(c)
    else niveauxEq.push({ nom: n, classes: [c] })
  }
  const sansAcc = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const trouves = qEq.trim().length >= 2 ? membres.filter((m) => sansAcc(`${m.nom} ${m.matiere}`).includes(sansAcc(qEq.trim()))) : null
  const equipeClasse = classeEq === '__sans' ? sansClasse : [...(parClasse.get(classeEq) || [])].sort((a, b) => String(a.matiere).localeCompare(String(b.matiere), 'fr') || a.nom.localeCompare(b.nom, 'fr'))
  const ligneMembre = (m, { retirer, classe } = {}) => (
    <li key={m.cle}>
      <span className="ls-texte">
        <b data-brut>{m.nom}</b>
        <small>{classe ? m.matiere || '—' : [m.matiere, m.classes].filter(Boolean).join(' · ') || '—'}</small>
        {retirer && m.idListe && (
          <span className="ls-actions">
            <button type="button" className="lien-action discret" onClick={() => retirerDeLaListe(m.idListe)}>
              Retirer de la liste
            </button>
          </span>
        )}
      </span>
      <span className="eq-etiquettes">
        {classe && m.pp === classe && <span className="etiquette ok">Prof. principal</span>}
        {m.etat !== 'actif' && !(classe && m.etat === 'sans') && <span className={`etiquette ${(ETAT_COMPTE[m.etat] || ETAT_COMPTE.sans)[1]}`}>{(ETAT_COMPTE[m.etat] || ETAT_COMPTE.sans)[0]}</span>}
      </span>
    </li>
  )
  const nb = (e) => v?.cours.filter((c) => c.etat === e).length || 0
  const aVerifier = nb('a_verifier')
  const absentsCours = nb('absent') + nb('absent_prevu')
  const enCours = (v?.cours || []).filter((c) => c.etat === 'en_cours' || (v?.maintenant && c.debut <= v.maintenant && v.maintenant < c.fin))
  // Journee rangee par classe
  const coursParClasse = new Map()
  for (const c of v?.cours || []) (coursParClasse.get(c.classe) || coursParClasse.set(c.classe, []).get(c.classe)).push(c)
  const niveauxJ = []
  for (const c of [...coursParClasse.keys()].sort(comparerClasses)) {
    const n = niveauClasse(c)
    const dernier = niveauxJ[niveauxJ.length - 1]
    if (dernier && dernier.nom === n) dernier.classes.push(c)
    else niveauxJ.push({ nom: n, classes: [c] })
  }
  const coursVus =
    classeJ === '__verifier' ? (v?.cours || []).filter((c) => c.etat === 'a_verifier') : classeJ === '__maintenant' ? enCours : coursParClasse.get(classeJ) || []
  const TITRE_VUE = { __verifier: 'Cours à vérifier', __maintenant: 'Cours en ce moment' }

  return (
    <>
      <div className="page-tete">
        <div>
          <h1 className="page-title">Enseignants</h1>
          {tableau.data && <p className="muted">{membres.length ? `${membres.length} enseignant(s) · ${membres.filter((m) => m.etat === 'actif').length} compte(s) actif(s)` : `${tableau.data.enseignants} enseignant(s) actif(s)`}</p>}
        </div>
        <a className="btn bouton-icone" href="#/import-enseignants">
          <IcImport size={18} /> Importer
        </a>
      </div>

      {attente > 0 && (
        <a className="encart-alerte" href="#/enseignants">
          <span>
            <b>{attente} compte(s) enseignant à valider</b>
            <small>Vérifiez et validez les nouveaux comptes</small>
          </span>
          <IcChevron size={18} />
        </a>
      )}

      <div className="segments" role="tablist">
        {[
          ['jour', 'Journée'],
          ['equipe', 'Équipe'],
          ['bilan', 'Bilan 30 jours'],
        ].map(([k, t]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={onglet === k}
            onClick={() => {
              setOnglet(k)
              setClasseEq('')
              setClasseJ('')
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <Note>{error || d.error || equipe.error}</Note>

      {onglet === 'jour' && (
        <>
          <div className="jour-nav">
            <button type="button" aria-label="Jour précédent" onClick={() => { setClasseJ(''); setDate(decaler(date, -1)) }}>
              <IcChevron size={18} style={{ transform: 'rotate(180deg)' }} />
            </button>
            <label>
              <span>{jourLisible(date)}</span>
              <input type="date" value={date} max={aujourdhui()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Choisir une date" />
            </label>
            <button type="button" aria-label="Jour suivant" disabled={date >= aujourdhui()} onClick={() => { setClasseJ(''); setDate(decaler(date, 1)) }}>
              <IcChevron size={18} />
            </button>
          </div>
          {!v && !d.error && <p className="muted">Chargement…</p>}
          {v && (
            <>
              <div className="eleves-chiffres pe-chiffres">
                <div>
                  <b>{v.cours.length}</b>
                  <span>Cours prévus</span>
                </div>
                <div>
                  <b className="vert">{nb('assure')}</b>
                  <span>Confirmés</span>
                </div>
                <div>
                  <b>{aVerifier}</b>
                  <span>À vérifier</span>
                </div>
                <div>
                  <b className={absentsCours ? 'rouge' : ''}>{absentsCours}</b>
                  <span>Absents</span>
                </div>
              </div>
              <div className="pe-actions">
                {v.maintenant && enCours.length > 0 && (
                  <button type="button" className="btn bouton-icone" onClick={() => setClasseJ('__maintenant')}>
                    {`Ronde : ${enCours.length} cours en ce moment`}
                  </button>
                )}
                <a className="btn btn-quiet bouton-icone" href="#/import-absences-enseignants">
                  <IcImport size={17} /> Liste des absences
                </a>
              </div>

              {v.absences.length > 0 && (
                <>
                  <p className="niveau-titre">Absences signalées</p>
                  <ul className="liste-simple">
                    {v.absences.map((a) => (
                      <li key={a.id}>
                        <span className="ls-texte">
                          <b data-brut>
                            {a.last_name} {a.first_name}
                          </b>
                          <small>
                            {SOURCE_ABSENCE[a.source] || (a.par_lui ? SOURCE_ABSENCE.enseignant : SOURCE_ABSENCE.direction)}
                            {a.motif ? ` · ${a.motif}` : ''}
                          </small>
                        </span>
                        <button type="button" className="lien-action" onClick={() => retirerAbsence(a.id)}>
                          Retirer
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {v.cours.length > 0 && !classeJ && (
                <>
                  {aVerifier > 0 && (
                    <button type="button" className="eleves-alerte pe-verifier" onClick={() => setClasseJ('__verifier')}>
                      <span>
                        <b>{`${aVerifier} cours à vérifier`}</b>
                        <small>Aucune confirmation : ni l’enseignant, ni l’appel, ni la direction</small>
                      </span>
                      <IcChevron size={18} />
                    </button>
                  )}
                  {niveauxJ.map((n) => (
                    <section className="eleves-niveau" key={n.nom}>
                      <h2>{n.nom}</h2>
                      <div className="eleves-classes">
                        {n.classes.map((c) => {
                          const cs = coursParClasse.get(c)
                          const abs = cs.filter((x) => x.etat === 'absent' || x.etat === 'absent_prevu').length
                          const ver = cs.filter((x) => x.etat === 'a_verifier').length
                          return (
                            <button type="button" key={c} onClick={() => setClasseJ(c)}>
                              <b>{c}</b>
                              <small className={abs ? 'rouge' : ''}>{[`${cs.length} cours`, abs && `${abs} absent(s)`, ver && `${ver} à vérifier`].filter(Boolean).join(' · ')}</small>
                            </button>
                          )
                        })}
                      </div>
                    </section>
                  ))}
                </>
              )}
              {classeJ && (
                <>
                  <div className="eleves-barre">
                    <button type="button" className="back" onClick={() => setClasseJ('')}>
                      ← Toutes les classes
                    </button>
                  </div>
                  <h2 className="eleves-titre">
                    {TITRE_VUE[classeJ] || classeJ}
                    <small>{`${coursVus.length} cours`}</small>
                  </h2>
                </>
              )}
              {v.cours.length === 0 ? (
                <div className="vide">
                  <b>Aucun cours ce jour</b>
                  <small>Les cours apparaissent ici une fois les emplois du temps ajoutés.</small>
                  <a href="#/import-emplois">Ajouter les emplois du temps</a>
                </div>
              ) : (
                classeJ && (
                  <ul className="liste-simple pe-cours">
                    {coursVus.map((c) => {
                      const passe = c.etat !== 'a_venir'
                      const sig = signauxDe(c)
                      return (
                        <li key={`${c.class_id}-${c.debut}`} className={`pe-${c.etat}`}>
                          <span className="ls-heure">{c.debut}</span>
                          <span className="ls-texte">
                            <b>{classeJ.startsWith('__') ? `${c.classe} · ${c.matiere || '—'}` : c.matiere || '—'}</b>
                            <small data-brut>{c.last_name ? `${c.last_name} ${c.first_name}` : 'Enseignant sans compte Sùkûl'}</small>
                            {sig.length > 0 && <small className="pe-signaux">{sig.join(' · ')}</small>}
                            {c.contenu && <small className="pe-cahier">{`« ${c.contenu} »`}</small>}
                            {passe && c.etat !== 'absent_prevu' && (
                              <span className="ls-actions">
                                {c.constat !== 'present' && c.etat !== 'assure' && (
                                  <button type="button" className="lien-action" onClick={() => constater(c, 'present')}>
                                    Présent
                                  </button>
                                )}
                                {c.constat !== 'absent' && (
                                  <button type="button" className="lien-action rouge" onClick={() => constater(c, 'absent')}>
                                    Absent
                                  </button>
                                )}
                                {c.constat && c.constat_source !== 'liste' && (
                                  <button type="button" className="lien-action discret" onClick={() => constater(c, '')}>
                                    Annuler le constat
                                  </button>
                                )}
                                {!c.appel && (
                                  <button
                                    type="button"
                                    className="lien-action discret"
                                    onClick={() => {
                                      demandeAppel.date = date
                                      demandeAppel.periode = Number(c.debut.replace(':', ''))
                                      window.location.hash = `/classes/${c.class_id}/appel`
                                    }}
                                  >
                                    Faire l’appel
                                  </button>
                                )}
                              </span>
                            )}
                          </span>
                          <span className={`etiquette ${(ETAT[c.etat] || ETAT.a_venir)[1]}`}>{(ETAT[c.etat] || ETAT.a_venir)[0]}</span>
                        </li>
                      )
                    })}
                  </ul>
                )
              )}
            </>
          )}
        </>
      )}

      {onglet === 'equipe' && (
        <>
          {(equipe.loading || actifs.loading) && !membres.length && <p className="muted">Chargement…</p>}
          {!equipe.loading && !actifs.loading && membres.length === 0 && (
            <div className="vide">
              <b>Aucun enseignant pour l’instant</b>
              <small>Importez la liste de vos enseignants : leurs comptes seront validés et leurs classes affectées automatiquement.</small>
              <a href="#/import-enseignants">Importer la liste</a>
            </div>
          )}
          {membres.length > 0 && !classeEq && (
            <>
              <div className="eleves-chiffres">
                <div>
                  <b>{membres.length}</b>
                  <span>Enseignants</span>
                </div>
                <div>
                  <b>{membres.filter((m) => m.etat === 'actif').length}</b>
                  <span>Comptes actifs</span>
                </div>
                <div>
                  <b>{parClasse.size}</b>
                  <span>Classes</span>
                </div>
              </div>
              <input className="input eleves-recherche" type="search" placeholder="Rechercher un enseignant ou une matière" value={qEq} onChange={(e) => setQEq(e.target.value)} />
            </>
          )}

          {/* resultats de la recherche */}
          {trouves && !classeEq && (
            <>
              <p className="niveau-titre">{`${trouves.length} enseignant(s)`}</p>
              {trouves.length > 0 ? <ul className="liste-simple">{trouves.map((m) => ligneMembre(m, { retirer: true }))}</ul> : <p className="muted">Aucun enseignant trouvé.</p>}
            </>
          )}

          {/* classes par niveau */}
          {!trouves && !classeEq && membres.length > 0 && (
            <>
              {niveauxEq.map((n) => (
                <section className="eleves-niveau" key={n.nom}>
                  <h2>{n.nom}</h2>
                  <div className="eleves-classes">
                    {n.classes.map((c) => (
                      <button type="button" key={c} onClick={() => setClasseEq(c)}>
                        <b>{c}</b>
                        <small>{`${parClasse.get(c).length} enseignant(s)`}</small>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
              {sansClasse.length > 0 && (
                <button type="button" className="eleves-alerte" onClick={() => setClasseEq('__sans')}>
                  <span>
                    <b>{`${sansClasse.length} enseignant(s) sans classe`}</b>
                    <small>Leurs classes seront affectées à l’import ou par eux-mêmes</small>
                  </span>
                  <IcChevron size={18} />
                </button>
              )}
            </>
          )}

          {/* enseignants d'une classe */}
          {classeEq && (
            <>
              <div className="eleves-barre">
                <button type="button" className="back" onClick={() => setClasseEq('')}>
                  ← Toutes les classes
                </button>
              </div>
              <h2 className="eleves-titre">
                {classeEq === '__sans' ? 'Sans classe' : classeEq}
                <small>{`${equipeClasse.length} enseignant(s)`}</small>
              </h2>
              <ul className="liste-simple">{equipeClasse.map((m) => ligneMembre(m, { classe: classeEq, retirer: classeEq === '__sans' }))}</ul>
            </>
          )}
        </>
      )}

      {onglet === 'bilan' && (
        <>
          {!v && !d.error && <p className="muted">Chargement…</p>}
          {v && v.bilan.length === 0 && (
            <div className="vide">
              <b>Pas encore de bilan</b>
              <small>Le bilan se calcule à partir des emplois du temps et des confirmations des cours.</small>
            </div>
          )}
          {v && v.bilan.length > 0 && (
            <>
              <p className="muted" style={{ fontSize: 13, margin: '0 2px 10px' }}>
                Part des cours confirmés (par l’enseignant, le cahier de textes, l’appel ou la direction), sur les 30 derniers jours.
              </p>
              <ul className="liste-simple">
                {v.bilan.map((b) => {
                  const taux = b.prevus ? Math.round((b.confirmes / b.prevus) * 100) : 100
                  return (
                    <li key={b.teacher_id}>
                      <span className="ls-texte">
                        <b data-brut>
                          {b.last_name} {b.first_name}
                        </b>
                        <small>
                          {`${b.prevus} cours · ${b.confirmes} confirmé(s) · ${b.a_verifier} à vérifier · ${b.absences} absence(s)`}
                        </small>
                      </span>
                      <b className={`ls-taux ${b.absences ? 'rouge' : taux >= 90 ? 'vert' : ''}`}>{taux} %</b>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </>
      )}
    </>
  )
}
