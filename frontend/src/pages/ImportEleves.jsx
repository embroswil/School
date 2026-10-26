import { useRef, useState } from 'react'
import { api } from '../api.js'
import { Field, Note } from '../ui.jsx'
import { lireListeEleves } from '../lecture-fichier.js'

// Import des eleves depuis une liste (PDF, Excel, CSV), avec verification avant l'envoi
export default function ImportEleves() {
  const champ = useRef(null)
  const [eleves, setEleves] = useState(null)
  const [fichier, setFichier] = useState('')
  const [classeDefaut, setClasseDefaut] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resultat, setResultat] = useState(null)

  async function choisir(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setError('')
    setResultat(null)
    setBusy(true)
    try {
      const liste = await lireListeEleves(f)
      if (!liste.length) throw new Error('Aucun élève trouvé dans ce fichier. Vérifiez qu’il contient une colonne « Nom » ou « Noms et prénoms ».')
      setEleves(liste.map((x) => ({ ...x, garder: true })))
      setFichier(f.name)
    } catch (err) {
      setError(err.message)
      setEleves(null)
    }
    setBusy(false)
    e.target.value = ''
  }

  const maj = (i, k) => (e) =>
    setEleves((l) => l.map((x, j) => (j === i ? { ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value } : x)))

  async function importer() {
    setError('')
    setBusy(true)
    try {
      const r = await api.post('/api/etablissement/import-eleves', {
        eleves: eleves.filter((x) => x.garder),
        classeParDefaut: classeDefaut,
      })
      setResultat(r.data)
      setEleves(null)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  const retenus = (eleves || []).filter((x) => x.garder).length
  const sansClasse = (eleves || []).filter((x) => x.garder && !x.classe).length

  return (
    <>
      <a className="back" href="#/eleves">
        ← Élèves
      </a>
      <h1 className="page-title">Importer une liste</h1>
      <p className="lede">
        Envoyez une liste de classe en <b>PDF</b> ou <b>Excel</b> : l’application lit les noms, prénoms, classes, dates de naissance et
        matricules, puis vous les vérifiez avant l’import.
      </p>

      <button type="button" className="btn btn-block" disabled={busy} onClick={() => champ.current?.click()}>
        📄 {busy && !eleves ? 'Lecture du fichier…' : 'Choisir un fichier'}
      </button>
      <input ref={champ} type="file" hidden accept=".pdf,.xlsx,.xls,.csv,.ods" onChange={choisir} />
      <Note>{error}</Note>

      {resultat && (
        <div className="note note-ok">
          ✓ {resultat.crees} élève(s) ajouté(s), {resultat.existants} déjà présent(s) mis à jour, {resultat.places} placé(s) dans leur
          classe.
          {resultat.erreurs?.length > 0 && (
            <ul style={{ marginTop: 6, fontWeight: 400 }}>
              {resultat.erreurs.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: 8 }}>
            <a href="#/eleves">Voir les élèves</a>
          </div>
        </div>
      )}

      {eleves && (
        <>
          <h2 className="section-title">
            {fichier} · {retenus} élève(s)
          </h2>
          {sansClasse > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <Field label={`Classe pour les ${sansClasse} élève(s) sans classe`}>
                <input className="input" placeholder="ex. 3e A" value={classeDefaut} onChange={(e) => setClasseDefaut(e.target.value)} />
              </Field>
              <p className="muted" style={{ fontSize: 13 }}>
                Les classes qui n’existent pas encore sont créées automatiquement.
              </p>
            </div>
          )}
          <ul className="rows">
            {eleves.map((x, i) => (
              <li className="row" key={i} style={{ flexWrap: 'wrap', opacity: x.garder ? 1 : 0.45 }}>
                <input type="checkbox" checked={x.garder} onChange={maj(i, 'garder')} style={{ width: 20, height: 20 }} />
                <div className="row-main" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 6 }}>
                  <input className="input" style={{ padding: '8px 10px' }} value={x.nom} onChange={maj(i, 'nom')} aria-label="Nom" />
                  <input className="input" style={{ padding: '8px 10px' }} value={x.prenom} onChange={maj(i, 'prenom')} aria-label="Prénom" />
                  <input className="input" style={{ padding: '8px 10px' }} value={x.classe} placeholder={classeDefaut || 'Classe'} onChange={maj(i, 'classe')} aria-label="Classe" />
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-block" disabled={busy || !retenus} onClick={importer} style={{ marginTop: 14 }}>
            {busy ? 'Import en cours…' : `Importer ${retenus} élève(s)`}
          </button>
        </>
      )}

      <div className="card" style={{ marginTop: 18 }}>
        <b>Conseils</b>
        <ul className="muted" style={{ marginTop: 6, fontSize: 14, display: 'grid', gap: 4 }}>
          <li>• Une colonne « Noms et prénoms » (ou « Nom » et « Prénom ») suffit.</li>
          <li>• Colonnes reconnues : Classe, Date de naissance, Sexe, Matricule.</li>
          <li>• Un fichier Excel avec une feuille par classe fonctionne aussi.</li>
          <li>• Les scans ou photos de listes papier ne sont pas encore lus : utilisez un PDF issu d’un tableur ou d’un logiciel.</li>
          <li>• Quand un élève importé crée son compte avec les mêmes prénom et nom, il retrouve automatiquement sa fiche.</li>
        </ul>
      </div>
    </>
  )
}
