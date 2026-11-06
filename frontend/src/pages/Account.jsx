import { useState } from 'react'
import { api, session } from '../api.js'
import { useAuth } from '../auth.jsx'
import { ReglagePush, installee } from '../push.jsx'
import { ChoixLangue } from '../i18n.jsx'
import { basculerVersionOrdi, ordiForce } from '../ordinateur.jsx'
import { Field, Note } from '../ui.jsx'
import { IcAide, IcBouclier, IcCarte, IcChevron, IcCle, IcCloche, IcCrayon, IcEcole, IcSortie } from '../icones.jsx'

const ROLES = {
  admin: 'Administrateur de la plateforme',
  principal: 'Administrateur de l’établissement',
  teacher: 'Enseignant',
  parent: 'Parent',
  student: 'Élève',
}

function Reglage({ Icone, titre, valeur, onClick, href, danger, droite }) {
  const contenu = (
    <>
      <span className="ico">
        <Icone size={20} />
      </span>
      <span>{titre}</span>
      <span className="val">
        {droite || (
          <>
            {valeur}
            <IcChevron size={16} />
          </>
        )}
      </span>
    </>
  )
  if (droite && !href && !onClick) return <div className={`reglage ${danger ? 'danger' : ''}`}>{contenu}</div>
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
  const emailReel = moi.email && !/@(tel|inscrit)\.school$/.test(moi.email)
  const emailActif = moi.notifEmail !== false

  async function basculerEmail() {
    const v = !emailActif
    await api.put('/api/auth/me', { notifEmail: v })
    setMoi((m) => ({ ...m, notifEmail: v }))
    const s2 = session.get()
    if (s2?.user) session.set({ ...s2, user: { ...s2.user, notifEmail: v } })
  }

  return (
    <div className="profil">
      <section className="profil-carte">
        <span className="profil-avatar">{initiales}</span>
        <div className="profil-identite">
          <h1>
            {moi.firstName} {moi.lastName}
          </h1>
          <span className="profil-role">{ROLES[moi.role] || moi.role}</span>
          {moi.schoolName && <p className="profil-ecole">{moi.schoolName}</p>}
          <p className="profil-contact">
            {emailReel && <span>{moi.email}</span>}
            {moi.phone && <span>{moi.phone}</span>}
          </p>
        </div>
        <button type="button" className="btn btn-quiet profil-modifier" onClick={() => bascule('infos')}>
          Modifier
        </button>
      </section>
      {ouvert === 'infos' && (
        <div style={{ margin: '12px 0' }}>
          <Informations
            user={moi}
            onDone={(d) => {
              setMoi((m) => ({ ...m, ...d }))
              setOuvert(null)
            }}
          />
        </div>
      )}

      <p className="groupe-titre">Compte</p>
      <div className="liste-reglages">
        <Reglage Icone={IcCrayon} titre="Informations personnelles" onClick={() => bascule('infos')} />
        <Reglage Icone={IcCle} titre="Mot de passe" valeur="••••••••" onClick={() => bascule('mdp')} />
      </div>
      {ouvert === 'mdp' && (
        <div style={{ marginTop: 12 }}>
          <MotDePasse logout={logout} />
        </div>
      )}

      <p className="groupe-titre">Notifications</p>
      <div className="liste-reglages">
        <Reglage Icone={IcCloche} titre="Notifications reçues" valeur="Tout voir" href="#/notifications" />
        {moi.role !== 'admin' && emailReel && (
          <Reglage
            Icone={IcCloche}
            titre="Notifications par email"
            onClick={basculerEmail}
            droite={
              <span className={`interrupteur ${emailActif ? 'on' : ''}`} role="switch" aria-checked={emailActif}>
                <i />
              </span>
            }
          />
        )}
      </div>
      <ReglagePush />

      <p className="groupe-titre">Préférences</p>
      <div className="liste-reglages">
        <Reglage Icone={IcAide} titre="Langue" droite={<ChoixLangue />} />
        {(
          <Reglage
            Icone={IcEcole}
            titre="Version ordinateur"
            onClick={() => basculerVersionOrdi(!ordiForce())}
            droite={
              <span className={`interrupteur ${ordiForce() ? 'on' : ''}`} role="switch" aria-checked={ordiForce()}>
                <i />
              </span>
            }
          />
        )}
      </div>

      {moi.role === 'principal' && (
        <>
          <p className="groupe-titre">Mon établissement</p>
          <div className="liste-reglages">
            <Reglage Icone={IcEcole} titre="Enseignants" href="#/presence-enseignants" />
            <Reglage Icone={IcCarte} titre="Moyens de paiement" valeur="Orange, MTN…" href="#/scolarite" />
            <Reglage Icone={IcCarte} titre="Abonnement School" href="#/abonnement" />
          </div>
        </>
      )}

      <p className="groupe-titre">Aide</p>
      <div className="liste-reglages">
        {moi.role !== 'admin' && moi.role !== 'principal' && <Reglage Icone={IcAide} titre="Contacter l’établissement" href="#/messages" />}
        {!installee() && <Reglage Icone={IcAide} titre="Installer l’application" valeur="Écran d’accueil" href="#/installer" />}
        <Reglage Icone={IcAide} titre="Guide de démarrage" href="#/guide" />
        <Reglage Icone={IcBouclier} titre="Confidentialité" href="#/confidentialite" />
        <Reglage Icone={IcBouclier} titre="Conditions d’utilisation" href="#/conditions" />
      </div>

      <button type="button" className="btn btn-quiet btn-danger btn-block profil-sortie" onClick={logout}>
        <IcSortie size={18} /> Se déconnecter
      </button>
      <p className="muted" style={{ textAlign: 'center', fontSize: 12, marginTop: 14 }}>
        School by Embroswil
      </p>
    </div>
  )
}
