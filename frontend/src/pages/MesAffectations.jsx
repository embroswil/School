import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { NiveauRepliable, Note, useNiveauxOuverts } from '../ui.jsx'
import { niveauClasse, trierClasses } from '../classes.js'
import { IcAppelListe, IcCoche, IcDocument } from '../icones.jsx'

// Mes classes (enseignant) : chaque classe avec ses notes, ses devoirs et l'appel ;
// a la premiere connexion (aucune classe), l'enseignant choisit ses matieres et ses classes ; ensuite, c'est l'etablissement qui les gere.
export default function MesClasses() {
  const d = useApi('/api/notes/mes-classes')
  const [ouverts, basculer] = useNiveauxOuverts('mes-classes')
  const classes = trierClasses(d.data || [])
  const niveaux = []
  for (const c of classes) {
    const n = niveauClasse(c.name)
    const der = niveaux[niveaux.length - 1]
    if (der && der.nom === n) der.classes.push(c)
    else niveaux.push({ nom: n, classes: [c] })
  }
  const peu = classes.length <= 6 // peu de classes : tout est deplie
  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Chargement…</p>
  if (!classes.length) return <ChoixAffectations onFini={() => d.reload()} />
  const ligne = (c) => (
    <li key={c.id} className="mcl-classe">
      <div className="mcl-tete">
        <span className="mcl-nom">
          <b data-brut>{c.name}</b>
          <small>{c.matieres.join(', ') || '—'}</small>
        </span>
        <span className="mcl-meta">
          {c.prof_principal && <em>Prof. principal</em>}
          <small>{`${c.eleves} élèves`}</small>
        </span>
      </div>
      <nav className="mcl-actions" aria-label={`Classe ${c.name}`}>
        <a href={`#/classes/${c.id}/notes`}>
          <IcDocument size={16} />
          <span>Notes</span>
        </a>
        <a href={`#/classes/${c.id}/devoirs`}>
          <IcCoche size={16} />
          <span>Devoirs</span>
        </a>
        <a href={`#/classes/${c.id}/appel`}>
          <IcAppelListe size={16} />
          <span>Appel</span>
        </a>
      </nav>
    </li>
  )
  return (
    <>
      <div className="page-tete">
        <div>
          <h1 className="page-title">Mes classes</h1>
          <p className="muted">{`${classes.length} classe${classes.length > 1 ? 's' : ''} · ${classes.reduce((n, c) => n + Number(c.eleves || 0), 0)} élèves`}</p>
        </div>
        <a className="btn btn-quiet" href="#/conseil-enseignement">
          Conseil d’enseignement
        </a>
      </div>
      {peu ? (
        <ul className="mcl-liste">{classes.map(ligne)}</ul>
      ) : (
        niveaux.map((n) => (
          <NiveauRepliable key={n.nom} nom={n.nom} resume={`${n.classes.length} classe(s)`} ouvert={Boolean(ouverts[n.nom])} onBasculer={() => basculer(n.nom)}>
            <ul className="mcl-liste">{n.classes.map(ligne)}</ul>
          </NiveauRepliable>
        ))
      )}
    </>
  )
}

// L'enseignant choisit lui-meme ses matieres et ses classes
function ChoixAffectations({ onFini, onAnnuler }) {
  const d = useApi('/api/notes/mes-affectations')
  const [mat, setMat] = useState([])
  const [cls, setCls] = useState([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (d.data) {
      setMat(d.data.matiereIds)
      setCls(d.data.classeIds)
    }
  }, [d.data])
  const bascule = (set) => (id) => set((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))

  async function enregistrer() {
    setError('')
    setOk('')
    setBusy(true)
    try {
      const r = await api.put('/api/notes/mes-affectations', { matiereIds: mat, classeIds: cls })
      setOk(
        `Enregistré.${r.data.dejaPrises ? ` ${r.data.dejaPrises} combinaison(s) déjà assurée(s) par un collègue n’ont pas été modifiées.` : ''}`,
      )
      d.reload()
      onFini?.()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  if (!d.data) return <p className="muted">Chargement…</p>
  return (
    <>
      <h1 className="page-title">Mes matières et classes</h1>
      <p className="lede">Choisissez ce que vous enseignez cette année. Vous pourrez faire l’appel et publier les notes dans ces classes.</p>
      <div className="card">
        <span className="field-label">Matière(s)</span>
        <div className="chips">
          {d.data.matieres.map((m) => (
            <button key={m.id} type="button" className="chip" aria-pressed={mat.includes(m.id)} onClick={() => bascule(setMat)(m.id)}>
              {m.name}
            </button>
          ))}
        </div>
        <span className="field-label">Classes</span>
        <div className="chips">
          {d.data.classes.map((c) => (
            <button key={c.id} type="button" className="chip" aria-pressed={cls.includes(c.id)} onClick={() => bascule(setCls)(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      </div>
      <Note>{error}</Note>
      <Note kind="ok">{ok}</Note>
      <button type="button" className="btn btn-block" style={{ marginTop: 12 }} disabled={busy} onClick={enregistrer}>
        {busy ? 'Enregistrement…' : `Enregistrer (${mat.length} matière(s), ${cls.length} classe(s))`}
      </button>
      {onAnnuler && (
        <button type="button" className="btn btn-quiet btn-block" style={{ marginTop: 8 }} onClick={onAnnuler}>
          Annuler
        </button>
      )}
    </>
  )
}
