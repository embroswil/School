import { useState } from 'react'
import { useAuth } from './auth.jsx'
import { IcEcole, IcProfil } from './icones.jsx'

// Administrateur d'etablissement ou enseignant aussi parent ou tuteur : un seul compte, deux espaces.
// Ce selecteur passe de l'espace professionnel a l'espace parent, et inversement.
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
  // bouton flottant en bas de l'ecran : passe a l'autre espace
  return (
    <button type="button" className={`espace-flottant ${busy ? 'occupe' : ''}`} onClick={() => aller(parent ? 'etablissement' : 'parent')}>
      {parent ? <IcEcole size={18} /> : <IcProfil size={18} />}
      <span>{parent ? (user.roleReel === 'teacher' ? 'Espace enseignant' : 'Espace établissement') : 'Espace parent'}</span>
    </button>
  )
}
