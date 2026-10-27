import { useState } from 'react'
import { api, session } from '../api.js'
import { useAuth } from '../auth.jsx'
import { Field, Note } from '../ui.jsx'
import { IcAide, IcBouclier, IcCarte, IcChevron, IcCle, IcCloche, IcCrayon, IcEcole, IcSortie } from '../icones.jsx'

const ROLES = {
  admin: 'Administrateur de la plateforme',
  principal: 'Administrateur de l’établissement',
  teacher: 'Enseignant',
  parent: 'Parent',
  student: 'Élève',
}

function Reglage({ Icone, titre, valeur, onClick, href, danger }) {
  const contenu = (
    <>
      <span className="ico">
        <Icone size={20} />
      </span>
      <span>{titre}</span>
      <span className="val">
        {valeur}
        <IcChevron size={16} />
      </span>
    </>
  )
  return href ? (
    <a className={`reglage ${danger ? 'danger' : ''}`} href={href}>
      {contenu}
    </a>
  ) : (
    <button type="button" className={`reglage ${danger ? 'danger' : ''}`} onClick={onClick}>
      {contenu}
    </button>
  )
}

function Informations({ user, onDone }) {
  const [f, setF] = useState({ firstName: user.firstName || '', lastName: user.lastName || '', phone: user.phone || '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const maj = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  async function envoyer(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const r = await api.put('/api/auth/me', f)
      // Met a jour l'utilisateur garde en memoire
      const s = session.get()
      if (s?.user) session.set({ ...s, user: { ...s.user, ...r.data } })
      onDone(r.data)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }
  return (
    <form className="card" onSubmit={envoyer}>
      <div className="grid2">
        <Field label="Prénom">
          <input className="input" value={f.firstName} onChange={maj('firstName')} required />
        </Field>
        <Field label="Nom">
          <input className="input" value={f.lastName} onChange={maj('lastName')} required />
        </Field>
      </div>
      <Field label="Téléphone">
        <input className="input" type="tel" placeholder="6 XX XX XX XX" value={f.phone} onChange={maj('phone')} />
      </Field>
      <Field label="Adresse e-mail">
        <input className="input" value={user.email} disabled />
      </Field>
      <Note>{error}</Note>
      <button className="btn btn-block" type="submit" disabled={busy}>
        {busy ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </form>
  )
}

function MotDePasse({ logout }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function envoyer(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/api/auth/change-password', { currentPassword: current, newPassword: next })
      await logout() // toutes les sessions sont fermees par le serveur
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <form className="card" onSubmit={envoyer}>
      <Field label="Mot de passe actuel">
        <input className="input" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <Field label="Nouveau mot de passe (8 caractères minimum)">
        <input className="input" type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <Note>{error}</Note>
      <button className="btn btn-block" type="submit" disabled={busy}>
        {busy ? 'Enregistrement…' : 'Changer le mot de passe'}
      </button>
      <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
        Vous serez déconnecté de tous vos appareils.
      </p>
    </form>
  )
}

export default function Account() {
  const { user, logout } = useAuth()
  const [moi, setMoi] = useState(user)
  const [ouvert, setOuvert] = useState(null)
  const bascule = (k) => setOuvert((o) => (o === k ? null : k))
  const initiales = `${(moi.firstName || '?')[0]}${(moi.lastName || '')[0] || ''}`.toUpperCase()

  return (
    <>
      <section className="card profil-tete" style={{ marginTop: 4 }}>
        <span className="avatar">{initiales}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ font: '800 20px/1.2 var(--font-display)' }}>
            {moi.firstName} {moi.lastName}
          </div>
          <div className="muted" style={{ fontSize: 14 }}>
            {ROLES[moi.role] || moi.role}
          </div>
          {moi.schoolName && (
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)', marginTop: 2 }}>{moi.schoolName}</div>
          )}
        </div>
      </section>

      <p className="groupe-titre">Mon compte</p>
      <div className="liste-reglages">
        <Reglage Icone={IcCrayon} titre="Informations personnelles" valeur={moi.phone || ''} onClick={() => bascule('infos')} />
        <Reglage Icone={IcCle} titre="Mot de passe" valeur="••••••••" onClick={() => bascule('mdp')} />
        <Reglage Icone={IcCloche} titre="Notifications" href="#/notifications" />
        {moi.role !== 'admin' && (
          <button
            type="button"
            className="reglage"
            onClick={async () => {
              const v = !(moi.notifEmail !== false)
              await api.put('/api/auth/me', { notifEmail: v })
              setMoi((m) => ({ ...m, notifEmail: v }))
              const s2 = session.get()
              if (s2?.user) session.set({ ...s2, user: { ...s2.user, notifEmail: v } })
            }}
          >
            <span className="ico">
              <IcCloche size={20} />
            </span>
            <span>Notifications par email</span>
            <span className="val">
              <span className={`tag ${moi.notifEmail !== false ? 'tag-now' : 'tag-off'}`}>{moi.notifEmail !== false ? 'Activées' : 'Désactivées'}</span>
            </span>
          </button>
        )}
      </div>
      {ouvert === 'infos' && (
        <div style={{ marginTop: 12 }}>
          <Informations
            user={moi}
            onDone={(d) => {
              setMoi((m) => ({ ...m, ...d }))
              setOuvert(null)
            }}
          />
        </div>
      )}
      {ouvert === 'mdp' && (
        <div style={{ marginTop: 12 }}>
          <MotDePasse logout={logout} />
        </div>
      )}

      {moi.role === 'principal' && (
        <>
          <p className="groupe-titre">Mon établissement</p>
          <div className="liste-reglages">
            <Reglage Icone={IcEcole} titre="Enseignants" href="#/enseignants" />
            <Reglage Icone={IcCarte} titre="Moyens de paiement" valeur="Orange, MTN…" href="#/scolarite" />
          </div>
        </>
      )}

      <p className="groupe-titre">Aide</p>
      <div className="liste-reglages">
        {moi.role !== 'admin' && moi.role !== 'principal' && <Reglage Icone={IcAide} titre="Contacter l’établissement" href="#/messages" />}
        <Reglage Icone={IcBouclier} titre="Confidentialité" valeur="Vos données restent privées" onClick={() => bascule('conf')} />
      </div>
      {ouvert === 'conf' && (
        <div className="card" style={{ marginTop: 12, fontSize: 15 }}>
          Vos informations ne sont visibles que par votre établissement et les personnes autorisées (vous, et pour un élève, ses parents). Elles ne
          sont jamais revendues. Pour toute question, écrivez à l’établissement depuis l’onglet Messages.
        </div>
      )}

      <div className="liste-reglages" style={{ marginTop: 22 }}>
        <Reglage Icone={IcSortie} titre="Se déconnecter" onClick={logout} danger />
      </div>
      <p className="muted" style={{ textAlign: 'center', fontSize: 12, marginTop: 18 }}>
        {moi.email} · School by Embroswil
      </p>
    </>
  )
}
