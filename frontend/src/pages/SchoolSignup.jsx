import { useState } from 'react'
import { api } from '../api.js'
import { Field, Note } from '../ui.jsx'
import { useAuth } from '../auth.jsx'

const TYPES = { maternelle: 'Maternelle', primaire: 'École primaire', college: 'Collège', lycee: 'Lycée' }
const vide = {
  name: '', type: 'lycee', city: '', address: '', studentCount: '',
  contactFirstName: '', contactLastName: '', contactFunction: '', contactEmail: '', contactPhone: '', password: '', message: '',
}

// « Inscrire mon etablissement » : l'etablissement est cree tout de suite et le responsable est connecte
export default function SchoolSignup() {
  const { login } = useAuth()
  const [f, setF] = useState(vide)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [existe, setExiste] = useState(false)
  const maj = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  async function envoyer(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api.post('/api/demandes-etablissements', f, { auth: false })
      // connexion immediate : le responsable arrive sur son tableau de bord
      await login(f.contactEmail.trim(), f.password)
      window.location.hash = '/'
      return
    } catch (err) {
      setError(err.message)
      setExiste(err.status === 409 && /compte existe/.test(err.message))
    }
    setBusy(false)
  }


  return (
    <div className="public">
      <header className="public-top">
        <a className="brand" href="#/">
          Sùkûl<span>.</span>
        </a>
        <a href="#/connexion" className="muted" style={{ fontWeight: 700 }}>
          Se connecter
        </a>
      </header>
      <main className="public-main">
        <h1 className="page-title">Inscrire mon établissement</h1>
        <p className="lede">
          Rejoignez Sùkûl gratuitement : votre espace est prêt dès l’inscription.
        </p>
        <form onSubmit={envoyer}>
          <h2 className="section-title">L’établissement</h2>
          <div className="card">
            <Field label="Nom de l’établissement">
              <input className="input" placeholder="ex. Lycée Bilingue de Bonabéri" value={f.name} onChange={maj('name')} required />
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
            <Field label="Adresse ou quartier">
              <input className="input" value={f.address} onChange={maj('address')} />
            </Field>
            <Field label="Nombre d’élèves (environ)">
              <input className="input" placeholder="ex. 800" value={f.studentCount} onChange={maj('studentCount')} />
            </Field>
          </div>

          <h2 className="section-title">Le responsable du compte</h2>
          <p className="muted" style={{ marginTop: -6, marginBottom: 10, fontSize: 14 }}>
            La personne de votre personnel qui administrera l’établissement sur Sùkûl.
          </p>
          <div className="card">
            <div className="grid2">
              <Field label="Prénom">
                <input className="input" value={f.contactFirstName} onChange={maj('contactFirstName')} required />
              </Field>
              <Field label="Nom">
                <input className="input" value={f.contactLastName} onChange={maj('contactLastName')} required />
              </Field>
            </div>
            <Field label="Fonction">
              <input className="input" placeholder="ex. Censeur, Surveillant général, Secrétaire" value={f.contactFunction} onChange={maj('contactFunction')} />
            </Field>
            <Field label="Adresse e-mail">
              <input className="input" type="email" value={f.contactEmail} onChange={maj('contactEmail')} required />
            </Field>
            <Field label="Téléphone">
              <input className="input" type="tel" placeholder="6 XX XX XX XX" value={f.contactPhone} onChange={maj('contactPhone')} required />
            </Field>
            <Field label="Mot de passe du compte (8 caractères minimum)">
              <input className="input" type="password" autoComplete="new-password" minLength={8} value={f.password} onChange={maj('password')} required />
            </Field>
            <Field label="Message (facultatif)">
              <textarea className="input" value={f.message} onChange={maj('message')} />
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
          <button className="btn btn-block" type="submit" disabled={busy} style={{ marginTop: 8 }}>
            {busy ? 'Création…' : 'Créer mon établissement'}
          </button>
        </form>
      </main>
    </div>
  )
}
