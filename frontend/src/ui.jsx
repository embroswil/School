import { useState as useStateUi } from 'react'
import { ChoixLangue } from './i18n.jsx'

export function Field({ label, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}

export function Note({ kind = 'error', children }) {
  if (!children) return null
  return (
    <p className={`note note-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  )
}

export function Loading() {
  return <p className="muted">Chargement…</p>
}

export function Empty({ children }) {
  return <p className="muted">{children}</p>
}

// Champ mot de passe avec bouton « œil » pour afficher ou masquer la saisie
export function ChampMotDePasse({ value, onChange, autoComplete = 'current-password', placeholder, minLength, required = true, invalide = false }) {
  const [voir, setVoir] = useStateUi(false)
  return (
    <span className="champ-mdp">
      <input
        className="input"
        type={voir ? 'text' : 'password'}
        autoComplete={autoComplete}
        placeholder={placeholder}
        minLength={minLength}
        value={value}
        onChange={onChange}
        required={required}
        style={invalide ? { borderColor: 'var(--danger)' } : undefined}
      />
      <button type="button" className="oeil" onClick={() => setVoir(!voir)} aria-label={voir ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
        {voir ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <path d="m1 1 22 22" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </span>
  )
}

// Mise en page des ecrans de connexion, d'inscription et de mot de passe oublie
export function PageAuth({ titre, sousTitre, retour, children, pied }) {
  return (
    <div className="auth">
      <header className="auth-haut">
        <a className="brand" href="#/" style={{ color: '#fff' }}>
          School<span>.</span>
        </a>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ChoixLangue />
          {retour}
        </span>
      </header>
      <main className="auth-main">
        <div className="auth-entete">
          <h1>{titre}</h1>
          {sousTitre && <p>{sousTitre}</p>}
        </div>
        {children}
        {pied && <div className="auth-pied-lien">{pied}</div>}
        <p className="auth-securite">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
            <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
          </svg>
          Connexion chiffrée · vos données restent privées
        </p>
      </main>
      <footer className="auth-pied">School by Embroswil · © {new Date().getFullYear()}</footer>
    </div>
  )
}
