import { useEffect } from 'react'
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

const jourDe = (d) => {
  const x = new Date(d)
  const auj = new Date()
  const hier = new Date()
  hier.setDate(hier.getDate() - 1)
  if (x.toDateString() === auj.toDateString()) return 'Aujourd’hui'
  if (x.toDateString() === hier.toDateString()) return 'Hier'
  return x.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}
const heure = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

export default function Notifications() {
  const liste = useApi('/api/boite/notifications')

  // Tout marquer comme lu a l'ouverture
  useEffect(() => {
    api.post('/api/boite/notifications/lues', {}).catch(() => {})
  }, [])

  const lien = (n) => {
    if (n.data?.conversationId) return `#/messages/${n.data.conversationId}`
    if (n.data?.lien) return `#${n.data.lien}`
    return null
  }

  // regroupees par jour, les plus recentes d'abord
  const groupes = []
  for (const n of liste.data || []) {
    const j = jourDe(n.created_at)
    const g = groupes[groupes.length - 1]
    if (g && g.jour === j) g.liste.push(n)
    else groupes.push({ jour: j, liste: [n] })
  }

  return (
    <>
      <h1 className="page-title">Notifications</h1>
      {liste.loading && !liste.data && <p className="muted">Chargement…</p>}
      {liste.data?.length === 0 && (
        <div className="vide">
          <b>Aucune notification</b>
          <small>Les demandes, paiements, absences et messages importants apparaîtront ici.</small>
        </div>
      )}
      {groupes.map((g) => (
        <section key={g.jour} className="notifs">
          <p className="niveau-titre">{g.jour}</p>
          <ul>
            {g.liste.map((n) => {
              const href = lien(n)
              const [Icone, couleur] = TYPES[n.type] || TYPES.system
              const contenu = (
                <>
                  <span className={`notif-ico ${couleur}`} aria-hidden="true">
                    <Icone size={17} />
                  </span>
                  <span className="notif-texte">
                    <span className="notif-ligne">
                      <b>{n.title}</b>
                      <time>{heure(n.created_at)}</time>
                    </span>
                    {n.message && <small>{n.message}</small>}
                  </span>
                  {!n.is_read && <i className="notif-point" aria-label="Non lue" />}
                </>
              )
              return (
                <li key={n.id} className={n.is_read ? '' : 'non-lue'}>
                  {href ? <a href={href}>{contenu}</a> : <div>{contenu}</div>}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </>
  )
}
