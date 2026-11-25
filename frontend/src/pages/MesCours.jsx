import { useEffect, useRef, useState } from 'react'
import { envoyerOuGarder, lireCopie } from '../horsligne.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'
import { IcCalendrier, IcChevron, IcPhoto } from '../icones.jsx'
import { api } from '../api.js'
import { preparerDocument } from '../lecture-fichier.js'

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

// Le cours peut etre confirme le jour meme, de l'heure de son debut jusqu'a sa fin (jamais avant)
export const confirmable = (c, v) => v && v.date === v.aujourdhui && !c.confirme_le && !c.absent && v.maintenant >= c.debut && v.maintenant < c.fin
// Question « Etes-vous en cours ? » (ouverte depuis la notification de presence) : Oui / Non
function Question({ c, v, reponseInitiale, onFini }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const auto = useRef(false)
  async function repondre(reponse) {
    setBusy(true)
    setError('')
    try {
      if (reponse === 'oui') {
        const attente = await confirmerCours(c, v.date)
        onFini(attente ? 'Présence gardée sur le téléphone : envoyée dès le retour du réseau.' : 'Présence confirmée. Merci !')
      } else {
        const r = await envoyerOuGarder({
          cle: `pas-en-cours-${c.class_id}-${v.date}-${c.debut}`,
          path: '/api/presence-enseignants/mes-cours/reponse',
          body: { classId: c.class_id, debut: c.debut, date: v.date, reponse: 'non' },
          libelle: `Pas en cours ${c.classe}`,
        })
        onFini(r.attente ? 'Réponse gardée sur le téléphone : envoyée dès le retour du réseau.' : 'C’est noté : l’établissement est prévenu.')
      }
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }
  useEffect(() => {
    if (reponseInitiale && !auto.current) {
      auto.current = true
      repondre(reponseInitiale)
    }
  }, [reponseInitiale]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="voile mc-question-voile">
      <div className="feuille mc-question" role="dialog" aria-label="Êtes-vous en cours ?">
        <div className="feuille-poignee" />
        <p className="mc-question-titre">Êtes-vous en cours ?</p>
        <p className="mc-question-cours">
          <b>{c.classe}</b>
          <span>{`${c.matiere || ''} · ${c.debut} – ${c.fin}${c.salle ? ` · Salle ${c.salle}` : ''}`}</span>
        </p>
        {error && <p className="cours-erreur">{error}</p>}
        <div className="mc-question-boutons">
          <button type="button" className="btn mc-oui" disabled={busy} onClick={() => repondre('oui')}>
            {busy ? '…' : 'Oui, je suis en cours'}
          </button>
          <button type="button" className="btn btn-quiet mc-non" disabled={busy} onClick={() => repondre('non')}>
            Non
          </button>
        </div>
      </div>
    </div>
  )
}

const termine = (c, v) => v && (v.date < v.aujourdhui || (v.date === v.aujourdhui && v.maintenant >= c.fin))
const commence = (c, v) => v && (v.date < v.aujourdhui || (v.date === v.aujourdhui && v.maintenant >= moins15(c.debut)))

// Confirme la presence ; sans reseau, la confirmation est gardee avec son heure et envoyee plus tard.
// Renvoie true si elle est en attente d'envoi.
export async function confirmerCours(c, date) {
  const r = await envoyerOuGarder({
    cle: `presence-${c.class_id}-${date}-${c.debut}`,
    path: '/api/presence-enseignants/mes-cours/confirmer',
    body: { classId: c.class_id, debut: c.debut, date, le: new Date().toISOString() },
    libelle: `Présence ${c.classe} (${c.debut})`,
  })
  return r.attente
}
const presenceEnAttente = (c, date) => {
  try {
    return (JSON.parse(localStorage.getItem('sukul-envois')) || []).some((x) => x.cle === `presence-${c.class_id}-${date}-${c.debut}`)
  } catch {
    return false
  }
}

// Un cours de l'enseignant : confirmation « je suis en cours » et cahier de textes
function Cours({ c, v, onMaj }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [edition, setEdition] = useState(false)
  const [texte, setTexte] = useState(c.contenu || '')
  const [attente, setAttente] = useState(() => presenceEnAttente(c, v?.date))
  const photo = useRef(null)
  const [lecture, setLecture] = useState(false)

  // photo du cahier de textes papier : le texte lu s'ajoute a la saisie, a relire avant d'enregistrer
  async function lirePhoto(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setLecture(true)
    setError('')
    try {
      const { images } = await preparerDocument([f])
      const r = await api.post('/api/presence-enseignants/mes-cours/cahier/lire', { images })
      const lu = r.data?.contenu || ''
      if (!lu) setError('Aucun texte reconnu sur la photo. Reprenez-la plus près, bien éclairée.')
      else setTexte((t) => (t.trim() ? `${t.trim()}\n${lu}` : lu))
      setEdition(true)
    } catch (err) {
      setError(err.message)
    }
    setLecture(false)
  }

  async function confirmer() {
    setBusy(true)
    setError('')
    try {
      if (await confirmerCours(c, v.date)) setAttente(true)
      else onMaj()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }
  async function enregistrer() {
    setBusy(true)
    setError('')
    try {
      const r = await envoyerOuGarder({
        cle: `cahier-${c.class_id}-${v.date}-${c.debut}`,
        path: '/api/presence-enseignants/mes-cours/cahier',
        body: { classId: c.class_id, debut: c.debut, date: v.date, contenu: texte },
        libelle: `Cahier de textes ${c.classe}`,
        methode: 'put',
      })
      setEdition(false)
      if (r.attente) c.contenu = texte
      else onMaj()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  const enCours = confirmable(c, v) && !attente
  const confirme = c.confirme_le || c.etat === 'assure' || attente
  const statut = attente
    ? ['ok', 'Présent · en attente']
    : c.confirme_le
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
          <input ref={photo} type="file" accept="image/*" capture="environment" hidden onChange={lirePhoto} />
          {!edition && c.contenu && (
            <p>
              <span>Cahier de textes</span>
              {c.contenu}
            </p>
          )}
          {edition ? (
            <>
              <textarea className="input" rows={4} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Chapitre, leçon ou exercices traités pendant ce cours" autoFocus />
              <div className="mc-boutons">
                <button type="button" className="btn" disabled={busy || lecture} onClick={enregistrer}>
                  Enregistrer
                </button>
                <button type="button" className="btn btn-quiet" disabled={lecture} onClick={() => photo.current?.click()}>
                  <IcPhoto size={17} /> {lecture ? 'Lecture…' : 'Photo du cahier'}
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
              <button type="button" className="lien-action" disabled={lecture} onClick={() => photo.current?.click()}>
                <IcPhoto size={15} /> {lecture ? 'Lecture de la photo…' : 'Prendre en photo'}
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
  // ?confirmer=classe-HHMM-date : ouvert depuis la notification de presence
  const [demande] = useState(() => (window.location.hash.match(/confirmer=([\d]+-\d{4}-\d{4}-\d{2}-\d{2})/) || [])[1] || '')
  const [reponseInitiale] = useState(() => (window.location.hash.match(/reponse=(oui|non)/) || [])[1] || '')
  const [question, setQuestion] = useState(Boolean(demande))
  const [fini, setFini] = useState('')
  const [date, setDate] = useState(() => (demande ? demande.slice(-10) : enChaine(new Date())))
  const enLigne = useApi(`/api/presence-enseignants/mes-cours?date=${date}`)
  // sans reseau : la journee gardee par l'accueil (meme jour) si cette page n'a pas encore de copie
  const accueil = enLigne.sansReseau && !enLigne.data ? lireCopie('/api/presence-enseignants/mes-cours') : null
  const d = accueil?.data?.date === date ? { ...enLigne, data: accueil.data, error: '' } : enLigne
  const v = d.data
  // le cours de la notification, s'il peut encore etre confirme
  const coursDemande = question && v ? v.cours.find((c) => `${c.class_id}-${c.debut.replace(':', '')}-${v.date}` === demande && !c.confirme_le && !c.absent) : null
  const auj = v?.aujourdhui || enChaine(new Date())
  // de 14 jours en arriere (cahier de textes) a 60 jours en avant (prochains cours)
  const min = decaler(auj, -14)
  const max = decaler(auj, 60)
  const libelle = date === auj ? 'Aujourd’hui' : date === decaler(auj, -1) ? 'Hier' : date === decaler(auj, 1) ? 'Demain' : new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <>
      <h1 className="page-title">Mes cours</h1>
      {fini && <Note kind="ok">{fini}</Note>}
      {coursDemande && (confirmable(coursDemande, v) || reponseInitiale === 'non') && (
        <Question
          c={coursDemande}
          v={v}
          reponseInitiale={reponseInitiale}
          onFini={(m) => {
            setQuestion(false)
            setFini(m)
            d.reload()
          }}
        />
      )}
      {coursDemande && !confirmable(coursDemande, v) && reponseInitiale !== 'non' && termine(coursDemande, v) && (
        <Note>Ce cours est terminé : la présence ne peut plus être confirmée.</Note>
      )}
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
