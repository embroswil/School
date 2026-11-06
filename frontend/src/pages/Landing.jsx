import { ChoixLangue } from '../i18n.jsx'

// Page d'accueil publique, sobre
const MOSAIQUE = [
  ['📚', '#fde7ef'],
  ['🎓', '#ede7fd'],
  ['📝', '#fff1dc'],
  ['🏫', '#e6f2fe'],
  ['⚽', '#e7f8ee'],
  ['🏆', '#fff6d6'],
]

export default function Landing() {
  return (
    <div className="vitrine">
      <ChoixLangue style={{ position: 'absolute', top: 'calc(16px + env(safe-area-inset-top))', right: 16 }} />
      <div className="vitrine-bloc">
        <div className="brand">
          School<span>.</span>
        </div>
        <p className="vitrine-texte">Les notes, les absences, les actualités et la scolarité de votre enfant, au même endroit.</p>
        <div className="vitrine-mosaique" aria-hidden="true">
          {MOSAIQUE.map(([e, c]) => (
            <span key={e} style={{ background: c }}>
              {e}
            </span>
          ))}
        </div>
        <a className="btn btn-block" href="#/connexion">
          Se connecter
        </a>
        <div className="vitrine-ou">OU</div>
        <a className="btn btn-quiet btn-block" href="#/inscription">
          Créer un compte
        </a>
        <a className="vitrine-lien" href="#/inscrire-etablissement">
          Vous dirigez un établissement ? Inscrivez-le
        </a>
        <p className="vitrine-pied">
          School by Embroswil · © {new Date().getFullYear()}
          <br />
          <a href="#/confidentialite">Confidentialité</a> · <a href="#/conditions">Conditions d’utilisation</a>
        </p>
      </div>
    </div>
  )
}
