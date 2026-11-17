import { useState } from 'react'
import { nomEcole } from './i18n.jsx'
import { useAuth } from './auth.jsx'
import { IcEcole, IcProfil } from './icones.jsx'

// Administrateur d'etablissement aussi parent ou tuteur : un seul compte, deux espaces.
// Ce selecteur passe de l'espace de l'etablissement a l'espace parent, et inversement.
export function ChoixEspace() {
  const { user, changerEspace } = useAuth()
  const [busy, setBusy] = useState(false)
  if (!user?.peutChangerEspace) return null
  const parent = user.espace === 'parent'
  async function aller(cible) {
    if (busy || (cible === 'parent') === parent) return
    setBusy(true)
    try {
      await changerEspace(cible)
    } catch {
      // l'espace actuel reste affiche
    }
    setBusy(false)
  }
  return (
    <div className={`espaces ${busy ? 'occupe' : ''}`} role="tablist" aria-label="Changer d’espace">
      <button type="button" role="tab" aria-selected={!parent} onClick={() => aller('etablissement')}>
        <IcEcole size={18} />
        <span>
          <b>Établissement</b>
          <small data-brut>{nomEcole(user.etablissement) || '—'}</small>
        </span>
      </button>
      <button type="button" role="tab" aria-selected={parent} onClick={() => aller('parent')}>
        <IcProfil size={18} />
        <span>
          <b>Parent</b>
          <small>Mes enfants</small>
        </span>
      </button>
    </div>
  )
}
