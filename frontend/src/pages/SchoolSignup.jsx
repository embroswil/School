import { useState } from 'react'
import { api } from '../api.js'
import { ChampMotDePasse, Field, Note, PageAuth } from '../ui.jsx'
import { useAuth } from '../auth.jsx'
import { VerificationEmail } from './CodeEmail.jsx'

const TYPES = { lycee: 'Lycée', college: 'Collège', primaire: 'École primaire', maternelle: 'Maternelle' }
const FONCTIONS = ['Proviseur', 'Principal', 'Directeur / Directrice', 'Fondateur / Promoteur', 'Censeur', 'Surveillant général', 'Intendant / Économe', 'Secrétaire', 'Autre']
const vide = { name: '', type: 'lycee', city: '', contactFirstName: '', contactLastName: '', contactFunction: '', contactEmail: '', contactPhone: '', password: '' }

// « Inscrire mon etablissement » : l'etablissement est cree tout de suite, le responsable confirme son
// adresse e-mail avec le code recu (obligatoire), puis il arrive sur son tableau de bord.
export default function SchoolSignup() {
  const { login } = useAuth()
  const [f, setF] = useState(vide)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [existe, setExiste] = useState(false)
  const [aVerifier, setAVerifier] = useState(null)
  const maj = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  async function envoyer(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const r = await api.post('/api/demandes-etablissements', f, { auth: false })
      setAVerifier(r?.data || {})
    } catch (err) {
      setError(err.message)
      setExiste(err.status === 409 && /compte existe/.test(err.message))
    }
    setBusy(false)
  }

  // Etablissement cree : confirmation de l'adresse e-mail par le code recu
  if (aVerifier) {
    return (
      <PageAuth onRetour={() => setAVerifier(null)}>
        <div className="card">
          <VerificationEmail
            email={f.contactEmail.trim().toLowerCase()}
            canal={aVerifier.canal}
            destination={aVerifier.destination}
            onConfirme={async () => {
              await login(f.contactEmail.trim(), f.password)
              window.location.hash = '/'
            }}
          />
        </div>
      </PageAuth>
    )
  }

  return (
    <PageAuth
      titre="Inscrire votre établissement"
      sousTitre="Votre espace Sùkûl est prêt dès l’inscription."
      pied={
        <>
          Déjà inscrit ? <a href="#/connexion">Se connecter</a>
        </>
      }
    >
      <form onSubmit={envoyer}>
        <p className="ea-section">Établissement</p>
        <div className="card">
          <Field label="Nom de l’établissement">
            <input className="input" placeholder="ex. Lycée bilingue de Bonabéri" value={f.name} onChange={maj('name')} required />
          </Field>
          <div className="grid2">
            <Field label="Type">
              <select className="input" value={f.type} onChange={maj('type')}>
                {Object.entries(TYPES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ville">
              <input className="input" placeholder="ex. Douala" value={f.city} onChange={maj('city')} required />
            </Field>
          </div>
        </div>

        <p className="ea-section">Responsable du compte</p>
        <div className="card">
          <div className="grid2">
            <Field label="Prénom">
              <input className="input" autoComplete="given-name" value={f.contactFirstName} onChange={maj('contactFirstName')} required />
            </Field>
            <Field label="Nom">
              <input className="input" autoComplete="family-name" value={f.contactLastName} onChange={maj('contactLastName')} required />
            </Field>
          </div>
          <Field label="Fonction">
            <select className="input" value={f.contactFunction} onChange={maj('contactFunction')} required>
              <option value="" disabled>
                Choisir…
              </option>
              {FONCTIONS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Adresse e-mail">
            <input className="input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={f.contactEmail} onChange={maj('contactEmail')} required />
          </Field>
          <Field label="Téléphone">
            <input className="input" type="tel" autoComplete="tel" placeholder="6 XX XX XX XX" value={f.contactPhone} onChange={maj('contactPhone')} required />
          </Field>
          <Field label="Mot de passe">
            <ChampMotDePasse autoComplete="new-password" minLength={8} placeholder="8 caractères minimum" value={f.password} onChange={maj('password')} />
          </Field>
        </div>
        <Note>{error}</Note>
        {existe && (
          <p className="compte-existe">
            <a className="btn btn-quiet" href="#/connexion">
              Se connecter
            </a>
            <a className="btn btn-quiet" href="#/mot-de-passe-oublie">
              Mot de passe oublié
            </a>
          </p>
        )}
        <button className="btn btn-block" type="submit" disabled={busy}>
          {busy ? 'Création…' : 'Créer l’établissement'}
        </button>
      </form>
    </PageAuth>
  )
}
