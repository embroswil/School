// Export Excel (.xlsx) d'un tableau, dans le navigateur (aucun envoi au serveur).
// feuilles : [{ nom: 'Élèves', lignes: [{ Colonne: valeur, ... }, ...] }]
export async function exporterExcel(nomFichier, feuilles) {
  const XLSX = await import('xlsx')
  const classeur = XLSX.utils.book_new()
  for (const f of feuilles) {
    const ws = XLSX.utils.json_to_sheet(f.lignes.length ? f.lignes : [{ '': 'Aucune donnée' }])
    // largeur des colonnes d'apres le contenu
    const cles = Object.keys(f.lignes[0] || { '': '' })
    ws['!cols'] = cles.map((k) => ({ wch: Math.min(45, Math.max(k.length, ...f.lignes.map((l) => String(l[k] ?? '').length)) + 2) }))
    XLSX.utils.book_append_sheet(classeur, ws, String(f.nom).slice(0, 31).replace(/[\\/?*[\]:]/g, ' '))
  }
  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(classeur, `${nomFichier}-${date}.xlsx`)
}

// Bouton « Exporter en Excel »
export function BoutonExcel({ onClick, texte = 'Excel' }) {
  return (
    <button type="button" className="btn btn-quiet bouton-icone bouton-excel" onClick={onClick} title="Exporter en Excel">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v12M7 10l5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
      {texte}
    </button>
  )
}

// Tableau triable (version ordinateur) : colonnes [{ cle, titre, rendu?, tri? }]
import { useState } from 'react'
export function TableauTriable({ colonnes, lignes, onLigne, cleLigne = (l) => l.id }) {
  const [tri, setTri] = useState({ cle: null, sens: 1 })
  const valeur = (l, c) => (c.tri ? c.tri(l) : l[c.cle])
  const triees = tri.cle
    ? [...lignes].sort((a, b) => {
        const c = colonnes.find((x) => x.cle === tri.cle)
        const va = valeur(a, c)
        const vb = valeur(b, c)
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * tri.sens
        return String(va ?? '').localeCompare(String(vb ?? ''), 'fr', { numeric: true }) * tri.sens
      })
    : lignes
  return (
    <div className="tableau-ordi-cadre">
      <table className="tableau-ordi">
        <thead>
          <tr>
            {colonnes.map((c) => (
              <th key={c.cle} onClick={() => setTri((t) => ({ cle: c.cle, sens: t.cle === c.cle ? -t.sens : 1 }))} style={c.style}>
                {c.titre}
                <span className="tri">{tri.cle === c.cle ? (tri.sens === 1 ? ' ▲' : ' ▼') : ''}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {triees.map((l) => (
            <tr key={cleLigne(l)} onClick={onLigne ? () => onLigne(l) : undefined} className={onLigne ? 'cliquable' : ''}>
              {colonnes.map((c) => (
                <td key={c.cle} style={c.style}>
                  {c.rendu ? c.rendu(l) : l[c.cle]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Vrai si l'affichage ordinateur est actif
export const surOrdinateur = () => document.documentElement.classList.contains('ordi')
