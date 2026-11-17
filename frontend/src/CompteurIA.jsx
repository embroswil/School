import { useApi } from './hooks.js'

// Lectures automatiques (IA) utilisees ce mois, par rapport au plafond de l'etablissement
// discret : le compteur ne s'affiche que s'il y a quelque chose a signaler (plafond presque atteint, ou lecture non activee)
export default function CompteurIA({ discret = false }) {
  const q = useApi('/api/ia/quota')
  const d = q.data
  if (!d) return null
  if (discret && d.limite > 0 && d.utilise / d.limite < 0.8) return null
  if (d.limite === 0) {
    return (
      <div className="ia-compteur ia-rouge">
        <b>Lecture automatique non activée</b>
        <small>Utilisez l’import Excel ou CSV, ou contactez Sùkûl.</small>
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
      {d.restant === 0 && <small>Plafond atteint : utilisez l’import Excel ou CSV, ou contactez Sùkûl pour l’augmenter.</small>}
    </div>
  )
}
