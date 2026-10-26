import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'

// Une classe : ses eleves et ses enseignants par matiere
export default function ClassDetail({ id }) {
  const d = useApi(`/api/etablissement/classes/${id}`)
  const profs = useApi('/api/etablissement/enseignants')
  const [choixPP, setChoixPP] = useState(false)
  async function definirPP(teacherId) {
    await api.put(`/api/etablissement/classes/${id}/professeur-principal`, { teacherId: teacherId || null })
    setChoixPP(false)
    d.reload()
  }
  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Chargement…</p>
  const { classe, eleves, enseignants } = d.data
  const filles = eleves.filter((e) => e.gender === 'female').length
  const garcons = eleves.filter((e) => e.gender === 'male').length

  return (
    <>
      <section className="hero-card" style={{ marginTop: 4 }}>
        <span className="badge">Année {classe.annee}</span>
        <h2 style={{ marginTop: 8 }}>{classe.name}</h2>
        <p>
          {eleves.length} élève(s){filles || garcons ? ` · ${garcons} garçon(s), ${filles} fille(s)` : ''}
        </p>
      </section>

      <div className="grid2" style={{ marginTop: 14 }}>
        <a className="btn" href={`#/classes/${classe.id}/notes`}>
          📊 Notes et résultats
        </a>
        <a className="btn btn-quiet" href={`#/classes/${classe.id}/appel`}>
          🗓️ Présences
        </a>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
        Les enseignants font l’appel et publient les notes depuis leur espace ; le professeur principal gère les coefficients et les bulletins.
      </p>

      <p className="groupe-titre">Professeur principal</p>
      <div className="card">
        {classe.class_teacher_id ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>⭐</span>
            <div className="row-main">
              <div className="row-title">
                {classe.pp_prenom} {classe.pp_nom}
              </div>
              <div className="row-sub">Coefficients, résultats et bulletins de la classe</div>
            </div>
            {classe.pp_tel && <a href={`tel:${classe.pp_tel}`}>📞</a>}
          </div>
        ) : (
          <p className="muted">Aucun professeur principal désigné.</p>
        )}
        {!choixPP ? (
          <button type="button" className="btn btn-quiet" style={{ marginTop: 10, padding: '9px 14px', fontSize: 14 }} onClick={() => setChoixPP(true)}>
            {classe.class_teacher_id ? 'Changer' : 'Désigner le professeur principal'}
          </button>
        ) : (
          <select className="input" style={{ marginTop: 10 }} defaultValue="" onChange={(e) => definirPP(e.target.value)}>
            <option value="" disabled>
              Choisir un enseignant
            </option>
            {(profs.data || []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.last_name} {t.first_name}
                {t.matieres ? ` (${t.matieres})` : ''}
              </option>
            ))}
            {classe.class_teacher_id && <option value="0">— Aucun —</option>}
          </select>
        )}
        {choixPP && (profs.data || []).length === 0 && (
          <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            Aucun enseignant validé pour le moment.
          </p>
        )}
      </div>

      <p className="groupe-titre">Enseignants</p>
      {enseignants.length === 0 ? (
        <p className="muted">
          Aucun enseignant affecté. <a href="#/enseignants">Affecter des enseignants</a>
        </p>
      ) : (
        <ul className="rows">
          {enseignants.map((t) => (
            <li className="row" key={t.id}>
              <div className="row-main">
                <div className="row-title">{t.matiere}</div>
                <div className="row-sub">
                  {t.first_name} {t.last_name}
                </div>
              </div>
              {t.phone && <a href={`tel:${t.phone}`}>📞</a>}
            </li>
          ))}
        </ul>
      )}

      <p className="groupe-titre">Élèves</p>
      {eleves.length === 0 ? (
        <p className="muted">
          Aucun élève dans cette classe. <a href="#/import-eleves">Importer une liste</a>
        </p>
      ) : (
        <ul className="rows">
          {eleves.map((e, i) => (
            <a className="row" key={e.id} href={`#/eleves/${e.id}`}>
              <span className="muted" style={{ width: 26, fontSize: 13 }}>
                {i + 1}
              </span>
              <div className="row-main">
                <div className="row-title">
                  {e.last_name} {e.first_name}
                </div>
                <div className="row-sub">
                  {e.gender === 'female' ? 'F' : e.gender === 'male' ? 'M' : ''}
                  {e.parents > 0 ? ` · ${e.parents} parent(s)` : ''}
                  {e.a_un_compte ? ' · compte créé' : ''}
                </div>
              </div>
              <span className="row-end">›</span>
            </a>
          ))}
        </ul>
      )}
    </>
  )
}
