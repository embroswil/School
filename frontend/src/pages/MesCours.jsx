import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'
import { IcCalendrier, IcChevron } from '../icones.jsx'

const enChaine = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const decaler = (jour, n) => {
  const d = new Date(`${jour}T12:00:00`)
  d.setDate(d.getDate() + n)
  return enChaine(d)
}
const heureDe = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Douala' })
const moins15 = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  const t = h * 60 + m - 15
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

// Le cours peut etre confirme le jour meme, de 15 minutes avant son debut jusqu'a sa fin
export const confirmable = (c, v) => v && v.date === v.aujourdhui && !c.confirme_le && !c.absent && v.maintenant >= moins15(c.debut) && v.maintenant < c.fin
const termine = (c, v) => v && (v.date < v.aujourdhui || (v.date === v.aujourdhui && v.maintenant >= c.fin))
const commence = (c, v) => v && (v.date < v.aujourdhui || (v.date === v.aujourdhui && v.maintenant >= moins15(c.debut)))

export async function confirmerCours(c, date) {
  await api.post('/api/presence-enseignants/mes-cours/confirmer', { classId: c.class_id, debut: c.debut, date })
}

// Un cours de l'enseignant : confirmation « je suis en cours » et cahier de textes
function Cours({ c, v, onMaj }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [edition, setEdition] = useState(false)
  const [texte, setTexte] = useState(c.contenu || '')

  async function confirmer() {
    setBusy(true)
    setError('')
    try {
      await confirmerCours(c, v.date)
      onMaj()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }
  async function enregistrer() {
    setBusy(true)
    setError('')
    try {
      await api.put('/api/presence-enseignants/mes-cours/cahier', { classId: c.class_id, debut: c.debut, date: v.date, contenu: texte })
      setEdition(false)
      onMaj()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  const enCours = confirmable(c, v)
  const confirme = c.confirme_le || c.etat === 'assure'
  const statut = c.confirme_le
    ? ['ok', `Présent · ${heureDe(c.confirme_le)}`]
    : c.absent
      ? ['alerte', 'Absent']
      : c.etat === 'assure'
        ? ['ok', 'Confirmé']
        : termine(c, v)
          ? ['gris', 'Non confirmé']
          : enCours
            ? null
            : ['neutre', 'À venir']
  return (
    <article className={`mc-cours ${confirme ? 'fait' : ''} ${enCours ? 'maintenant' : ''}`}>
      <div className="mc-tete">
        <span className="mc-heure">
          <b>{c.debut}</b>
          <small>{c.fin}</small>
        </span>
        <span className="mc-titre">
          <b>{c.classe}</b>
          <small>{[c.matiere, c.salle ? `Salle ${c.salle}` : ''].filter(Boolean).join(' · ')}</small>
        </span>
        {enCours ? (
          <button type="button" className="btn mc-present" disabled={busy} onClick={confirmer}>
            {busy ? '…' : 'Je suis en cours'}
          </button>
        ) : (
          statut && <span className={`etiquette ${statut[0]}`}>{statut[1]}</span>
        )}
      </div>

      {commence(c, v) && !c.absent && (
        <div className="mc-cahier">
          {!edition && c.contenu && (
            <p>
              <span>Cahier de textes</span>
              {c.contenu}
            </p>
          )}
          {edition ? (
            <>
              <textarea className="input" rows={3} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Chapitre, leçon ou exercices traités pendant ce cours" autoFocus />
              <div className="mc-boutons">
                <button type="button" className="btn" disabled={busy} onClick={enregistrer}>
                  Enregistrer
                </button>
                <button type="button" className="btn btn-quiet" onClick={() => (setEdition(false), setTexte(c.contenu || ''))}>
                  Annuler
                </button>
              </div>
            </>
          ) : (
            <div className="mc-liens">
              <button type="button" className="lien-action" onClick={() => setEdition(true)}>
                {c.contenu ? 'Modifier le cahier de textes' : 'Cahier de textes'}
              </button>
              {v.date === v.aujourdhui && !c.appel && !termine(c, v) && (
                <a className="lien-action" href={`#/classes/${c.class_id}/appel`}>
                  Faire l’appel
                </a>
              )}
              {c.appel && <span className="mc-appel">Appel fait</span>}
            </div>
          )}
        </div>
      )}
      <Note>{error}</Note>
    </article>
  )
}

// Mes cours : chaque cours du jour, a confirmer d'un geste, et le cahier de textes
export default function MesCours() {
  const [date, setDate] = useState(() => enChaine(new Date()))
  const d = useApi(`/api/presence-enseignants/mes-cours?date=${date}`)
  const v = d.data
  const auj = v?.aujourdhui || enChaine(new Date())
  // de 14 jours en arriere (cahier de textes) a 60 jours en avant (prochains cours)
  const min = decaler(auj, -14)
  const max = decaler(auj, 60)
  const libelle = date === auj ? 'Aujourd’hui' : date === decaler(auj, -1) ? 'Hier' : date === decaler(auj, 1) ? 'Demain' : new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <>
      <h1 className="page-title">Mes cours</h1>
      <p className="muted mc-intro">Pendant le cours, confirmez que vous êtes en classe, puis notez ce qui a été fait.</p>
      <div className="jour-nav">
        <button type="button" aria-label="Jour précédent" disabled={date <= min} onClick={() => setDate(decaler(date, -1))}>
          <IcChevron size={18} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <label className="jour-nav-date">
          <IcCalendrier size={17} />
          <span>{libelle}</span>
          <input type="date" aria-label="Choisir un jour" value={date} min={min} max={max} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <button type="button" aria-label="Jour suivant" disabled={date >= max} onClick={() => setDate(decaler(date, 1))}>
          <IcChevron size={18} />
        </button>
      </div>
      {date !== auj && (
        <button type="button" className="lien-action mc-retour" onClick={() => setDate(auj)}>
          Revenir à aujourd’hui
        </button>
      )}
      <Note>{d.error}</Note>
      {!v && !d.error && <p className="muted">Chargement…</p>}
      {v?.absence && (
        <div className="note">{`Absence signalée ce jour${v.absence.motif ? ` : ${v.absence.motif}` : ''}.`}</div>
      )}
      {v && v.cours.length === 0 && (
        <div className="vide">
          <b>Aucun cours ce jour</b>
          <small>{v.total ? 'Votre emploi du temps ne prévoit pas de cours ce jour-là.' : 'Votre emploi du temps apparaîtra ici dès que l’établissement l’aura saisi.'}</small>
        </div>
      )}
      {v && v.cours.length > 0 && (
        <div className="mc-liste">
          {v.cours.map((c) => (
            <Cours key={`${c.class_id}-${c.debut}-${date}-${c.contenu || ''}`} c={c} v={v} onMaj={() => d.reload()} />
          ))}
        </div>
      )}
    </>
  )
}
