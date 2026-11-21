import { useState } from 'react'
import { api } from '../api.js'
import { envoyerOuGarder } from '../horsligne.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'
import { IcCalendrier, IcEcole, IcPlus } from '../icones.jsx'

const ROLES = { parent: 'Parent', student: 'Élève', teacher: 'Enseignant' }
const VIDE = { subject: '', body: '', a: 'etablissement', classeId: '', eleveId: '', date: '', motif: '' }

// Date courte : heure aujourd'hui, jour de la semaine cette semaine, sinon date
const quand = (d) => {
  const x = new Date(d)
  const ecart = (Date.now() - x.getTime()) / 864e5
  if (x.toDateString() === new Date().toDateString()) return x.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (ecart < 6) return x.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')
  return x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}
const initiales = (t) =>
  String(t || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0])
    .join('')
    .toUpperCase()

// Une conversation de la liste : avatar, interlocuteur, objet, dernier message
function Ligne({ c, etablissement }) {
  const nom = etablissement ? `${c.first_name} ${c.last_name}` : c.genre === 'parent' ? c.avec : c.genre === 'enseignant' ? c.avec : c.avec || 'Établissement'
  const detail = etablissement ? ROLES[c.role] || '' : c.genre === 'parent' ? `Parent de ${c.eleve || '—'}` : c.genre === 'enseignant' ? 'Enseignant' : 'Établissement'
  const ecole = !etablissement && (!c.genre || c.genre === 'etablissement')
  return (
    <a className={`msg-ligne ${c.non_lu ? 'non-lu' : ''}`} href={`#/messages/${c.id}`}>
      <span className={`msg-avatar ${ecole ? 'ecole' : c.genre === 'parent' ? 'parent' : ''}`} aria-hidden="true">
        {ecole ? <IcEcole size={18} /> : initiales(nom)}
      </span>
      <span className="msg-corps">
        <span className="msg-haut">
          <b data-brut>{nom}</b>
          <time>{quand(c.updated_at)}</time>
        </span>
        <span className="msg-objet">
          <span data-brut>{c.subject}</span>
          {detail && <small>{` · ${detail}`}</small>}
        </span>
        <span className="msg-apercu" data-brut>
          {c.dernier}
        </span>
      </span>
      {c.non_lu && <i className="msg-point" aria-label="Non lu" />}
    </a>
  )
}

export default function Messages() {
  const { user } = useAuth()
  const etablissement = user.role === 'principal'
  const enseignant = user.role === 'teacher'
  const liste = useApi('/api/boite/messages')
  const auDepart = (window.location.hash.match(/nouveau=(parents|absence|etablissement)/) || [])[1]
  const [ouvert, setOuvert] = useState(Boolean(auDepart))
  const [f, setF] = useState(auDepart ? { ...VIDE, a: auDepart } : VIDE)
  // enseignant : ses absences signalees (l'absence se signale depuis la messagerie)
  const absences = useApi(enseignant ? '/api/presence-enseignants/miennes' : null)
  const absence = f.a === 'absence'
  const [filtre, setFiltre] = useState('tous')
  const [envoye, setEnvoye] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // enseignant : ses classes, puis les eleves de la classe choisie
  const classes = useApi(enseignant && f.a === 'parents' ? '/api/notes/mes-classes' : null)
  const eleves = useApi(enseignant && f.a === 'parents' && f.classeId ? `/api/boite/destinataires?classe=${f.classeId}` : null)
  const nbParents = (eleves.data || []).filter((x) => !f.eleveId || String(x.id) === f.eleveId).reduce((n, x) => n + x.parents, 0)

  async function envoyer(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (absence) {
        const r = await envoyerOuGarder({ cle: `absence-${f.date}`, path: '/api/presence-enseignants', body: { date: f.date, motif: f.motif }, libelle: 'Absence signalée' })
        setEnvoye(r.attente ? 'Pas de réseau : absence gardée sur le téléphone, signalée dès le retour du réseau.' : 'Absence signalée : l’administration est prévenue.')
        setOuvert(false)
        setF(VIDE)
        absences.reload()
        setBusy(false)
        return
      }
      const r = await envoyerOuGarder({ cle: `message-${Date.now()}`, path: '/api/boite/messages', body: f, libelle: `Message « ${f.subject} »` })
      if (r.attente) {
        setEnvoye('Pas de réseau : message gardé sur le téléphone, envoyé dès le retour de la connexion.')
        setOuvert(false)
        setF(VIDE)
      } else if (r.data.id) window.location.hash = `/messages/${r.data.id}`
      else {
        setEnvoye(`Message envoyé à ${r.data.envoyes} parent${r.data.envoyes > 1 ? 's' : ''}.`)
        setOuvert(false)
        setF(VIDE)
        liste.reload()
      }
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  const tout = liste.data || []
  const visibles = tout.filter((c) => filtre === 'tous' || (filtre === 'parents' ? c.genre === 'parent' : c.genre !== 'parent'))
  const nonLus = tout.filter((c) => c.non_lu).length

  return (
    <div className="msg-page">
      <div className="msg-entete">
        <div>
          <h1 className="page-title">Messages</h1>
          {etablissement && <p className="muted">Parents, élèves et enseignants de votre établissement.</p>}
        </div>
        {!etablissement && !ouvert && (
          <button type="button" className="btn msg-nouveau" onClick={() => (setOuvert(true), setEnvoye(''))}>
            <IcPlus size={17} />
            <span>Nouveau</span>
          </button>
        )}
      </div>
      {envoye && <Note kind="ok">{envoye}</Note>}

      {ouvert && (
        <form className="msg-redaction" onSubmit={envoyer}>
          <div className="msg-redaction-tete">
            <b>Nouveau message</b>
            <button type="button" className="lien-action" onClick={() => setOuvert(false)}>
              Annuler
            </button>
          </div>

          <div className="msg-champ">
            <span>À</span>
            {enseignant ? (
              <div className="msg-choix" role="tablist">
                {[
                  ['etablissement', 'L’établissement'],
                  ['parents', 'Des parents'],
                  ['absence', 'Signaler une absence'],
                ].map(([k, t]) => (
                  <button key={k} type="button" role="tab" aria-selected={f.a === k} onClick={() => setF({ ...f, a: k })}>
                    {t}
                  </button>
                ))}
              </div>
            ) : (
              <b data-brut>{user.schoolName || 'L’établissement'}</b>
            )}
          </div>

          {enseignant && f.a === 'parents' && (
            <div className="msg-champ msg-champ-double">
              <select className="input" aria-label="Classe" value={f.classeId} onChange={(e) => setF({ ...f, classeId: e.target.value, eleveId: '' })} required>
                <option value="">Classe</option>
                {(classes.data || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select className="input" aria-label="Parents de" value={f.eleveId} onChange={(e) => setF({ ...f, eleveId: e.target.value })} disabled={!f.classeId}>
                <option value="">Toute la classe</option>
                {(eleves.data || []).map((x) => (
                  <option key={x.id} value={x.id} disabled={!x.parents}>
                    {`${x.last_name} ${x.first_name}${x.parents ? '' : ' (aucun parent inscrit)'}`}
                  </option>
                ))}
              </select>
            </div>
          )}
          {enseignant && f.a === 'parents' && f.classeId && eleves.data && (
            <p className={`msg-info ${nbParents ? '' : 'alerte'}`}>
              {nbParents ? `${nbParents} parent${nbParents > 1 ? 's' : ''} recevr${nbParents > 1 ? 'ont' : 'a'} ce message, chacun en privé.` : 'Aucun parent inscrit pour l’instant.'}
            </p>
          )}

          {absence && (
            <>
              <div className="msg-champ">
                <span>Date</span>
                <input className="msg-saisie" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required />
              </div>
              <div className="msg-champ">
                <span>Motif</span>
                <input className="msg-saisie" placeholder="Ex. : formation, maladie… (facultatif)" value={f.motif} onChange={(e) => setF({ ...f, motif: e.target.value })} />
              </div>
              <p className="msg-info">L’administration est prévenue tout de suite et peut organiser le remplacement.</p>
            </>
          )}
          {!absence && (
          <>
          <div className="msg-champ">
            <span>Objet</span>
            <input
              className="msg-saisie"
              placeholder={enseignant ? (f.a === 'parents' ? 'ex. Devoir de mathématiques' : 'ex. Changement de salle') : 'ex. Absence de mon enfant'}
              value={f.subject}
              onChange={(e) => setF({ ...f, subject: e.target.value })}
              required
            />
          </div>
          <textarea className="msg-texte" placeholder="Votre message…" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required />
          </>
          )}
          <Note>{error}</Note>
          <div className="msg-pied">
            <button className="btn" type="submit" disabled={busy || (enseignant && f.a === 'parents' && !nbParents)}>
              {busy ? 'Envoi…' : absence ? 'Signaler' : 'Envoyer'}
            </button>
          </div>
        </form>
      )}

      {enseignant && absences.data?.length > 0 && (
        <div className="msg-absences">
          <p>Absences signalées</p>
          {absences.data.map((a) => (
            <div key={a.id}>
              <IcCalendrier size={16} />
              <span>
                <b>{new Date(a.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</b>
                <small>{a.motif || 'Sans motif'}</small>
              </span>
              <button type="button" className="lien-action" onClick={async () => (await api.delete(`/api/presence-enseignants/${a.id}`), absences.reload())}>
                Annuler
              </button>
            </div>
          ))}
        </div>
      )}

      {enseignant && tout.length > 0 && (
        <div className="msg-filtres" role="tablist">
          {[
            ['tous', `Tous${nonLus ? ` (${nonLus})` : ''}`],
            ['parents', 'Parents'],
            ['etablissement', 'Établissement'],
          ].map(([k, t]) => (
            <button key={k} type="button" role="tab" aria-selected={filtre === k} onClick={() => setFiltre(k)}>
              {t}
            </button>
          ))}
        </div>
      )}

      {liste.loading && !liste.data && <p className="muted">Chargement…</p>}
      {liste.data && visibles.length === 0 && (
        <div className="vide">
          <b>Aucun message</b>
          <small>{etablissement ? 'Les messages des familles et des enseignants apparaîtront ici.' : 'Vos échanges apparaîtront ici.'}</small>
        </div>
      )}
      {visibles.length > 0 && (
        <div className="msg-liste">
          {visibles.map((c) => (
            <Ligne key={c.id} c={c} etablissement={etablissement} />
          ))}
        </div>
      )}
    </div>
  )
}
