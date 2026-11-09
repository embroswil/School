import { useRef, useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'
import { useDepotPage } from '../depot.jsx'
import { BoutonExcel, exporterExcel } from '../export.jsx'

// Colonnes reconnues (sans accents, en minuscules)
const CHAMPS = {
  nom: ['nom', 'noms', 'nom de famille', 'surname', 'last name'],
  prenom: ['prenom', 'prenoms', 'prenom(s)', 'first name'],
  complet: ['noms et prenoms', 'nom et prenom', 'nom complet', 'enseignant', 'name'],
  matieres: ['matiere', 'matieres', 'matiere(s)', 'discipline', 'subject', 'subjects'],
  classes: ['classes', 'classe', 'classe(s)', 'classes enseignees', 'classes', 'class'],
  principalDe: ['professeur principal de', 'prof principal de', 'professeur principal', 'pp', 'titulaire de'],
  telephone: ['telephone', 'tel', 'phone', 'contact'],
  email: ['email', 'e-mail', 'mail', 'email (fictif)', 'courriel'],
}
const sans = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

async function lireTableur(fichier) {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await fichier.arrayBuffer(), { type: 'array' })
  const lignes = []
  for (const nom of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[nom], { header: 1, defval: '' })
    // ligne d'en-tete : la premiere qui contient une colonne « nom »
    const h = rows.findIndex((r) => r.some((c) => [...CHAMPS.nom, ...CHAMPS.complet].includes(sans(c))))
    if (h < 0) continue
    const cols = {}
    rows[h].forEach((c, i) => {
      const k = Object.keys(CHAMPS).find((champ) => CHAMPS[champ].includes(sans(c)))
      if (k && cols[k] === undefined) cols[k] = i
    })
    for (const r of rows.slice(h + 1)) {
      const v = (k) => (cols[k] === undefined ? '' : String(r[cols[k]] ?? '').trim())
      let nom = v('nom')
      let prenom = v('prenom')
      if (!nom && v('complet')) {
        const mots = v('complet').split(/\s+/)
        nom = mots[0]
        prenom = mots.slice(1).join(' ')
      }
      if (!nom) continue
      lignes.push({ nom, prenom, matieres: v('matieres'), classes: v('classes'), principalDe: v('principalDe'), telephone: v('telephone'), email: v('email') })
    }
  }
  return lignes
}

export default function ImportEnseignants() {
  const champ = useRef(null)
  const attendus = useApi('/api/etablissement/enseignants/attendus')
  const [lignes, setLignes] = useState(null)
  const [nom, setNom] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [bilan, setBilan] = useState(null)

  async function choisir(e) {
    const f = [...(e.target.files || [])][0]
    e.target.value = ''
    if (!f) return
    setError('')
    setBilan(null)
    try {
      if (!/\.(xlsx|xls|csv)$/i.test(f.name)) throw new Error('Choisissez un fichier Excel (.xlsx) ou CSV : le modèle est le fichier Enseignants.xlsx du kit.')
      const l = await lireTableur(f)
      if (!l.length) throw new Error('Aucun enseignant trouvé. Le fichier doit avoir une ligne d’en-tête avec au moins une colonne « Nom ».')
      setNom(f.name)
      setLignes(l)
    } catch (err) {
      setError(err.message)
    }
  }
  const zoneDepot = useDepotPage(choisir, { texte: 'Déposez la liste des enseignants', detail: 'Excel ou CSV' })

  async function importer() {
    setBusy(true)
    setError('')
    try {
      const r = (await api.post('/api/etablissement/enseignants/import', { enseignants: lignes })).data
      setBilan(r)
      setLignes(null)
      attendus.reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function retirer(id) {
    if (!window.confirm('Retirer cet enseignant de la liste ? Son compte, s’il existe, n’est pas supprimé.')) return
    await api.delete(`/api/etablissement/enseignants/attendus/${id}`)
    attendus.reload()
  }

  const liste = attendus.data || []
  return (
    <>
      {zoneDepot}
      <h1 className="page-title">Liste des enseignants</h1>
      <p className="lede">
        Importez la liste de vos enseignants avec leurs matières et leurs classes. Un enseignant de la liste n’attend plus votre validation à la création de son compte : ses classes sont déjà affectées. S’il a déjà un compte, il est mis à jour tout de suite.
      </p>
      <input ref={champ} type="file" hidden accept=".xlsx,.xls,.csv" onChange={choisir} />
      <button type="button" className="depot" onClick={() => champ.current?.click()}>
        <span style={{ fontSize: 34 }}>📋</span>
        <b>Choisir la liste (Excel ou CSV)</b>
        <small>Colonnes : Nom, Prénom, Matière, Classes, Professeur principal de, Téléphone, Email</small>
        <small className="astuce-depot">ou glissez-déposez le fichier n’importe où sur cette page</small>
      </button>
      <Note>{error}</Note>

      {bilan && (
        <div className="card" style={{ marginTop: 12 }}>
          <b>✓ Liste importée</b>
          <p style={{ margin: '8px 0 0' }}>
            {bilan.ajoutes} ajouté(s), {bilan.misAJour} mis à jour. {bilan.comptesAffectes} compte(s) déjà inscrits mis à jour
            {bilan.activés ? `, dont ${bilan.activés} validé(s) automatiquement` : ''}.
          </p>
          {bilan.classesInconnues?.length > 0 && (
            <Note>
              Ces classes n’existent pas encore dans votre établissement (importez d’abord vos élèves, ou créez-les) : {bilan.classesInconnues.join(', ')}
            </Note>
          )}
        </div>
      )}

      {lignes && (
        <>
          <h2 className="section-title">
            {lignes.length} enseignant(s) trouvé(s) · {nom}
          </h2>
          <div className="tableau-ordi-cadre" style={{ maxHeight: 340, overflow: 'auto' }}>
            <table className="tableau-ordi">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Prénom</th>
                  <th>Matière</th>
                  <th>Classes</th>
                </tr>
              </thead>
              <tbody>
                {lignes.slice(0, 200).map((l, i) => (
                  <tr key={i}>
                    <td>{l.nom}</td>
                    <td>{l.prenom}</td>
                    <td>{l.matieres}</td>
                    <td>{l.classes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={importer} disabled={busy}>
              {busy ? 'Import en cours…' : `Importer ${lignes.length} enseignant(s)`}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setLignes(null)}>
              Annuler
            </button>
          </div>
        </>
      )}

      <div className="barre-outils" style={{ marginTop: 20 }}>
        <h2 className="section-title" style={{ margin: 0 }}>
          Enseignants de la liste · {liste.length}
        </h2>
        <span className="espace" />
        {liste.length > 0 && (
          <BoutonExcel
            onClick={() =>
              exporterExcel('enseignants', [
                { nom: 'Enseignants', lignes: liste.map((a) => ({ Nom: a.last_name, 'Prénom': a.first_name, 'Matière': a.matieres, Classes: a.classes, 'Professeur principal de': a.principal_de || '', 'Téléphone': a.phone || '', Email: a.email || '', 'Compte créé': a.a_un_compte ? 'Oui' : 'Non' })) },
              ])
            }
          />
        )}
      </div>
      {liste.length === 0 && !attendus.loading && <p className="muted">Aucun enseignant dans la liste pour le moment.</p>}
      {liste.length > 0 && (
        <div className="tableau-ordi-cadre">
          <table className="tableau-ordi">
            <thead>
              <tr>
                <th>Enseignant</th>
                <th>Matière</th>
                <th>Classes</th>
                <th>Compte</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {liste.map((a) => (
                <tr key={a.id}>
                  <td>
                    <b>{a.last_name}</b> {a.first_name}
                  </td>
                  <td>{a.matieres}</td>
                  <td style={{ maxWidth: 260 }}>{a.classes}</td>
                  <td>{a.a_un_compte ? (a.status === 'active' ? '✓ Actif' : 'En attente') : <span className="muted">Pas encore créé</span>}</td>
                  <td>
                    <button type="button" className="btn btn-quiet btn-danger" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => retirer(a.id)}>
                      Retirer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
