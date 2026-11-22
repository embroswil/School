import { useState } from 'react'
import { envoyerOuGarder } from '../horsligne.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'

const ROLES = { parent: 'Parent', student: 'Élève', teacher: 'Enseignant' }

export default function Conversation({ id }) {
  const { user } = useAuth()
  const etablissement = user.role === 'principal'
  const conv = useApi(`/api/boite/messages/${id}`)
  const [texte, setTexte] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [enAttente, setEnAttente] = useState([]) // messages ecrits sans reseau

  async function repondre(e) {
    e.preventDefault()
    if (!texte.trim()) return
    setError('')
    setBusy(true)
    try {
      const r = await envoyerOuGarder({ cle: `reponse-${id}-${Date.now()}`, path: `/api/boite/messages/${id}`, body: { body: texte }, libelle: 'Message' })
      if (r.attente) setEnAttente((l) => [...l, texte])
      setTexte('')
      if (!r.attente) conv.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  const d = conv.data
  // cote « ecole » : l'administrateur, ou l'enseignant dans une conversation avec un parent
  const cote = d ? d.coteEcole ?? etablissement : etablissement
  const nomEns = d?.enseignant ? `${d.enseignant.first_name} ${d.enseignant.last_name}` : ''
  // interlocuteur : nom, et ce qui le relie (parent de…, enseignant, etablissement)
  const ini = (t) => String(t || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join('').toUpperCase()
  let nom = ''
  let sous = ''
  if (d) {
    if (cote) {
      nom = `${d.auteur.first_name} ${d.auteur.last_name}`
      sous = d.eleve ? `Parent de ${d.eleve.first_name} ${d.eleve.last_name}` : ROLES[d.auteur.role] || ''
    } else if (d.enseignant) {
      nom = nomEns
      sous = d.eleve ? `Enseignant de ${d.eleve.first_name}` : 'Enseignant'
    } else {
      nom = user.schoolName || 'Établissement'
      sous = 'Établissement'
    }
  }
  // separateur de jour entre les messages
  const jourDe = (x) => new Date(x).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  let dernierJour = ''

  return (
    <div className="ig-conv">
      {conv.loading && !d && <p className="muted">Chargement…</p>}
      {conv.error && <Note>{conv.error}</Note>}
      {d && (
        <>
          <header className="ig-conv-tete">
            <span className="ig-avatar petit">{ini(nom)}</span>
            <span className="ig-conv-qui">
              <b data-brut>{nom}</b>
              <small data-brut>{[sous, d.conversation.subject].filter(Boolean).join(' · ')}</small>
            </span>
            {etablissement && !d.enseignant && d.auteur?.phone && (
              <a className="ig-appel" href={`tel:${d.auteur.phone}`} aria-label="Appeler">
                {d.auteur.phone}
              </a>
            )}
          </header>
          <div className="ig-fil">
            {d.messages.map((m) => {
              const moi = cote ? m.from_school : !m.from_school
              const j = jourDe(m.created_at)
              const sep = j !== dernierJour
              dernierJour = j
              return (
                <div key={m.id} className="ig-groupe">
                  {sep && <p className="ig-jour">{j}</p>}
                  <div className={`ig-bulle ${moi ? 'moi' : 'lui'}`}>
                    <span data-brut>{m.body}</span>
                    <time>{new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time>
                  </div>
                </div>
              )
            })}
            {enAttente.map((t, i) => (
              <div key={`a${i}`} className="ig-bulle moi attente">
                <span>{t}</span>
                <time>Envoyé dès le retour du réseau</time>
              </div>
            ))}
          </div>
          <Note>{error}</Note>
          {d?.lectureSeule ? (
            // Message d'un enseignant : le parent le lit ; ses questions vont a l'etablissement
            <div className="ig-lecture">
              <span>Vos questions vont à l’établissement.</span>
              <a className="btn" href="#/messages?nouveau=etablissement">
                Écrire à l’établissement
              </a>
            </div>
          ) : (
            <form className="ig-saisie" onSubmit={repondre}>
              <textarea rows={1} placeholder="Message…" value={texte} onChange={(e) => setTexte(e.target.value)} />
              <button type="submit" disabled={busy || !texte.trim()}>
                {busy ? '…' : 'Envoyer'}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  )
}
