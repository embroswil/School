import { useEffect } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'

const ICONES = { account: '👩‍🏫', message: '✉️', payment: '💳', grade: '📝', attendance: '🗓️', announcement: '📣', reminder: '⏰', system: 'ℹ️' }

const quand = (d) =>
  new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

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

  return (
    <>
      <h1 className="page-title">Notifications</h1>
      {liste.loading && <p className="muted">Chargement…</p>}
      {liste.data?.length === 0 && <p className="lede">Aucune notification pour le moment.</p>}
      {liste.data?.length > 0 && (
        <ul className="rows">
          {liste.data.map((n) => {
            const href = lien(n)
            const contenu = (
              <>
                <span style={{ fontSize: 24 }}>{ICONES[n.type] || '🔔'}</span>
                <div className="row-main">
                  <div className="row-title" style={{ whiteSpace: 'normal' }}>
                    {!n.is_read && <span className="count" style={{ minWidth: 10, height: 10, padding: 0, marginRight: 6 }} />}
                    {n.title}
                  </div>
                  <div className="row-sub" style={{ whiteSpace: 'normal' }}>{n.message}</div>
                  <div className="row-sub" style={{ fontSize: 12 }}>{quand(n.created_at)}</div>
                </div>
              </>
            )
            return href ? (
              <a className="row" href={href} key={n.id}>
                {contenu}
              </a>
            ) : (
              <li className="row" key={n.id}>
                {contenu}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
