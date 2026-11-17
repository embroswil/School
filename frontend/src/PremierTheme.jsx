import { useState } from 'react'
import { changerTheme, themeAChoisir } from './theme.js'

// Premiere ouverture de Sùkûl : on propose de choisir entre le theme clair et le theme sombre.
// Le choix se change ensuite a tout moment dans Profil › Affichage.
function Apercu({ sombre }) {
  return (
    <span className={`apercu-theme ${sombre ? 'sombre' : 'clair'}`} aria-hidden="true">
      <i className="at-barre" />
      <i className="at-vedette" />
      <span className="at-ligne">
        <i />
        <i />
        <i />
      </span>
      <i className="at-carte" />
      <i className="at-carte court" />
    </span>
  )
}

export default function PremierTheme() {
  const [ouvert, setOuvert] = useState(themeAChoisir)
  const [choix, setChoix] = useState('clair')
  if (!ouvert) return null
  const essayer = (t) => {
    setChoix(t)
    changerTheme(t)
  }
  return (
    <div className="premier-theme" role="dialog" aria-modal="true" aria-labelledby="premier-theme-titre">
      <div className="pt-boite">
        <p className="brand">
          Sùkûl<span>.</span>
        </p>
        <h1 id="premier-theme-titre">Choisissez votre affichage</h1>
        <p className="muted">Vous pourrez le changer à tout moment dans votre profil.</p>
        <div className="pt-choix">
          {[
            ['clair', 'Clair'],
            ['sombre', 'Sombre'],
          ].map(([t, l]) => (
            <button key={t} type="button" aria-pressed={choix === t} onClick={() => essayer(t)}>
              <Apercu sombre={t === 'sombre'} />
              <b>{l}</b>
              <span className="pt-rond" aria-hidden="true" />
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-block"
          onClick={() => {
            changerTheme(choix)
            setOuvert(false)
          }}
        >
          Continuer
        </button>
      </div>
    </div>
  )
}
