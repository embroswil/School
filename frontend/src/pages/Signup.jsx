import { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { ChampMotDePasse, Field, Note, PageAuth } from '../ui.jsx'
import { IcCasquette, IcChevron, IcEcole, IcFamille, IcProf } from '../icones.jsx'
import { VerificationEmail } from './CodeEmail.jsx'

const PROFILS = [
  { id: 'parent', Icone: IcFamille, titre: 'Parent', texte: 'Suivre la scolarité de mes enfants' },
  { id: 'student', Icone: IcCasquette, titre: 'Élève', texte: 'Mes notes et la vie de ma classe' },
  { id: 'teacher', Icone: IcProf, titre: 'Enseignant', texte: 'Mes cours, l’appel et les notes' },
]
const TYPES = { maternelle: 'Maternelle', primaire: 'École primaire', college: 'Collège', lycee: 'Lycée' }
export const LIENS = [['pere', 'Père'], ['mere', 'Mère'], ['tuteur', 'Tuteur / tutrice'], ['oncle_tante', 'Oncle / tante'], ['grand_parent', 'Grand-parent'], ['frere_soeur', 'Frère / sœur'], ['autre', 'Autre proche']]

// Creation d'un compte : 1) profil, 2) etablissement (eleve seulement), 3) informations, puis code recu par e-mail.
// Le parent retrouve ses enfants une fois connecte ; l'enseignant rejoint son ou ses etablissements une fois connecte.
export default function Signup() {
  const { login, signup } = useAuth()
  const [accepte, setAccepte] = useState(false)
  const [etape, setEtape] = useState('profil')
  const [role, setRole] = useState('')
  const [ecoles, setEcoles] = useState(null)
  const [recherche, setRecherche] = useState('')
  const [ecole, setEcole] = useState(null)
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', classe: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [aVerifier, setAVerifier] = useState(null) // compte cree, e-mail a confirmer

  useEffect(() => {
    if (role !== 'student' || ecoles) return
    api
      .get('/api/schools/public')
      .then((r) => setEcoles(r.data || []))
      .catch(() => setEcoles([]))
  }, [role, ecoles])

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return (ecoles || []).filter((e) => !q || `${e.name} ${e.city || ''}`.toLowerCase().includes(q))
  }, [ecoles, recherche])

  const maj = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const eleve = role === 'student'
  const parcours = eleve ? ['profil', 'ecole', 'infos'] : ['profil', 'infos']
  const precedente = () => {
    const i = parcours.indexOf(etape)
    if (i <= 0) window.history.length > 1 ? window.history.back() : (window.location.hash = '/')
    else setEtape(parcours[i - 1])
  }

  async function envoyer(e) {
    e.preventDefault()
    if (!accepte) {
      setError('Acceptez les conditions d’utilisation et la politique de confidentialité pour continuer.')
      return
    }
    setError('')
    setBusy(true)
    try {
      const res = await signup({ role, schoolId: eleve ? ecole.id : undefined, ...f })
      setAVerifier(res.data || {})
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  // Compte cree : confirmation obligatoire de l'adresse e-mail par le code recu
  if (aVerifier) {
    return (
      <PageAuth onRetour={() => setAVerifier(null)}>
        <div className="card">
          <VerificationEmail
            email={aVerifier.identifiant || f.email.trim().toLowerCase()}
            canal={aVerifier.canal}
            destination={aVerifier.destination}
            onConfirme={async () => {
              await login(aVerifier.identifiant || f.email.trim(), f.password)
              window.location.hash = '/'
            }}
          />
        </div>
      </PageAuth>
    )
  }

  const pied = (
    <>
      Déjà un compte ? <a href="#/connexion">Se connecter</a>
    </>
  )

  if (etape === 'profil') {
    return (
      <PageAuth titre="Créer un compte" sousTitre="Choisissez votre profil." etapes={parcours.length} etape={1} onRetour={precedente} pied={pied}>
        <div className="ea-choix">
          {PROFILS.map(({ id, Icone, titre, texte }) => (
            <button
              key={id}
              type="button"
              aria-pressed={role === id}
              onClick={() => {
                setRole(id)
                setEtape(id === 'student' ? 'ecole' : 'infos')
              }}
            >
              <span className="ea-choix-ico">
                <Icone size={20} />
              </span>
              <span className="ea-choix-texte">
                <b>{titre}</b>
                <small>{texte}</small>
              </span>
              <IcChevron size={16} className="ea-choix-fleche" />
            </button>
          ))}
        </div>
        <p className="ea-note">
          Vous dirigez un établissement ? <a href="#/inscrire-etablissement">Inscrivez-le</a>
        </p>
      </PageAuth>
    )
  }

  if (etape === 'ecole') {
    return (
      <PageAuth titre="Votre établissement" sousTitre="Où êtes-vous inscrit cette année ?" etapes={3} etape={2} onRetour={precedente} pied={pied}>
        <input className="input ea-recherche" placeholder="Rechercher par nom ou par ville" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        {ecoles === null && <p className="muted">Chargement…</p>}
        {ecoles && filtrees.length === 0 && <p className="muted">Aucun établissement trouvé.</p>}
        <div className="ea-choix">
          {filtrees.map((e) => (
            <button
              key={e.id}
              type="button"
              aria-pressed={ecole?.id === e.id}
              onClick={() => {
                setEcole(e)
                setEtape('infos')
              }}
            >
              <span className="ea-choix-ico" style={e.photo ? { backgroundImage: `url(${e.photo})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
                {!e.photo && <IcEcole size={20} />}
              </span>
              <span className="ea-choix-texte">
                <b data-brut>{e.name}</b>
                <small>{[TYPES[e.type], e.city].filter(Boolean).join(' · ')}</small>
              </span>
              <IcChevron size={16} className="ea-choix-fleche" />
            </button>
          ))}
        </div>
      </PageAuth>
    )
  }

  const profil = PROFILS.find((p) => p.id === role)
  return (
    <PageAuth
      titre="Vos informations"
      sousTitre={eleve && ecole ? `Élève · ${ecole.name}` : profil?.titre}
      etapes={parcours.length}
      etape={parcours.length}
      onRetour={precedente}
      pied={pied}
    >
      <form className="card" onSubmit={envoyer}>
        <div className="grid2">
          <Field label="Prénom">
            <input className="input" autoComplete="given-name" value={f.firstName} onChange={maj('firstName')} required />
          </Field>
          <Field label="Nom">
            <input className="input" autoComplete="family-name" value={f.lastName} onChange={maj('lastName')} required />
          </Field>
        </div>
        {eleve && (
          <Field label="Classe">
            <input className="input" placeholder="ex. 3e A" value={f.classe} onChange={maj('classe')} required />
          </Field>
        )}
        <Field label="Adresse e-mail">
          <input className="input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={f.email} onChange={maj('email')} required />
        </Field>
        <Field label="Téléphone">
          <input className="input" type="tel" autoComplete="tel" placeholder="6 XX XX XX XX" value={f.phone} onChange={maj('phone')} />
        </Field>
        <Field label="Mot de passe">
          <ChampMotDePasse autoComplete="new-password" minLength={8} placeholder="8 caractères minimum" value={f.password} onChange={maj('password')} />
        </Field>
        <label className="check ea-conditions">
          <input type="checkbox" checked={accepte} onChange={(e) => setAccepte(e.target.checked)} />
          <span>
            J’accepte les <a href="#/conditions" target="_blank">conditions d’utilisation</a> et la{' '}
            <a href="#/confidentialite" target="_blank">politique de confidentialité</a>.
          </span>
        </label>
        <Note>{error}</Note>
        <button className="btn btn-block" type="submit" disabled={busy}>
          {busy ? 'Création du compte…' : 'Créer mon compte'}
        </button>
      </form>
    </PageAuth>
  )
}
