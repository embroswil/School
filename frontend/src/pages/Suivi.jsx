import { useState } from 'react'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'
import { ListeDevoirs } from './Devoirs.jsx'
import { AgendaEleve } from './EmploiDuTemps.jsx'
import Discipline from './Discipline.jsx'
import { IcAppel, IcBouclier, IcCalendrier, IcCoche, IcGraphique, IcPlus } from '../icones.jsx'

const n20 = (n) => (n === null || n === undefined ? '—' : Number(n).toFixed(2).replace('.', ','))
const jour = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : '')
const STATUT = { absent: ['Non justifiée', 'var(--danger)'], late: ['Retard', '#c25a00'], excused: ['Justifiée', 'var(--muted)'] }

const rangT = (r) => (r === 1 ? '1er' : `${r}e`)
const classeNote = (x) =>
  x.classe?.notes > 0
    ? [`Classe ${n20(x.classe.moyenne)}`, x.classe.rang ? `${rangT(x.classe.rang)}/${x.classe.notes}` : '', `min ${n20(x.classe.min)} · max ${n20(x.classe.max)}`, `${x.classe.reussite}/${x.classe.notes} ont la moyenne`]
        .filter(Boolean)
        .join(' · ')
    : ''
const sur20 = (x) => (x.note === null || x.absent ? null : (Number(x.note) * 20) / Number(x.bareme))
const couleur = (n) => (n === null || n === undefined ? '' : n >= 10 ? 'ok' : 'ko')

// Une note d'un controle : intitule, date, sequence ; note de l'enfant ; statistiques de la classe
function LigneNote({ x, seq }) {
  return (
    <li className="nt-ligne">
      <span className="nt-texte">
        <b data-brut>{x.titre}</b>
        <small>{[seq ? `Séq. ${seq}` : '', x.date ? jour(x.date) : ''].filter(Boolean).join(' · ')}</small>
        {classeNote(x) && <small className="nt-classe">{classeNote(x)}</small>}
      </span>
      <b className={`nt-note ${x.absent ? '' : couleur(sur20(x))}`}>{x.absent ? 'Abs.' : `${String(Number(x.note)).replace('.', ',')}/${Number(x.bareme)}`}</b>
    </li>
  )
}

// Notes en detail : par matiere (tous les controles de l'annee) ou par trimestre (moyennes et rangs)
function Notes({ id }) {
  const d = useApi(`/api/suivi/eleves/${id}/notes`)
  const [vue, setVue] = useState('matiere')
  if (!d.data) return <p className="muted">Chargement…</p>
  if (!d.data.sequences.length) return <p className="muted">Aucune note publiée pour le moment.</p>
  // regroupement par matiere, du plus recent au plus ancien
  const parMatiere = new Map()
  for (const q of d.data.sequences)
    for (const m of q.matieres) {
      if (!parMatiere.has(m.matiere)) parMatiere.set(m.matiere, { matiere: m.matiere, coefficient: m.coefficient, notes: [] })
      parMatiere.get(m.matiere).notes.push(...m.notes.map((x) => ({ ...x, sequence: q.sequence })))
    }
  const matieres = [...parMatiere.values()]
    .map((m) => {
      const v = m.notes.map(sur20).filter((n) => n !== null)
      return { ...m, moyenne: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
    })
    .sort((a, b) => a.matiere.localeCompare(b.matiere, 'fr'))
  return (
    <>
      {d.data.decision && (
        <div className="note note-ok">
          Décision de fin d’année : <b>{d.data.decision.libelle}</b>
          {d.data.decision.observation ? ` · ${d.data.decision.observation}` : ''}
        </div>
      )}
      <div className="segments petit" role="tablist">
        <button type="button" role="tab" aria-selected={vue === 'matiere'} onClick={() => setVue('matiere')}>
          Par matière
        </button>
        <button type="button" role="tab" aria-selected={vue === 'sequence'} onClick={() => setVue('sequence')}>
          Par séquence
        </button>
      </div>
      {vue === 'matiere' &&
        matieres.map((m) => (
          <section key={m.matiere} className="nt-carte">
            <header className="nt-tete">
              <span>
                <b data-brut>{m.matiere}</b>
                <small>{`Coef. ${String(m.coefficient).replace('.0', '')} · ${m.notes.length} ${m.notes.length > 1 ? 'contrôles' : 'contrôle'}`}</small>
              </span>
              <b className={`nt-moy ${couleur(m.moyenne)}`}>{m.moyenne === null ? '—' : n20(m.moyenne)}</b>
            </header>
            <ul>
              {m.notes.map((x, k) => (
                <LigneNote key={k} x={x} seq={x.sequence} />
              ))}
            </ul>
          </section>
        ))}
      {vue === 'sequence' &&
        d.data.sequences.map((q) => (
          <section key={q.sequence} className="nt-carte">
            <header className="nt-tete">
              <span>
                <b>{`Séquence ${q.sequence} · trimestre ${q.trimestre}`}</b>
                {q.rang && <small>{`${rangT(q.rang)} sur ${q.sur} · moyenne de la classe ${n20(q.moyenneClasse)}`}</small>}
              </span>
              <b className={`nt-moy ${couleur(q.moyenne)}`}>{n20(q.moyenne)}</b>
            </header>
            <ul>
              {q.matieres.map((m) => (
                <li key={m.matiere} className="nt-ligne">
                  <span className="nt-texte">
                    <b data-brut>{m.matiere}</b>
                    <small>{m.notes.map((x) => (x.absent ? `${x.titre} : abs.` : `${x.titre} : ${String(Number(x.note)).replace('.', ',')}/${Number(x.bareme)}`)).join(' · ')}</small>
                  </span>
                  <b className={`nt-note ${couleur(m.moyenne)}`}>{n20(m.moyenne)}</b>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </>
  )
}

function EmploiEleve({ id }) {
  const d = useApi(`/api/vie-scolaire/emplois/moi?eleve=${id}`)
  if (!d.data) return <p className="muted">Chargement…</p>
  return <AgendaEleve creneaux={d.data.creneaux} />
}

function DevoirsEleve({ id }) {
  const d = useApi(`/api/suivi/eleves/${id}/devoirs`)
  if (!d.data) return <p className="muted">Chargement…</p>
  return <ListeDevoirs devoirs={d.data} />
}

// Absences de l'annee scolaire, mois par mois : jour, heure du cours, matiere, enseignant, justification
const MOIS_P = (d) => new Date(d).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
function Presences({ id }) {
  const d = useApi(`/api/suivi/eleves/${id}/presences`)
  if (!d.data) return <p className="muted">Chargement…</p>
  const ev = d.data.evenements || []
  const mois = []
  for (const e of ev) {
    const k = MOIS_P(e.date)
    const g = mois[mois.length - 1]
    if (g && g.k === k) g.l.push(e)
    else mois.push({ k, l: [e] })
  }
  return (
    <>
      <div className="ab-chiffres">
        <div className={d.data.absences ? 'alerte' : ''}>
          <b>{d.data.absences}</b>
          <small>{d.data.absences > 1 ? 'Absences' : 'Absence'}</small>
        </div>
        <div>
          <b>{d.data.nonJustifiees ?? d.data.absences}</b>
          <small>Non justifiées</small>
        </div>
        <div>
          <b>{d.data.justifiees ?? 0}</b>
          <small>Justifiées</small>
        </div>
        <div>
          <b>{d.data.retards ?? 0}</b>
          <small>Retards</small>
        </div>
      </div>
      {ev.length === 0 && <p className="muted">Aucune absence depuis la rentrée.</p>}
      {mois.map((g) => (
        <section key={g.k} className="ab-mois">
          <h3>{`${g.k} · ${g.l.length}`}</h3>
          <ul className="nt-carte">
            {g.l.map((e, i) => (
              <li key={i} className="nt-ligne">
                <span className="nt-texte">
                  <b>{new Date(e.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</b>
                  <small data-brut>{[e.debut ? `${e.debut}${e.fin ? `–${e.fin}` : ''}` : '', e.matiere, e.enseignant].filter(Boolean).join(' · ') || 'Toute la journée'}</small>
                  {e.remarks && <small data-brut>{e.remarks}</small>}
                </span>
                <em className={`ab-etat ${e.status}`}>{STATUT[e.status]?.[0] || e.status}</em>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}

// Rubrique ouverte, gardee quand on passe d'un enfant a l'autre
let rubriqueSuivi = 'notes'

// Suivi d'un eleve (parent, tuteur ou l'eleve lui-meme)
export default function Suivi({ id }) {
  const eleves = useApi('/api/suivi/eleves')
  const [onglet, setOnglet] = useState(rubriqueSuivi)
  const e = eleves.data?.find((x) => x.id === id)
  if (eleves.error) return <Note>{eleves.error}</Note>
  if (!eleves.data) return <p className="muted">Chargement…</p>
  if (!e) return <Note>Élève non relié à votre compte.</Note>
  const RUBRIQUES = [
    ['notes', IcGraphique, 'Notes'],
    ['presences', IcAppel, 'Absences'],
    ['devoirs', IcCoche, 'Devoirs'],
    ['emploi', IcCalendrier, 'Emploi du temps'],
    ['discipline', IcBouclier, 'Discipline'],
  ]
  const choisir = (k) => {
    rubriqueSuivi = k
    setOnglet(k)
  }
  return (
    <div className="sv-page">
      <nav className="sv-enfants sans-impression" aria-label="Enfant">
        {eleves.data.map((x) => (
          <a key={x.id} href={`#/suivi/${x.id}`} aria-current={x.id === id ? 'page' : undefined}>
            <span className="sv-avatar">{`${(x.prenom || '?')[0]}${(x.nom || '')[0] || ''}`}</span>
            <span data-brut>{x.prenom}</span>
          </a>
        ))}
        <a href="#/trouver-eleve" className="sv-ajout" aria-label="Ajouter un enfant">
          <span className="sv-avatar">
            <IcPlus size={18} />
          </span>
          <span>Ajouter</span>
        </a>
      </nav>
      <p className="sv-qui-ligne" data-brut>
        <b>{`${e.prenom} ${e.nom}`}</b>
        <span>{[e.classe || 'Classe non précisée', e.ecole].filter(Boolean).join(' · ')}</span>
      </p>
      <nav className="sv-rubriques sans-impression" aria-label="Rubriques">
        {RUBRIQUES.map(([k, Icone, titre]) => (
          <button key={k} type="button" className="sv-rubrique" aria-pressed={onglet === k} onClick={() => choisir(k)}>
            <Icone size={19} />
            <span>{titre}</span>
          </button>
        ))}
      </nav>
      <section className="sv-contenu">
        {onglet === 'notes' && <Notes id={id} />}
        {onglet === 'presences' && <Presences id={id} />}
        {onglet === 'devoirs' && <DevoirsEleve id={id} />}
        {onglet === 'emploi' && <EmploiEleve id={id} />}
        {onglet === 'discipline' && <Discipline eleveId={id} />}
      </section>
    </div>
  )
}

// Carte resume d'un eleve (accueil)
export function CarteEleve({ e }) {
  return (
    <a className="ecole-carte" href={`#/suivi/${e.id}`}>
      <div className="ecole-tete">
        <span className="avatar" style={{ width: 44, height: 44, borderRadius: 14, fontSize: 16 }}>
          {(e.prenom || '?')[0]}
          {(e.nom || '')[0]}
        </span>
        <div className="row-main">
          <div className="row-title">
            {e.prenom} {e.nom}
          </div>
          <div className="row-sub">
            {e.classe || 'Classe non précisée'}
            {e.lien ? ` · ${e.lien}` : ''}
          </div>
        </div>
        <span className="row-end">›</span>
      </div>
      <div className="ecole-chiffres">
        <span>
          <b style={{ color: e.resultat?.moyenne >= 10 ? 'var(--ok)' : e.resultat ? 'var(--danger)' : undefined }}>{e.resultat ? n20(e.resultat.moyenne) : '—'}</b>
          {e.resultat ? `moyenne séq. ${e.resultat.sequence}` : 'pas encore de notes'}
        </span>
        <span>
          <b>{e.resultat?.rang ? `${e.resultat.rang}e` : '—'}</b>
          {e.resultat?.rang ? `sur ${e.resultat.sur}` : 'rang'}
        </span>
        <span>
          <b style={{ color: e.absencesMois ? 'var(--danger)' : undefined }}>{e.absencesMois}</b>
          absence(s) ce mois
        </span>
      </div>
      {e.dernieresNotes.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 13 }} className="muted">
          Dernières notes :{' '}
          {e.dernieresNotes.map((x) => `${x.matiere} ${x.absent ? 'abs.' : `${n20(x.note)}/${Number(x.bareme)}`}`).join(' · ')}
        </div>
      )}
    </a>
  )
}

// /notes (lien des notifications) : le suivi du premier enfant, ou la liste
export function MesNotes() {
  const eleves = useApi('/api/suivi/eleves')
  if (!eleves.data) return <p className="muted">Chargement…</p>
  if (eleves.data.length === 1) return <Suivi id={eleves.data[0].id} />
  if (!eleves.data.length) return <p className="lede">Aucun élève relié à votre compte.</p>
  return eleves.data.map((e) => <CarteEleve key={e.id} e={e} />)
}
