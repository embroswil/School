import { useState } from 'react'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'

const n2 = (n) => (n === null || n === undefined ? '' : Number(n).toFixed(2).replace('.', ','))
const rangTxt = (r) => (r ? (r === 1 ? '1er' : `${r}e`) : '')
const naissance = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '')

function Bulletin({ d, b }) {
  return (
    <article className="bulletin">
      <header className="bulletin-tete">
        <div>
          <div className="bulletin-ecole">{d.ecole?.name}</div>
          <div className="bulletin-petit">
            {d.ecole?.city} · Année scolaire {d.annee}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="bulletin-titre">Bulletin de notes</div>
          <div className="bulletin-petit">
            {d.trimestre === 1 ? '1er' : `${d.trimestre}e`} trimestre · séquences {d.sequences.join(' et ')}
          </div>
        </div>
      </header>
      <div className="bulletin-identite">
        <span>
          <b>
            {b.last_name} {b.first_name}
          </b>
        </span>
        <span>Classe : {d.classe}</span>
        <span>Matricule : {b.admission_number || '—'}</span>
        <span>Né(e) le : {naissance(b.date_of_birth) || '—'}</span>
        <span>Effectif : {d.stats.effectif}</span>
      </div>
      <table className="bulletin-table">
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Matière</th>
            <th>Séq. {d.sequences[0]}</th>
            <th>Séq. {d.sequences[1]}</th>
            <th>Moy.</th>
            <th>Coef</th>
            <th>Total</th>
            <th>Rang</th>
            <th style={{ textAlign: 'left' }}>Appréciation</th>
          </tr>
        </thead>
        <tbody>
          {d.matieres.map((m) => {
            const l = b.lignes.find((x) => x.matiereId === m.id) || {}
            return (
              <tr key={m.id}>
                <td style={{ textAlign: 'left' }}>
                  <b>{m.nom}</b>
                  {m.enseignant && <div className="bulletin-petit">{m.enseignant}</div>}
                </td>
                <td>{n2(l.s1)}</td>
                <td>{n2(l.s2)}</td>
                <td>
                  <b>{n2(l.moyenne)}</b>
                </td>
                <td>{l.coef}</td>
                <td>{n2(l.total)}</td>
                <td>{rangTxt(l.rang)}</td>
                <td style={{ textAlign: 'left' }}>{l.appreciation}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} style={{ textAlign: 'left' }}>
              <b>Total</b>
            </td>
            <td>
              <b>{b.totalCoefs}</b>
            </td>
            <td>
              <b>{n2(b.totalPoints)}</b>
            </td>
            <td colSpan={2}></td>
          </tr>
        </tfoot>
      </table>
      <div className="bulletin-resume">
        <div>
          <span>Moyenne générale</span>
          <b>{n2(b.moyenne) || '—'} / 20</b>
        </div>
        <div>
          <span>Rang</span>
          <b>
            {rangTxt(b.rang) || '—'} sur {d.stats.classes}
          </b>
        </div>
        <div>
          <span>Moyenne de la classe</span>
          <b>{n2(d.stats.moyenneClasse)}</b>
        </div>
        <div>
          <span>Absences · retards</span>
          <b>
            {b.absences} · {b.retards}
          </b>
        </div>
      </div>
      <div className="bulletin-signatures">
        <div>
          <span>Appréciation du conseil de classe</span>
          <b>{b.appreciation || '—'}</b>
        </div>
        <div>
          <span>Le professeur principal</span>
          <b>{d.professeurPrincipal || ''}</b>
        </div>
        <div>
          <span>Le chef d’établissement</span>
          <b>&nbsp;</b>
        </div>
      </div>
      <div className="bulletin-petit" style={{ marginTop: 6 }}>
        Plus haute moyenne : {n2(d.stats.plusHaute)} · plus basse : {n2(d.stats.plusBasse)} · taux de réussite : {d.stats.reussite ?? '—'} %
      </div>
    </article>
  )
}

// Bulletins d'une classe pour un trimestre : apercu et impression (ou PDF)
export default function Bulletins({ id }) {
  const demande = Number(new URLSearchParams(window.location.hash.split('?')[1] || '').get('trimestre')) || 1
  const [tri, setTri] = useState(demande)
  const [seul, setSeul] = useState('')
  const d = useApi(`/api/notes/classes/${id}/bulletins?trimestre=${tri}`)
  if (d.error) return <Note>{d.error}</Note>
  const data = d.data
  const liste = data ? data.bulletins.filter((b) => !seul || String(b.id) === seul) : []
  return (
    <>
      <div className="sans-impression">
        <h1 className="page-title">Bulletins{data ? ` · ${data.classe}` : ''}</h1>
        <p className="lede">Calculés à partir de toutes les notes saisies des deux séquences du trimestre. Imprimez-les, ou enregistrez-les en PDF.</p>
        <div className="chips">
          {[1, 2, 3].map((t) => (
            <button key={t} type="button" className="chip" aria-pressed={tri === t} onClick={() => setTri(t)}>
              Trimestre {t}
            </button>
          ))}
        </div>
        {data && (
          <>
            <select className="input" value={seul} onChange={(e) => setSeul(e.target.value)} style={{ marginBottom: 12 }}>
              <option value="">Tous les élèves ({data.bulletins.length} bulletins)</option>
              {data.bulletins.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.last_name} {b.first_name}
                </option>
              ))}
            </select>
            {data.matieres.length === 0 ? (
              <Note kind="ok">Aucune note pour ce trimestre : les bulletins seront remplis au fur et à mesure des évaluations.</Note>
            ) : (
              <button type="button" className="btn btn-block" onClick={() => window.print()} style={{ marginBottom: 14 }}>
                🖨️ Imprimer ou enregistrer en PDF
              </button>
            )}
          </>
        )}
        {!data && <p className="muted">Calcul des bulletins…</p>}
      </div>
      {data && data.matieres.length > 0 && liste.map((b) => <Bulletin key={b.id} d={data} b={b} />)}
    </>
  )
}
