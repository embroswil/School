// Rapport de conseil d'enseignement de fin de trimestre (modele Minesec) : le tableau par classe est calcule
// par Sùkûl (effectifs, assiduite, heures, taux de reussite) ; il ne reste que l'analyse a rediger.
import { useState } from 'react'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'
import { BoutonExcel, exporterExcel } from '../export.jsx'
import { esc, imprimer } from '../impression.js'

const v = (x, suffixe = '') => (x === null || x === undefined ? '—' : `${String(x).replace('.', ',')}${suffixe}`)
// colonnes du formulaire officiel : [titre, cle, suffixe]
const COLONNES = [
  ['G', 'g'],
  ['F', 'f'],
  ['Total (a)', 'total'],
  ['Heures/trim. (b)', 'heures'],
  ['(c) = a×b', 'heuresEleves'],
  ['Absences (d)', 'absences'],
  ['(e) = c−d', 'presences'],
  ['Assiduité', 'assiduite', ' %'],
  ['LP', 'lp'],
  ['LF', 'lf'],
  ['HD', 'hd'],
  ['HF', 'hf'],
  ['Taux heures', 'tauxHeures', ' %'],
  ['TG', 'tg', ' %'],
  ['TF', 'tf', ' %'],
  ['TR', 'tr', ' %'],
  ['MGC', 'mgc'],
]

function rapportHtml(d) {
  const tete = COLONNES.map(([t]) => `<th>${esc(t)}</th>`).join('')
  const corps = d.lignes.map((l) => `<tr><td>${esc(l.classe)}</td>${COLONNES.map(([, k, s]) => `<td>${esc(v(l[k], s))}</td>`).join('')}</tr>`).join('')
  const zone = (titre) => `<p class="rce-zone"><b>${esc(titre)}</b></p>`
  return `<article class="bc rce">
  <header class="bc-tete">
    <div><b>${esc(d.ecole?.name || '')}</b><small>${esc(d.ecole?.city || '')}</small></div>
    <div class="bc-titre"><b>RAPPORT DE CONSEIL D’ENSEIGNEMENT DE FIN DE TRIMESTRE</b><span>${esc(`${d.matiere} · Trimestre ${d.trimestre} · ${d.annee}`)}</span></div>
  </header>
  <table class="bc-table rce-table"><thead><tr><th>Classe</th>${tete}</tr></thead><tbody>${corps}</tbody></table>
  <p class="rce-legende">(b) nombre d’heures du trimestre ; (c) heures totales ; (d) heures d’absence ; LP / LF : leçons prévues / faites ; HD / HF : heures dues / faites ; TG / TF / TR : taux de réussite garçons / filles / général ; MGC : moyenne générale de la classe.</p>
  ${zone('Conditions de travail')}${zone('Analyse des résultats')}${zone('Difficultés rencontrées')}${zone('Suggestions')}
  <div class="bc-signatures"><span>L’animateur pédagogique</span><span>Le chef d’établissement</span></div>
</article>`
}

export default function RapportEnseignement() {
  const [matiere, setMatiere] = useState('')
  const [tri, setTri] = useState(1)
  const d = useApi(`/api/notes/rapport-enseignement?trimestre=${tri}${matiere ? `&matiere=${matiere}` : ''}`)
  const matieres = d.data?.matieres || []
  const r = d.data?.lignes ? d.data : null

  function excel() {
    exporterExcel(`Conseil-enseignement-${r.matiere}-T${r.trimestre}`, [
      { nom: r.matiere, lignes: r.lignes.map((l) => Object.fromEntries([['Classe', l.classe], ...COLONNES.map(([t, k]) => [t, l[k] ?? ''])])) },
    ])
  }

  return (
    <>
      <h1 className="page-title">Conseil d’enseignement</h1>
      <p className="lede">Le tableau du rapport de fin de trimestre, calculé à partir de l’appel, de la présence des enseignants et des notes. Les leçons prévues (LP) restent à compléter à la main.</p>
      <Note>{d.error}</Note>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="input" style={{ flex: '1 1 220px', maxWidth: 360 }} value={matiere} onChange={(e) => setMatiere(e.target.value)} aria-label="Matière">
          <option value="">Choisir la matière…</option>
          {matieres.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <div className="chips" role="group" aria-label="Trimestre">
          {[1, 2, 3].map((t) => (
            <button key={t} type="button" className="chip" aria-pressed={tri === t} onClick={() => setTri(t)}>
              {`Trimestre ${t}`}
            </button>
          ))}
        </div>
      </div>
      {matiere && !r && !d.error && <p className="muted">Calcul…</p>}
      {r && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0 8px' }}>
            <button type="button" className="btn" onClick={() => imprimer(rapportHtml(r), 'a4-paysage')}>
              Imprimer le rapport
            </button>
            <BoutonExcel onClick={excel} />
          </div>
          {r.lignes.length === 0 ? (
            <p className="muted">Aucune classe n’a cette matière cette année.</p>
          ) : (
            <div className="grille-cadre">
              <table className="grille">
                <thead>
                  <tr>
                    <th className="g-nom">Classe</th>
                    {COLONNES.map(([t]) => (
                      <th key={t}>{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.lignes.map((l) => (
                    <tr key={l.classe}>
                      <td className="g-nom" data-brut>{l.classe}</td>
                      {COLONNES.map(([t, k, s]) => (
                        <td key={t} className="g-num">{v(l[k], s)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  )
}
