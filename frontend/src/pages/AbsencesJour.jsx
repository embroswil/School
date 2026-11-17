import { useState } from 'react'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'
import { IcChevron, IcImport } from '../icones.jsx'
import { exporterExcel } from '../export.jsx'
import { comparerClasses, niveauClasse } from '../classes.js'

const enChaine = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const aujourdhui = () => enChaine(new Date())
const decaler = (jour, n) => {
  const d = new Date(`${jour}T12:00:00`)
  d.setDate(d.getDate() + n)
  return enChaine(d)
}
const jourLisible = (jour) => {
  if (jour === aujourdhui()) return 'Aujourd’hui'
  if (jour === decaler(aujourdhui(), -1)) return 'Hier'
  return new Date(`${jour}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

// Absences du jour dans tout l'etablissement (surveillant general, censeur).
// Un seul bouton « Importer » : le cahier d'appel met a jour les absences.
export default function AbsencesJour() {
  const [date, setDate] = useState(aujourdhui())
  const [filtre, setFiltre] = useState('')
  const [classe, setClasse] = useState('')
  const d = useApi(`/api/notes/absences?date=${date}`)

  const lignes = (d.data?.lignes || []).filter((l) => !filtre || `${l.last_name} ${l.first_name} ${l.classe}`.toLowerCase().includes(filtre.trim().toLowerCase()))
  const parClasse = {}
  for (const l of lignes) (parClasse[l.classe] ||= []).push(l)
  const niveaux = []
  for (const c of Object.keys(parClasse).sort(comparerClasses)) {
    const n = niveauClasse(c)
    const dernier = niveaux[niveaux.length - 1]
    if (dernier && dernier.nom === n) dernier.classes.push(c)
    else niveaux.push({ nom: n, classes: [c] })
  }

  return (
    <>
      <div className="page-tete">
        <div>
          <h1 className="page-title">Absences</h1>
        </div>
        <a className="btn bouton-icone" href="#/import-absences">
          <IcImport size={18} /> Importer
        </a>
      </div>

      <div className="jour-nav">
        <button type="button" aria-label="Jour précédent" onClick={() => { setClasse(''); setDate(decaler(date, -1)) }}>
          <IcChevron size={18} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <label>
          <span>{jourLisible(date)}</span>
          <input type="date" value={date} max={aujourdhui()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Choisir une date" />
        </label>
        <button type="button" aria-label="Jour suivant" disabled={date >= aujourdhui()} onClick={() => { setClasse(''); setDate(decaler(date, 1)) }}>
          <IcChevron size={18} />
        </button>
      </div>

      {d.data && (
        <div className="eleves-chiffres deux">
          <div>
            <b className={d.data.absents ? 'rouge' : ''}>{d.data.absents}</b>
            <span>Élève(s) absent(s)</span>
          </div>
          <div>
            <b>
              {d.data.classesAppel}/{d.data.classes}
            </b>
            <span>Classes appelées</span>
          </div>
        </div>
      )}
      <Note>{d.error}</Note>
      {!d.data && !d.error && <p className="muted">Chargement…</p>}

      {d.data?.lignes?.length > 0 && !classe && (
        <input className="input" type="search" placeholder="Rechercher un élève ou une classe" value={filtre} onChange={(e) => setFiltre(e.target.value)} style={{ marginBottom: 12 }} />
      )}
      {d.data && d.data.lignes.length === 0 && (
        <div className="vide">
          <b>Aucune absence ce jour</b>
          <small>Les absences sont saisies par les enseignants à l’appel, ou importées depuis le cahier d’appel.</small>
        </div>
      )}
      {d.data && d.data.lignes.length > 0 && lignes.length === 0 && <p className="muted">Aucun résultat.</p>}

      {/* classes par niveau, avec le nombre d'absents */}
      {!classe &&
        !filtre.trim() &&
        niveaux.map((n) => (
          <section className="eleves-niveau" key={n.nom}>
            <h2>{n.nom}</h2>
            <div className="eleves-classes">
              {n.classes.map((c) => (
                <button type="button" key={c} onClick={() => setClasse(c)}>
                  <b>{c}</b>
                  <small className="rouge">{`${parClasse[c].length} absent(s)`}</small>
                </button>
              ))}
            </div>
          </section>
        ))}

      {/* une classe, ou les resultats de la recherche */}
      {(classe || filtre.trim()) &&
        (classe ? [[classe, parClasse[classe] || []]] : Object.entries(parClasse).sort(([a], [b]) => comparerClasses(a, b))).map(([c, ls]) => (
          <section key={c}>
            {classe ? (
              <>
                <div className="eleves-barre">
                  <button type="button" className="back" onClick={() => setClasse('')}>
                    ← Toutes les classes
                  </button>
                </div>
                <h2 className="eleves-titre">
                  {c}
                  <small>{`${ls.length} absent(s)`}</small>
                </h2>
              </>
            ) : (
              <p className="niveau-titre">
                {c} · {ls.length}
              </p>
            )}
            <ul className="liste-simple">
              {ls.map((l, i) => (
                <li key={i}>
                  <span className="ls-texte">
                    <b data-brut>
                      {l.last_name} {l.first_name}
                    </b>
                    <small>
                      {l.heure}
                      {l.parents ? '' : ' · aucun parent relié'}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}

      {d.data?.lignes?.length > 0 && (
        <button
          type="button"
          className="lien-discret"
          onClick={() =>
            exporterExcel(`absences-${date}`, [
              {
                nom: `Absences ${date}`,
                lignes: d.data.lignes.map((l) => ({ Classe: l.classe, Nom: l.last_name, 'Prénom(s)': l.first_name, Heure: l.heure, 'Parent relié': l.parents ? 'Oui' : 'Non' })),
              },
            ])
          }
        >
          Exporter en Excel
        </button>
      )}
    </>
  )
}
