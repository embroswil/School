import { useEffect, useState } from 'react'
import { api } from './api.js'

// Pastille visible dans toute l'application tant qu'un travail tourne sur le serveur
// (ex. installation d'un dossier), puis tant que son resultat n'a pas ete consulte.
export default function TravauxEnCours({ path }) {
  const [liste, setListe] = useState([])
  useEffect(() => {
    let fini = false
    let minuteur = null
    const lire = async () => {
      try {
        const l = (await api.get('/api/travaux/actifs')).data || []
        if (fini) return
        setListe(l)
        if (l.some((t) => t.statut === 'en_cours')) minuteur = setTimeout(lire, 8000)
      } catch {
        /* sans importance : la pastille reste cachee */
      }
    }
    lire()
    return () => {
      fini = true
      clearTimeout(minuteur)
    }
  }, [path])
  const t = liste[0]
  if (!t || path.startsWith('/dossier')) return null
  const enCours = t.statut === 'en_cours'
  const pct = t.total ? Math.round((t.traites / t.total) * 100) : 0
  return (
    <a className={`travail-pastille ${enCours ? '' : 'fini'}`} href={`#/dossier?travail=${t.id}`}>
      {enCours ? <span className="dos-roue petite" aria-hidden="true" /> : <span className="travail-coche" aria-hidden="true">✓</span>}
      <span>
        <b>{t.titre}</b>
        <small>{enCours ? `${pct} % · continue même si l’application est fermée` : 'Terminé · voir le résultat'}</small>
      </span>
    </a>
  )
}
