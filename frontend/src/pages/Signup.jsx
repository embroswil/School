import { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { Field, Note } from '../ui.jsx'
import { VerificationEmail } from './CodeEmail.jsx'

const PROFILS = [
  { id: 'parent', ico: '👨‍👩‍👧', titre: 'Parent ou proche', texte: 'Père, mère, tuteur, oncle… je suis la scolarité d’un ou plusieurs enfants.' },
  { id: 'student', ico: '🎒', titre: 'Élève', texte: 'Je consulte mes notes et les infos de ma classe.' },
  { id: 'teacher', ico: '👩‍🏫', titre: 'Enseignant', texte: 'Je publie les notes et je fais l’appel. Compte validé par l’établissement.' },
]
const TYPES = { maternelle: 'Maternelle', primaire: 'École primaire', college: 'Collège', lycee: 'Lycée' }
const enfantVide = { prenom: '', nom: '', classe: '', dateNaissance: '', lien: 'pere' }
const LIENS = [['pere', 'Père'], ['mere', 'Mère'], ['tuteur', 'Tuteur / tutrice'], ['oncle_tante', 'Oncle / tante'], ['grand_parent', 'Grand-parent'], ['frere_soeur', 'Frère / sœur'], ['autre', 'Autre proche']]

export default function Signup() {
  const { login, signup } = useAuth()
  const [etape, setEtape] = useState(1)
  const [role, setRole] = useState('')
  const [ecoles, setEcoles] = useState(null)
  const [recherche, setRecherche] = useState('')
  const [ecole, setEcole] = useState(null)
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', classe: '', dateNaissance: '', matieres: '', diplome: '', experience: '', message: '' })
  const [enfants, setEnfants] = useState([{ ...enfantVide }])
  // Enseignant : matieres et classes de l'etablissement choisi
  const [structure, setStructure] = useState(null)
  const [matiereIds, setMatiereIds] = useState([])
  const [classeIds, setClasseIds] = useState([])
  useEffect(() => {
    if (role !== 'teacher' || !ecole) return
    setStructure(null)
    api
      .get(`/api/schools/${ecole.id}/structure`)
      .then((r) => setStructure(r.data))
      .catch(() => setStructure({ matieres: [], classes: [] }))
  }, [role, ecole])
  const basculer = (setter) => (id) => setter((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [fini, setFini] = useState(null)
  const [aVerifier, setAVerifier] = useState(null) // compte cree, email a confirmer

  useEffect(() => {
    api
      .get('/api/schools/public')
      .then((r) => setEcoles(r.data || []))
      .catch(() => setEcoles([]))
  }, [])

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return (ecoles || []).filter((e) => !q || `${e.name} ${e.city || ''}`.toLowerCase().includes(q))
  }, [ecoles, recherche])

  const maj = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const majEnfant = (i, k) => (e) => setEnfants((l) => l.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))

  async function envoyer(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const donnees = {
        role,
        schoolId: ecole.id,
        ...f,
        enfants: role === 'parent' ? enfants : undefined,
        matiereIds: role === 'teacher' ? matiereIds : undefined,
        classeIds: role === 'teacher' ? classeIds : undefined,
      }
      const res = await signup(donnees)
      setAVerifier({ message: res.message })
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  // Compte cree : confirmation de l'email par le code recu
  if (aVerifier && !fini) {
    return (
      <div className="public">
        <main className="public-main" style={{ paddingTop: 30 }}>
          <VerificationEmail
            email={f.email.trim().toLowerCase()}
            onConfirme={async () => {
              if (role === 'teacher') {
                setFini(aVerifier.message)
                return
              }
              await login(f.email, f.password)
              window.location.hash = '/'
            }}
            onPlusTard={async () => {
              if (role === 'teacher') {
                setFini(aVerifier.message)
                return
              }
              await login(f.email, f.password)
              window.location.hash = '/'
            }}
          />
        </main>
      </div>
    )
  }

  if (fini) {
    return (
      <div className="public">
        <main className="public-main" style={{ paddingTop: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 56 }}>⏳</div>
          <h1 className="page-title">Demande envoyée</h1>
          <p className="lede">{fini}</p>
          <a className="btn" href="#/">
            Retour à l’accueil
          </a>
        </main>
      </div>
    )
  }

  return (
    <div className="public">
      <header className="public-top">
        <a className="brand" href="#/">
          School<span>.</span>
        </a>
        <a href="#/connexion" className="muted" style={{ fontWeight: 700 }}>
          Se connecter
        </a>
      </header>
      <main className="public-main">
        <div className="steps" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <span key={n} className={n <= etape ? 'on' : ''} />
          ))}
        </div>

        {etape === 1 && (
          <>
            <h1 className="page-title">Créer un compte</h1>
            <p className="lede">Qui êtes-vous ?</p>
            <div className="choices">
              {PROFILS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="choice"
                  aria-pressed={role === p.id}
                  onClick={() => {
                    setRole(p.id)
                    setEtape(2)
                  }}
                >
                  <span className="ico">{p.ico}</span>
                  <span>
                    <b>{p.titre}</b>
                    <span className="muted">{p.texte}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {etape === 2 && (
          <>
            <button type="button" className="back btn-quiet" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0 }} onClick={() => setEtape(1)}>
              ← Retour
            </button>
            <h1 className="page-title">Votre établissement</h1>
            <p className="lede">
              {role === 'parent' ? 'Choisissez l’établissement de votre enfant.' : 'Choisissez votre établissement.'}
            </p>
            <div className="searchbar">
              <input className="input" placeholder="Rechercher par nom ou par ville" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
            </div>
            {ecoles === null && <p className="muted">Chargement…</p>}
            {ecoles && filtrees.length === 0 && (
              <p className="muted">Aucun établissement trouvé. Il doit d’abord être ajouté par l’administration de School.</p>
            )}
            <div className="choices">
              {filtrees.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className="choice"
                  aria-pressed={ecole?.id === e.id}
                  onClick={() => {
                    setEcole(e)
                    setEtape(3)
                  }}
                >
                  <span className="ico" style={e.photo ? { backgroundImage: `url(${e.photo})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
                    {e.photo ? '' : '🏫'}
                  </span>
                  <span>
                    <b>{e.name}</b>
                    <span className="muted">
                      {TYPES[e.type] || ''}
                      {e.city ? ` · ${e.city}` : ''}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {etape === 3 && (
          <form onSubmit={envoyer}>
            <button type="button" className="back" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0 }} onClick={() => setEtape(2)}>
              ← Retour
            </button>
            <h1 className="page-title">Vos informations</h1>
            <p className="lede">
              {ecole?.name}
              {role === 'teacher' && ' · votre compte sera validé par l’établissement'}
            </p>

            <div className="card">
              <div className="grid2">
                <Field label="Prénom">
                  <input className="input" value={f.firstName} onChange={maj('firstName')} required />
                </Field>
                <Field label="Nom">
                  <input className="input" value={f.lastName} onChange={maj('lastName')} required />
                </Field>
              </div>
              <Field label="Adresse e-mail">
                <input className="input" type="email" autoComplete="email" value={f.email} onChange={maj('email')} required />
              </Field>
              <Field label="Téléphone">
                <input className="input" type="tel" placeholder="6 XX XX XX XX" value={f.phone} onChange={maj('phone')} />
              </Field>
              <Field label="Mot de passe (8 caractères minimum)">
                <input className="input" type="password" autoComplete="new-password" minLength={8} value={f.password} onChange={maj('password')} required />
              </Field>
            </div>

            {role === 'student' && (
              <div className="card">
                <div className="grid2">
                  <Field label="Classe">
                    <input className="input" placeholder="ex. 3e A" value={f.classe} onChange={maj('classe')} required />
                  </Field>
                  <Field label="Date de naissance">
                    <input className="input" type="date" value={f.dateNaissance} onChange={maj('dateNaissance')} />
                  </Field>
                </div>
              </div>
            )}

            {role === 'teacher' && (
              <>
                <h2 className="section-title">Ce que vous enseignez</h2>
                {!structure && <p className="muted">Chargement…</p>}
                {structure && (
                  <div className="card">
                    <span className="field-label">Matière(s)</span>
                    <div className="chips">
                      {structure.matieres.map((m) => (
                        <button key={m.id} type="button" className="chip" aria-pressed={matiereIds.includes(m.id)} onClick={() => basculer(setMatiereIds)(m.id)}>
                          {m.name}
                        </button>
                      ))}
                    </div>
                    <span className="field-label">Vos classes</span>
                    {structure.classes.length === 0 ? (
                      <p className="muted" style={{ fontSize: 14 }}>
                        L’établissement n’a pas encore créé ses classes : vous pourrez les choisir plus tard.
                      </p>
                    ) : (
                      <div className="chips">
                        {structure.classes.map((c) => (
                          <button key={c.id} type="button" className="chip" aria-pressed={classeIds.includes(c.id)} onClick={() => basculer(setClasseIds)(c.id)}>
                            {c.name}
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="muted" style={{ fontSize: 13 }}>
                      {matiereIds.length} matière(s) · {classeIds.length} classe(s) choisie(s)
                    </p>
                  </div>
                )}
              </>
            )}

            {role === 'parent' && (
              <>
                <h2 className="section-title">Le ou les enfants que vous suivez</h2>
                {enfants.map((en, i) => (
                  <div className="card" key={i}>
                    <div className="grid2">
                      <Field label="Prénom de l’enfant">
                        <input className="input" value={en.prenom} onChange={majEnfant(i, 'prenom')} required={i === 0} />
                      </Field>
                      <Field label="Nom de l’enfant">
                        <input className="input" value={en.nom} onChange={majEnfant(i, 'nom')} required={i === 0} />
                      </Field>
                      <Field label="Classe">
                        <input className="input" placeholder="ex. CM2" value={en.classe} onChange={majEnfant(i, 'classe')} />
                      </Field>
                      <Field label="Date de naissance">
                        <input className="input" type="date" value={en.dateNaissance} onChange={majEnfant(i, 'dateNaissance')} />
                      </Field>
                    </div>
                    <Field label="Vous êtes son ou sa">
                      <select className="input" value={en.lien} onChange={majEnfant(i, 'lien')}>
                        {LIENS.map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                ))}
                <div className="actions" style={{ marginBottom: 12 }}>
                  <button type="button" className="btn btn-quiet" onClick={() => setEnfants((l) => [...l, { ...enfantVide }])}>
                    + Ajouter un enfant
                  </button>
                </div>
              </>
            )}

            <Note>{error}</Note>
            <button className="btn btn-block" type="submit" disabled={busy} style={{ marginTop: 8 }}>
              {busy ? 'Création du compte…' : 'Créer mon compte'}
            </button>
          </form>
        )}
      </main>
    </div>
  )
}
