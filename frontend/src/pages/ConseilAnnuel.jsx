import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'
import { BoutonExcel, exporterExcel } from '../export.jsx'
import Classeur from '../Classeur.jsx'
import { niveauClasse, trierClasses } from '../classes.js'

const n2 = (n) => (n === null || n === undefined ? '—' : Number(n).toFixed(2).replace('.', ','))

// Conseil de classe de fin d'annee : moyenne annuelle, rang, decisions
export default function ConseilAnnuel({ id }) {
  const d = useApi(`/api/notes/classes/${id}/annuel`)
  const [ok, setOk] = useState('')

  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Calcul…</p>
  const { eleves, stats, decisions, modifiable } = d.data

  // Resultats de fin d'annee en Excel, pour les reporter sur cartescolaire.cm (Minesec) sans ressaisie
  function exporter() {
    exporterExcel(`Conseil-${d.data.classe}`, [
      {
        nom: d.data.classe,
        lignes: eleves.map((e, i) => ({
          'N°': i + 1,
          Matricule: e.matricule,
          Nom: e.nom,
          Prénom: e.prenom,
          Sexe: { male: 'M', female: 'F' }[e.sexe] || e.sexe,
          'Date de naissance': e.naissance ? new Date(e.naissance).toLocaleDateString('fr-FR') : '',
          'Moyenne T1': e.trimestres[0],
          'Moyenne T2': e.trimestres[1],
          'Moyenne T3': e.trimestres[2],
          'Moyenne annuelle': e.annuelle,
          Rang: e.rang,
          Décision: decisions[e.decision || e.proposition] || '',
          Observation: e.observation,
        })),
      },
    ])
  }

  const colonnes = [
    { id: 'nom', titre: 'Nom et prénom', nom: true },
    { id: 'rang', titre: 'Rang', num: true },
    { id: 'matricule', titre: 'Matricule' },
    { id: 't1', titre: 'T1', num: true },
    { id: 't2', titre: 'T2', num: true },
    { id: 't3', titre: 'T3', num: true },
    { id: 'annuelle', titre: 'Moy. annuelle', num: true },
    { id: 'decision', titre: 'Décision', type: 'choix', options: Object.entries(decisions) },
    { id: 'observation', titre: 'Observation' },
  ]
  const lignes = eleves.map((e) => ({
    id: `e${e.id}`,
    cells: {
      rang: e.rang ?? '',
      nom: `${e.nom} ${e.prenom}`,
      matricule: e.matricule || '',
      t1: n2(e.trimestres[0]),
      t2: n2(e.trimestres[1]),
      t3: n2(e.trimestres[2]),
      annuelle: n2(e.annuelle),
      decision: e.decision || e.proposition || '',
      observation: e.observation || '',
    },
  }))
  // les decisions et observations des eleves partent aussi dans leur dossier (visibles chez les parents)
  async function enregistrerDecisions({ rows }) {
    if (!modifiable) return
    const r = await api.put(`/api/notes/classes/${id}/decisions`, {
      decisions: rows.filter((l) => /^e\d+$/.test(l.id)).map((l) => ({ studentId: Number(l.id.slice(1)), decision: l.cells.decision || '', observation: l.cells.observation || '' })),
    })
    setOk(`${r.data.enregistrees} décision(s) transmise(s) aux parents.`)
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <h1 className="page-title">Conseil de fin d’année · {d.data.classe}</h1>
        <BoutonExcel onClick={exporter} texte="Excel pour cartescolaire.cm" />
      </div>
      <p className="muted" style={{ margin: '2px 0 10px' }}>
        {`Moyenne de la classe ${n2(stats.moyenneClasse)} · `}
        <b style={{ color: 'var(--ok)' }}>{`${stats.admis} admis`}</b>
        {' · '}
        <b style={{ color: 'var(--danger)' }}>{`${stats.redoublants} redoublent`}</b>
      </p>
      <Classeur key={id} cle={`conseil-annuel:${id}`} nom={`Conseil ${d.data.classe}`} colonnes={colonnes} lignes={lignes} lectureSeule={!modifiable} onEnregistre={enregistrerDecisions} />
      <Note kind="ok">{ok}</Note>
    </>
  )
}

// Depuis l'accueil : choisir la classe dont on tient le conseil de fin d'annee (niveau, puis classe)
export function ChoixClasseConseil() {
  const c = useApi('/api/etablissement/classes')
  const classes = trierClasses(c.data)
  const niveaux = [...new Set(classes.map((k) => niveauClasse(k.name)))]
  const [choix, setChoix] = useState(null)
  const niveau = choix || niveaux[0]
  return (
    <>
      <h1 className="page-title">Conseil de classe</h1>
      <p className="muted" style={{ marginBottom: 12 }}>Choisissez le niveau puis la classe.</p>
      <Note>{c.error}</Note>
      {!c.data && !c.error && <p className="muted">Chargement…</p>}
      <div className="niveaux-barre" role="tablist" aria-label="Niveau">
        {niveaux.map((n) => (
          <button key={n} type="button" role="tab" aria-selected={n === niveau} onClick={() => setChoix(n)} data-brut>
            {n}
          </button>
        ))}
      </div>
      <div className="choix-classes">
        {classes
          .filter((k) => niveauClasse(k.name) === niveau)
          .map((k) => (
            <a key={k.id} href={`#/classes/${k.id}/annuel`}>
              <b data-brut>{k.name}</b>
              <small>{`${k.eleves} élèves`}</small>
            </a>
          ))}
      </div>
    </>
  )
}
