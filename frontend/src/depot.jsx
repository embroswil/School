import { useEffect, useRef, useState } from 'react'

// Glisser-deposer des fichiers depuis l'ordinateur.
// - Sur une page d'envoi (liste d'eleves, document, discipline, photos) : on depose, la page traite.
// - Ailleurs (accueil…) : on depose, School demande quoi en faire, puis ouvre la bonne page.
let enAttente = null
let pagesActives = 0

/** Fichiers deposes ailleurs, a traiter par la page qui vient de s'ouvrir (une seule fois). */
export const prendreFichiersEnAttente = () => {
  const f = enAttente
  enAttente = null
  return f
}

const contientDesFichiers = (e) => [...(e.dataTransfer?.types || [])].includes('Files')

// Ecoute du glisser-deposer sur toute la fenetre ; renvoie l'etat « survol » et les fichiers deposes
function useGlisser(onDepot, actif = true) {
  const [survol, setSurvol] = useState(false)
  const compteur = useRef(0)
  const rappel = useRef(onDepot)
  rappel.current = onDepot
  useEffect(() => {
    if (!actif) return undefined
    const entre = (e) => {
      if (!contientDesFichiers(e)) return
      e.preventDefault()
      compteur.current += 1
      setSurvol(true)
    }
    const dessus = (e) => {
      if (!contientDesFichiers(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
    const sort = (e) => {
      if (!contientDesFichiers(e)) return
      compteur.current = Math.max(0, compteur.current - 1)
      if (!compteur.current) setSurvol(false)
    }
    const depose = (e) => {
      if (!contientDesFichiers(e)) return
      e.preventDefault()
      compteur.current = 0
      setSurvol(false)
      const fichiers = [...(e.dataTransfer.files || [])]
      if (fichiers.length) rappel.current(fichiers)
    }
    window.addEventListener('dragenter', entre)
    window.addEventListener('dragover', dessus)
    window.addEventListener('dragleave', sort)
    window.addEventListener('drop', depose)
    return () => {
      window.removeEventListener('dragenter', entre)
      window.removeEventListener('dragover', dessus)
      window.removeEventListener('dragleave', sort)
      window.removeEventListener('drop', depose)
    }
  }, [actif])
  return survol
}

function Voile({ texte, detail }) {
  return (
    <div className="depot-voile" aria-hidden="true">
      <div className="depot-cadre">
        <span className="depot-icone">⤓</span>
        <b>{texte}</b>
        {detail && <span>{detail}</span>}
      </div>
    </div>
  )
}

/**
 * Page d'envoi : `traiter` recoit un faux evenement { target: { files } } comme un champ fichier.
 * Traite aussi les fichiers deposes depuis une autre page (voir DepotGlobal).
 */
export function useDepotPage(traiter, { texte = 'Déposez vos fichiers ici', detail } = {}) {
  const evenement = (files) => ({ target: { files, value: '' } })
  useEffect(() => {
    pagesActives += 1
    const f = prendreFichiersEnAttente()
    if (f) traiter(evenement(f))
    return () => {
      pagesActives -= 1
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const survol = useGlisser((files) => traiter(evenement(files)))
  return survol ? <Voile texte={texte} detail={detail} /> : null
}

const CHOIX = {
  principal: [
    ['/import-eleves', '📋', 'Liste d’élèves', 'Excel, PDF ou photo : importer les élèves'],
    ['/document', '📄', 'Document pour les familles', 'Communiqué, calendrier, récapitulatif…'],
    ['/discipline', '⚖️', 'Discipline', 'Procès-verbal, liste de sanctions'],
    ['/info', '🖼️', 'Photos pour une information', 'Images seulement'],
  ],
  teacher: [
    ['/document', '📄', 'Document pour les familles', 'Communiqué, devoir, fiche…'],
    ['/discipline', '⚖️', 'Discipline', 'Rapport, liste de sanctions'],
    ['/info', '🖼️', 'Photos pour une information', 'Images seulement'],
  ],
}

// Depot n'importe ou dans l'application (etablissement et enseignants) : on choisit quoi en faire
export function DepotGlobal({ role }) {
  const [fichiers, setFichiers] = useState(null)
  const choix = CHOIX[role]
  const survol = useGlisser((f) => {
    if (pagesActives > 0) return // la page ouverte s'en occupe
    setFichiers(f)
  }, Boolean(choix))
  if (!choix) return null
  const images = fichiers?.every((f) => f.type.startsWith('image/'))
  return (
    <>
      {survol && pagesActives === 0 && <Voile texte="Déposez vos fichiers" detail="School vous demandera quoi en faire" />}
      {fichiers && (
        <div className="voile" onClick={() => setFichiers(null)}>
          <div className="feuille" onClick={(e) => e.stopPropagation()}>
            <p className="feuille-titre">
              {fichiers.length} fichier(s) · que voulez-vous faire ?
            </p>
            <p className="muted" style={{ fontSize: 13, margin: '-4px 2px 12px' }}>
              {fichiers
                .slice(0, 3)
                .map((f) => f.name)
                .join(', ')}
              {fichiers.length > 3 ? '…' : ''}
            </p>
            <div className="depot-choix">
              {choix
                .filter(([to]) => to !== '/info' || images)
                .map(([to, ico, titre, texte]) => (
                  <button
                    key={to}
                    type="button"
                    onClick={() => {
                      enAttente = fichiers
                      setFichiers(null)
                      window.location.hash = to
                    }}
                  >
                    <span style={{ fontSize: 24 }}>{ico}</span>
                    <span>
                      <b>{titre}</b>
                      <small>{texte}</small>
                    </span>
                  </button>
                ))}
            </div>
            <button type="button" className="btn btn-quiet btn-block" style={{ marginTop: 12 }} onClick={() => setFichiers(null)}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </>
  )
}
