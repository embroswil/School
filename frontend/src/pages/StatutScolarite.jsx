// Statut de la scolarite d'un eleve (frais obligatoires), partout dans l'application
const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`
const STYLES = {
  regle: ['✓ Scolarité réglée', '#7aa5ff', 'rgba(47, 107, 255, 0.16)'],
  partiel: [null, '#ffb4b8', 'rgba(255, 77, 87, 0.14)'],
  non_paye: [null, '#ffb4b8', 'rgba(255, 77, 87, 0.14)'],
}

export default function StatutScolarite({ statut, reste, enRetard, grand = false }) {
  const s = STYLES[statut]
  if (!s) return null
  const texte = s[0] || `${enRetard ? 'En retard · ' : ''}reste ${fcfa(reste)}`
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: grand ? '8px 14px' : '3px 9px',
        borderRadius: 999,
        background: s[2],
        color: s[1],
        font: `700 ${grand ? 15 : 12}px/1.2 var(--font-body)`,
        whiteSpace: 'nowrap',
      }}
    >
      {texte}
    </span>
  )
}
