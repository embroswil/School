import { useEffect, useState } from 'react'
import { useAuth } from '../auth.jsx'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { IcAppel, IcCarte, IcCloche, IcDocument, IcMegaphone, IcMessages, IcProf, IcBouclier, IcCalendrier } from '../icones.jsx'

// Icone et couleur de chaque type de notification
const TYPES = {
  account: [IcProf, 'bleu'],
  message: [IcMessages, 'bleu'],
  payment: [IcCarte, 'vert'],
  grade: [IcDocument, 'violet'],
  attendance: [IcAppel, 'orange'],
  announcement: [IcMegaphone, 'bleu'],
  reminder: [IcCalendrier, 'orange'],
  discipline: [IcBouclier, 'rouge'],
  system: [IcCloche, 'gris'],
}

// « il y a 5 min », « il y a 3 h », « hier », puis la date
const ilya = (d) => {
  const ms = Date.now() - new Date(d).getTime()
  const mn = Math.round(ms / 60000)
  if (mn < 1) return 'À l’instant'
  if (mn < 60) return `Il y a ${mn} min`
  const h = Math.round(mn / 60)
  if (h < 24) return `Il y a ${h} h`
  const j = Math.round(h / 24)
  if (j === 1) return 'Hier'
  if (j < 7) return `Il y a ${j} jours`
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}

export default function Notifications() {
  const { user } = useAuth()
  const liste = useApi('/api/boite/notifications')
  const [filtre, setFiltre] = useState('toutes')

  // Marquees comme lues une fois affichees (la page montre encore lesquelles etaient nouvelles)
  useEffect(() => {
    if (liste.data) api.post('/api/boite/notifications/lues', {}).catch(() => {})
  }, [liste.data])

  const lien = (n) => {
    if (n.data?.conversationId) return `#/messages/${n.data.conversationId}`
    if (n.data?.lien) return `#${n.data.lien}`
    return null
  }
  // enseignant dans son espace parent : pas de notifications de presence en cours
  const toutes = (liste.data || []).filter((n) => !(user.role === 'parent' && user.roleReel === 'teacher' && n.type === 'attendance'))
  const visibles = filtre === 'non-lues' ? toutes.filter((n) => !n.is_read) : toutes
  const nouvelles = visibles.filter((n) => !n.is_read)
  const avant = visibles.filter((n) => n.is_read)

  const ligne = (n) => {
    const href = lien(n)
    const [Icone, couleur] = TYPES[n.type] || TYPES.system
    const contenu = (
      <>
        <span className={`nf-ico ${couleur}`} aria-hidden="true">
          <Icone size={22} />
        </span>
        <span className="nf-texte">
          <span className="nf-msg">
            <b data-brut>{n.title}</b>
            {n.message && <span data-brut>{` ${n.message}`}</span>}
          </span>
          <time>{ilya(n.created_at)}</time>
        </span>
        {!n.is_read && <i className="nf-point" aria-label="Non lue" />}
      </>
    )
    return (
      <li key={n.id} className={n.is_read ? '' : 'non-lue'}>
        {href ? <a href={href}>{contenu}</a> : <div>{contenu}</div>}
      </li>
    )
  }

  return (
    <div className="nf-page">
      <h1 className="page-title">Notifications</h1>
      <div className="nf-filtres" role="tablist">
        {[
          ['toutes', 'Toutes'],
          ['non-lues', 'Non lues'],
        ].map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={filtre === k} onClick={() => setFiltre(k)}>
            {t}
          </button>
        ))}
      </div>
      {liste.loading && !liste.data && <p className="muted">Chargement…</p>}
      {liste.data && visibles.length === 0 && (
        <div className="vide">
          <b>{filtre === 'non-lues' ? 'Tout est lu' : 'Aucune notification'}</b>
          <small>Notes, absences, paiements et messages importants apparaîtront ici.</small>
        </div>
      )}
      {nouvelles.length > 0 && (
        <section className="nf-section">
          <h2>Nouvelles</h2>
          <ul>{nouvelles.map(ligne)}</ul>
        </section>
      )}
      {avant.length > 0 && (
        <section className="nf-section">
          <h2>Plus tôt</h2>
          <ul>{avant.map(ligne)}</ul>
        </section>
      )}
    </div>
  )
}
