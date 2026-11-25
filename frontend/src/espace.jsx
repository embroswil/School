import { useState } from 'react'
import { useAuth } from './auth.jsx'
import { IcEcole, IcProfil } from './icones.jsx'

// Administrateur d'etablissement ou enseignant aussi parent ou tuteur : un seul compte, deux espaces.
// Ce bouton passe de l'espace professionnel a l'espace parent, et inversement.
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
  // dans la barre du haut de l'accueil, a cote de la langue : passe a l'autre espace
  return (
    <button type="button" className={`espace-bascule ${busy ? 'occupe' : ''}`} onClick={() => aller(parent ? 'etablissement' : 'parent')} aria-label={parent ? 'Passer à l’espace professionnel' : 'Passer à l’espace parent'}>
      {parent ? <IcEcole size={16} /> : <IcProfil size={16} />}
      <span>{parent ? (user.roleReel === 'teacher' ? 'Enseignant' : 'Établissement') : 'Parent'}</span>
    </button>
  )
}
