import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'
import { Info } from './Fil.jsx'

// Une information du fil, en entier (resultats, listes d'eleves, longs textes)
export default function InfoDetail({ id }) {
  const d = useApi(`/api/actualites/${id}/detail`)
  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Chargement…</p>
  return <Info p={d.data} complet />
}
