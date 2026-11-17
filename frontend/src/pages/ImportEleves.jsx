import { useRef, useState } from 'react'
import { api } from '../api.js'
import { Field, Note } from '../ui.jsx'
import { useDepotPage } from '../depot.jsx'
import CompteurIA from '../CompteurIA.jsx'
import { lireListeEleves, lirePhotos } from '../lecture-fichier.js'
import { IcImport } from '../icones.jsx'

// Import des eleves depuis une liste (Excel, CSV, PDF, Word ou photo), avec verification avant l'envoi
export default function ImportEleves() {
  const champ = useRef(null)
  const [eleves, setEleves] = useState(null)
  const [fichier, setFichier] = useState('')
  const [classeDefaut, setClasseDefaut] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resultat, setResultat] = useState(null)
  const [progres, setProgres] = useState(null) // { fait, total }

  async function choisir(e) {
    const fichiers = [...(e.target.files || [])]
    const f = fichiers[0]
    if (!f) return
    setError('')
    setResultat(null)
    setBusy(true)
    try {
      // Plusieurs photos (pages d'une meme liste) : lues ensemble
      const photo = (x) => x.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(x.name)
      let liste = []
      if (fichiers.every(photo)) liste = await lirePhotos(fichiers)
      else for (const x of fichiers) liste = liste.concat(photo(x) ? await lirePhotos([x]) : await lireListeEleves(x))
      if (!liste.length) throw new Error('Aucun élève trouvé dans ce fichier. Vérifiez qu’il contient une colonne « Nom » ou « Noms et prénoms ».')
      setEleves(liste.map((x) => ({ ...x, garder: true })))
      setFichier(fichiers.length > 1 ? `${fichiers.length} fichiers` : f.name)
    } catch (err) {
      setError(err.message)
      setEleves(null)
    }
    setBusy(false)
    e.target.value = ''
  }
  const zoneDepot = useDepotPage(choisir, { texte: 'Déposez la liste d’élèves', detail: 'Excel, PDF, Word ou photo' })


  const maj = (i, k) => (e) =>
    setEleves((l) => l && l.map((x, j) => (j === i ? { ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value } : x)))

  // Import par paquets de 80 eleves : plus rapide a l'ecran (progression) et
  // sans risque de depasser le temps de reponse du serveur
  async function importer() {
    setError('')
    setBusy(true)
    const liste = eleves.filter((x) => x.garder)
    const total = { crees: 0, existants: 0, places: 0, erreurs: [] }
    setProgres({ fait: 0, total: liste.length })
    try {
      for (let i = 0; i < liste.length; i += 80) {
        const r = await api.post('/api/etablissement/import-eleves', {
          eleves: liste.slice(i, i + 80),
          classeParDefaut: classeDefaut,
        })
        total.crees += r.data.crees
        total.existants += r.data.existants
        total.places += r.data.places
        total.erreurs.push(...(r.data.erreurs || []))
        setProgres({ fait: Math.min(i + 80, liste.length), total: liste.length })
      }
      setResultat(total)
      setEleves(null)
      window.scrollTo(0, 0)
    } catch (err) {
      setError(`${err.message} — ${total.crees + total.existants} élève(s) déjà importé(s) : relancez l’import pour terminer (pas de doublons).`)
    }
    setProgres(null)
    setBusy(false)
  }

  const retenus = (eleves || []).filter((x) => x.garder).length
  const sansClasse = (eleves || []).filter((x) => x.garder && !x.classe).length

  return (
    <>
      {zoneDepot}
      <a className="back" href="#/eleves">
        ← Élèves
      </a>
      <h1 className="page-title">Importer une liste</h1>
      <CompteurIA discret />
      <button type="button" className="import-zone" disabled={busy} onClick={() => champ.current?.click()}>
        <IcImport size={22} />
        <b>{busy && !eleves ? 'Lecture en cours…' : 'Choisir un fichier ou une photo'}</b>
        <small>{busy && !eleves ? 'Jusqu’à une minute pour une liste manuscrite' : 'Excel, PDF, Word ou photo'}</small>
      </button>
      <input ref={champ} type="file" hidden multiple accept=".xlsx,.xls,.csv,.ods,.pdf,.docx,.doc,image/*" onChange={choisir} />
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
          <div className="barre-import">
            <div style={{ minWidth: 0 }}>
              <b style={{ display: 'block' }}>{retenus} élève(s) à importer</b>
              <small className="muted" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {progres ? `Import en cours : ${progres.fait} / ${progres.total}` : fichier}
              </small>
              {progres && (
                <div className="progres">
                  <span style={{ width: `${Math.round((progres.fait / progres.total) * 100)}%` }} />
                </div>
              )}
            </div>
            <button type="button" className="btn" disabled={busy || !retenus} onClick={importer} style={{ flex: 'none', padding: '12px 16px' }}>
              {busy ? '…' : 'Importer'}
            </button>
          </div>
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
        </>
      )}

    </>
  )
}
