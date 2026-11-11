import { useApi } from './hooks.js'

// Lectures automatiques (IA) utilisees ce mois, par rapport au plafond de l'etablissement
export default function CompteurIA() {
  const q = useApi('/api/ia/quota')
  const d = q.data
  if (!d) return null
  if (d.limite === 0) {
    return (
      <div className="ia-compteur ia-rouge">
        <b>Lecture automatique non activée</b>
        <small>Utilisez l’import Excel ou CSV, ou contactez School.</small>
      </div>
    )
  }
  const pct = Math.min(100, Math.round((d.utilise / d.limite) * 100))
  const rouge = pct >= 90
  return (
    <div className={`ia-compteur ${rouge ? 'ia-rouge' : ''}`}>
      <b>{`Lectures automatiques ce mois : ${d.utilise} sur ${d.limite}`}</b>
      <span className="ia-barre">
        <i style={{ width: `${pct}%` }} />
      </span>
      {d.restant === 0 && <small>Plafond atteint : utilisez l’import Excel ou CSV, ou contactez School pour l’augmenter.</small>}
    </div>
  )
}
