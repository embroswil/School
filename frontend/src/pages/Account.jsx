import { useRef, useState } from 'react'
import { nomEcole } from '../i18n.jsx'
import { api, session } from '../api.js'
import { useAuth } from '../auth.jsx'
import { ReglagePush, installee } from '../push.jsx'
import { ChampMotDePasse, Field, Note } from '../ui.jsx'
import Recadreur from '../Recadreur.jsx'
import { lancerDidacticiel } from '../Didacticiel.jsx'
import { IcAide, IcCalendrier, IcCarte, IcChevron, IcCle, IcCloche, IcClasses, IcCrayon, IcEcole, IcEleves, IcFamille, IcPhoto, IcProfil, IcSortie, IcTheme } from '../icones.jsx'
import { useApi } from '../hooks.js'
import { changerTheme, lireTheme } from '../theme.js'

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

// Theme de l'application : sombre, clair ou automatique (comme le telephone)
function ChoixTheme() {
  const [t, setT] = useState(lireTheme)
  const choisir = (v) => {
    changerTheme(v)
    setT(v)
  }
  return (
    <span className="choix-theme" role="group" aria-label="Thème">
      {[
        ['sombre', 'Sombre'],
        ['clair', 'Clair'],
        ['auto', 'Auto'],
      ].map(([v, l]) => (
        <button key={v} type="button" aria-pressed={t === v} onClick={() => choisir(v)}>
          {l}
        </button>
      ))}
    </span>
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
    <form className="volet-form" onSubmit={envoyer}>
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
    <form className="volet-form" onSubmit={envoyer}>
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

// Suppression de son propre compte (mot de passe demandé)
function SuppressionCompte({ logout }) {
  const [ouvert, setOuvert] = useState(false)
  const [mdp, setMdp] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function supprimer(e) {
    e.preventDefault()
    if (!window.confirm('Supprimer définitivement votre compte ? Cette action est irréversible.')) return
    setBusy(true)
    setError('')
    try {
      await api.delete('/api/comptes/moi', { password: mdp })
      logout()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  if (!ouvert)
    return (
      <button type="button" className="lien-discret" onClick={() => setOuvert(true)}>
        Supprimer mon compte
      </button>
    )
  return (
    <form onSubmit={supprimer} className="card" style={{ marginTop: 14 }}>
      <b>Supprimer mon compte</b>
      <p className="muted" style={{ fontSize: 13 }}>
        Votre compte et vos accès seront supprimés. Les données de l’établissement (notes, absences, paiements) sont conservées par l’établissement.
      </p>
      <Field label="Votre mot de passe">
        <ChampMotDePasse value={mdp} onChange={(e) => setMdp(e.target.value)} />
      </Field>
      <Note>{error}</Note>
      <div className="actions">
        <button className="btn btn-danger" disabled={busy || !mdp}>
          {busy ? 'Suppression…' : 'Supprimer définitivement'}
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => setOuvert(false)}>
          Annuler
        </button>
      </div>
    </form>
  )
}

const minutes = (hhmm) => {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number)
  return h * 60 + m
}

// Profil de l'enseignant : sa fiche (matieres, classes, eleves, heures par semaine)
function FicheEnseignant({ moi, avatar }) {
  const classes = useApi('/api/notes/mes-classes')
  const emploi = useApi('/api/vie-scolaire/emplois/moi')
  const liste = classes.data || []
  const matieres = [...new Set(liste.flatMap((c) => c.matieres || []))]
  const eleves = liste.reduce((n, c) => n + (c.eleves || 0), 0)
  const heures = Math.round(((emploi.data?.creneaux || []).reduce((n, c) => n + Math.max(0, minutes(c.fin) - minutes(c.debut)), 0) / 60) * 10) / 10
  const principal = liste.filter((c) => c.prof_principal).map((c) => c.name)
  return (
    <section className="profil-ens">
      <div className="profil-ens-tete">
        {avatar}
        <div className="profil-identite">
          <h1 data-brut>
            {moi.firstName} {moi.lastName}
          </h1>
          <p className="profil-poste">
            Enseignant
            {moi.schoolName && (
              <>
                {' · '}
                <span data-brut>{nomEcole(moi.schoolName)}</span>
              </>
            )}
          </p>
        </div>
      </div>
      {matieres.length > 0 && (
        <div className="profil-ens-matieres">
          {matieres.map((m) => (
            <span key={m} data-brut>
              {m}
            </span>
          ))}
        </div>
      )}
      <div className="profil-ens-chiffres">
        <div>
          <b>{classes.data ? liste.length : '–'}</b>
          <small>Classes</small>
        </div>
        <div>
          <b>{classes.data ? eleves : '–'}</b>
          <small>Élèves</small>
        </div>
        <div>
          <b>{emploi.data ? `${String(heures).replace('.', ',')} h` : '–'}</b>
          <small>Par semaine</small>
        </div>
      </div>
      {principal.length > 0 && <p className="profil-ens-pp">{`Professeur principal : ${principal.join(', ')}`}</p>}
    </section>
  )
}

export default function Account() {
  const { user, logout, changerEspace } = useAuth()
  const [moi, setMoi] = useState(user)
  const [passage, setPassage] = useState(false)
  const [ouvert, setOuvert] = useState(null)
  const champPhoto = useRef(null)
  const [aRecadrer, setARecadrer] = useState(null)
  async function envoyerPhoto(photo) {
    setARecadrer(null)
    try {
      await api.put('/api/comptes/photo', { photo })
      setMoi((m) => ({ ...m, profilePicture: photo }))
      const s2 = session.get()
      if (s2?.user) session.set({ ...s2, user: { ...s2.user, profilePicture: photo } })
    } catch (_) {
      // l'image est peut-etre trop lourde : on reessaie avec une autre
    }
  }
  const bascule = (k) => setOuvert((o) => (o === k ? null : k))
  const initiales = `${(moi.firstName || '?')[0]}${(moi.lastName || '')[0] || ''}`.toUpperCase()
  const emailReel = moi.email && !/@(tel|inscrit)\.school$/.test(moi.email)
  const emailActif = moi.notifEmail !== false
  const rapportActif = moi.rapportQuotidien !== false

  async function basculerEmail() {
    const v = !emailActif
    await api.put('/api/auth/me', { notifEmail: v })
    setMoi((m) => ({ ...m, notifEmail: v }))
    const s2 = session.get()
    if (s2?.user) session.set({ ...s2, user: { ...s2.user, notifEmail: v } })
  }

  async function basculerRapport() {
    const v = !rapportActif
    await api.put('/api/auth/me', { rapportQuotidien: v })
    setMoi((m) => ({ ...m, rapportQuotidien: v }))
    const s2 = session.get()
    if (s2?.user) session.set({ ...s2, user: { ...s2.user, rapportQuotidien: v } })
  }

  const avatar = (
    <>
      <button type="button" className="profil-avatar profil-avatar-btn" onClick={() => champPhoto.current?.click()} aria-label="Changer ma photo" title="Changer ma photo">
        {moi.profilePicture ? <img src={moi.profilePicture} alt="" /> : initiales}
        <span className="profil-avatar-cam" aria-hidden="true">
          <IcPhoto size={14} />
        </span>
      </button>
      <input ref={champPhoto} type="file" accept="image/*" hidden onChange={(e) => {
        const f = e.target.files?.[0]
        e.target.value = ''
        if (f) setARecadrer(f)
      }} />
      {aRecadrer && <Recadreur fichier={aRecadrer} ratio={1} sortie={320} rond onValider={envoyerPhoto} onAnnuler={() => setARecadrer(null)} />}
    </>
  )

  return (
    <div className="profil">
      {moi.role === 'teacher' ? (
        <FicheEnseignant moi={moi} avatar={avatar} />
      ) : (
        <section className="profil-carte">
          {avatar}
          <div className="profil-identite">
            <h1 data-brut>
              {moi.firstName} {moi.lastName}
            </h1>
            <p className="profil-poste">
              {ROLES[moi.role] || moi.role}
              {moi.schoolName && (
                <>
                  {' · '}
                  <span data-brut>{nomEcole(moi.schoolName)}</span>
                </>
              )}
            </p>
          </div>
        </section>
      )}

      {moi.role === 'teacher' && (
        <>
          <p className="groupe-titre">Enseignement</p>
          <div className="liste-reglages">
            <Reglage Icone={IcEleves} titre="Mes classes et matières" href="#/mes-classes" />
            <Reglage Icone={IcClasses} titre="Emploi du temps" href="#/emploi" />
            <Reglage Icone={IcCalendrier} titre="Mes absences" href="#/mon-absence" />
            <Reglage Icone={IcEcole} titre="Mes établissements" href="#/mes-etablissements" />
            <Reglage
              Icone={IcFamille}
              titre="Espace parent"
              valeur={passage ? '…' : 'Mes enfants'}
              onClick={async () => {
                setPassage(true)
                try {
                  await changerEspace('parent')
                  window.location.hash = '/'
                } catch {
                  // l'espace actuel reste affiche
                }
                setPassage(false)
              }}
            />
          </div>
        </>
      )}

      <p className="groupe-titre">Compte</p>
      <div className="liste-reglages">
        <Reglage Icone={IcCrayon} titre="Informations personnelles" onClick={() => bascule('infos')} />
        {ouvert === 'infos' && (
          <div className="reglage-volet">
            <Informations
              user={moi}
              onDone={(d) => {
                setMoi((m) => ({ ...m, ...d }))
                setOuvert(null)
              }}
            />
          </div>
        )}
        <Reglage Icone={IcCle} titre="Mot de passe" onClick={() => bascule('mdp')} />
        {ouvert === 'mdp' && (
          <div className="reglage-volet">
            <MotDePasse logout={logout} />
          </div>
        )}
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
        {moi.role === 'parent' && (
          <Reglage
            Icone={IcCloche}
            titre="Résumé de la journée"
            onClick={basculerRapport}
            droite={
              <span className={`interrupteur ${rapportActif ? 'on' : ''}`} role="switch" aria-checked={rapportActif}>
                <i />
              </span>
            }
          />
        )}
      </div>
      <ReglagePush />

      <p className="groupe-titre">Affichage</p>
      <div className="liste-reglages">
        <Reglage Icone={IcTheme} titre="Thème" droite={<ChoixTheme />} />
      </div>

      {moi.role === 'principal' && (
        <>
          <p className="groupe-titre">Établissement</p>
          <div className="liste-reglages">
            <Reglage Icone={IcCarte} titre="Abonnement Sùkûl" href="#/abonnement" />
            <Reglage Icone={IcProfil} titre="Administrateurs" href="#/administrateurs" />
          </div>
        </>
      )}

      <p className="groupe-titre">Aide</p>
      <div className="liste-reglages">
        <Reglage Icone={IcAide} titre="Didacticiel" valeur="Revoir" onClick={lancerDidacticiel} />
        <Reglage Icone={IcAide} titre="Guide de démarrage" href="#/guide" />
        <Reglage Icone={IcAide} titre="Questions fréquentes" href="#/faq" />
        {!installee() && <Reglage Icone={IcAide} titre="Installer l’application" href="#/installer" />}
      </div>

      <button type="button" className="btn btn-quiet btn-block profil-sortie" onClick={logout}>
        <IcSortie size={18} /> Se déconnecter
      </button>

      <nav className="profil-liens">
        <a href="#/guide">Guide</a>
        <a href="#/confidentialite">Confidentialité</a>
        <a href="#/conditions">Conditions</a>
      </nav>
      {moi.role !== 'admin' && !moi.espace && <SuppressionCompte logout={logout} />}
    </div>
  )
}
