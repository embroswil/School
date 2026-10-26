import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'

// Une classe : ses eleves et ses enseignants par matiere
export default function ClassDetail({ id }) {
  const d = useApi(`/api/etablissement/classes/${id}`)
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
          📝 Notes
        </a>
        <a className="btn btn-quiet" href={`#/classes/${classe.id}/appel`}>
          🙋 Faire l’appel
        </a>
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
