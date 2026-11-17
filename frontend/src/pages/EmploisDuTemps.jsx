import { useApi } from '../hooks.js'
import { IcImport } from '../icones.jsx'
import { niveauClasse, trierClasses } from '../classes.js'

// Emplois du temps de l'etablissement : chaque classe, regroupee par niveau, avec son nombre de cours.
// Un seul bouton « Importer » (Excel, PDF, Word ou photo, une ou plusieurs classes).
export default function EmploisDuTemps() {
  const classes = useApi('/api/etablissement/classes')
  const liste = trierClasses(classes.data || [])
  const sans = liste.filter((c) => !c.cours).length
  const niveaux = []
  for (const c of liste) {
    const n = niveauClasse(c.name)
    const dernier = niveaux[niveaux.length - 1]
    if (dernier && dernier.nom === n) dernier.classes.push(c)
    else niveaux.push({ nom: n, classes: [c] })
  }
  return (
    <>
      <div className="page-tete">
        <div>
          <h1 className="page-title">Emplois du temps</h1>
          {classes.data && liste.length > 0 && <p className="muted">{sans ? `${sans} classe(s) sans emploi du temps` : 'Toutes les classes ont leur emploi du temps'}</p>}
        </div>
        <a className="btn bouton-icone" href="#/import-emplois">
          <IcImport size={18} /> Importer
        </a>
      </div>
      {!classes.data && !classes.error && <p className="muted">Chargement…</p>}
      {classes.data && liste.length === 0 && (
        <div className="vide">
          <b>Aucune classe pour l’instant</b>
          <small>Les classes sont créées en important les listes d’élèves.</small>
          <a href="#/import-eleves">Importer les élèves</a>
        </div>
      )}
      {niveaux.map((n) => (
        <section className="eleves-niveau" key={n.nom}>
          <h2>{n.nom}</h2>
          <div className="eleves-classes">
            {n.classes.map((c) => (
              <a key={c.id} href={`#/classes/${c.id}/emploi`} className={c.cours ? '' : 'sans-emploi'}>
                <b>{c.name}</b>
                <small>{c.cours ? `${c.cours} cours par semaine` : 'À ajouter'}</small>
              </a>
            ))}
          </div>
        </section>
      ))}
    </>
  )
}
