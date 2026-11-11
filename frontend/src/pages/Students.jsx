import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'
import { IcClasses, IcImport } from '../icones.jsx'
import StatutScolarite from './StatutScolarite.jsx'
import { BoutonExcel, TableauTriable, exporterExcel, surOrdinateur } from '../export.jsx'

// Eleves de l'etablissement : recherche, filtre par classe, placement, fiche
export default function Students() {
  const [q, setQ] = useState('')
  const [recherche, setRecherche] = useState('')
  const [classe, setClasse] = useState('')
  const eleves = useApi(`/api/etablissement/eleves?q=${encodeURIComponent(recherche)}${classe ? `&classe=${classe}` : ''}`)
  const classes = useApi('/api/etablissement/classes')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)
  const [scol, setScol] = useState('') // '' | 'regle' | 'non'

  async function placer(eleveId, classId) {
    if (!classId) return
    setError('')
    setBusy(eleveId)
    try {
      await api.post(`/api/etablissement/eleves/${eleveId}/classe`, { classId: Number(classId) })
      eleves.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(null)
  }

  const statutDe = (e) => (!e.scol_du ? 'aucun' : e.scol_paye >= e.scol_du ? 'regle' : e.scol_paye > 0 ? 'partiel' : 'non_paye')
  const tous = eleves.data || []
  const liste = scol === 'regle' ? tous.filter((e) => statutDe(e) === 'regle') : scol === 'non' ? tous.filter((e) => ['partiel', 'non_paye'].includes(statutDe(e))) : tous
  const sansClasse = liste.filter((e) => !e.class_id).length
  const libelleStatut = { regle: 'Réglée', partiel: 'Partielle', non_paye: 'Non payée', aucun: '' }
  const exporter = () =>
    exporterExcel('eleves', [
      {
        nom: 'Élèves',
        lignes: liste.map((e) => ({
          Nom: e.last_name,
          'Prénom(s)': e.first_name,
          Classe: e.class_name || e.declared_class || '',
          Matricule: e.matricule || '',
          'Date de naissance': e.date_of_birth ? new Date(e.date_of_birth).toLocaleDateString('fr-FR') : '',
          'Parents reliés': e.parents || 0,
          'Compte créé': e.a_un_compte ? 'Oui' : 'Non',
          'Frais obligatoires (FCFA)': e.scol_du || 0,
          'Payé (FCFA)': e.scol_paye || 0,
          'Reste (FCFA)': Math.max(0, (e.scol_du || 0) - (e.scol_paye || 0)),
          Scolarité: libelleStatut[statutDe(e)],
        })),
      },
    ])

  return (
    <>
      <div className="eleves-tete">
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Élèves</h1>
          <p className="muted" style={{ fontSize: 14 }}>
            {eleves.loading ? 'Chargement…' : `${liste.length.toLocaleString('fr-FR')} élève(s)`}
            {sansClasse > 0 && !classe ? ` · ${sansClasse} sans classe` : ''}
          </p>
        </div>
        <a className="btn btn-quiet bouton-icone" href="#/classes" aria-label="Classes">
          <IcClasses size={18} /> Classes
        </a>
        {liste.length > 0 && <BoutonExcel onClick={exporter} />}
        <a className="btn bouton-icone" href="#/import-eleves" aria-label="Importer une liste">
          <IcImport size={18} /> Importer
        </a>
      </div>
      <form
        className="filtres-eleves"
        onSubmit={(e) => {
          e.preventDefault()
          setRecherche(q)
        }}
      >
        <input className="input" type="search" placeholder="Rechercher un nom…" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setRecherche(q)} />
        <select className="input" value={classe} onChange={(e) => setClasse(e.target.value)}>
          <option value="">Toutes les classes</option>
          {(classes.data || []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </form>
      {tous.some((e) => e.scol_du) && (
        <div className="chips" style={{ marginBottom: 10 }}>
          <button type="button" className="chip" aria-pressed={!scol} onClick={() => setScol('')}>
            Tous
          </button>
          <button type="button" className="chip" aria-pressed={scol === 'regle'} onClick={() => setScol('regle')}>
            Scolarité réglée ({tous.filter((e) => statutDe(e) === 'regle').length})
          </button>
          <button type="button" className="chip" aria-pressed={scol === 'non'} onClick={() => setScol('non')}>
            Non réglée ({tous.filter((e) => ['partiel', 'non_paye'].includes(statutDe(e))).length})
          </button>
        </div>
      )}
      {tous.length > 0 && (
        <div className="compta-kpis" style={{ marginBottom: 12 }}>
          <div className="compta-kpi">
            <span>Élèves</span>
            <b>{tous.length.toLocaleString('fr-FR')}</b>
            <small>{classes.length} classe(s)</small>
          </div>
          <div className="compta-kpi">
            <span>Parents reliés</span>
            <b>{tous.filter((e) => e.parents > 0).length.toLocaleString('fr-FR')}</b>
            <small>{Math.round((tous.filter((e) => e.parents > 0).length / tous.length) * 100)} % des élèves</small>
          </div>
          <div className="compta-kpi">
            <span>Comptes créés</span>
            <b>{tous.filter((e) => e.a_un_compte).length.toLocaleString('fr-FR')}</b>
            <small>élèves inscrits</small>
          </div>
          <div className="compta-kpi">
            <span>Scolarité réglée</span>
            <b style={{ color: '#5fd0a0' }}>{tous.filter((e) => statutDe(e) === 'regle').length.toLocaleString('fr-FR')}</b>
            <small>{tous.filter((e) => ['partiel', 'non_paye'].includes(statutDe(e))).length.toLocaleString('fr-FR')} non réglée(s)</small>
          </div>
        </div>
      )}
      <Note>{error}</Note>
      {liste.length > 0 && surOrdinateur() && (
        <TableauTriable
          lignes={liste}
          onLigne={(e) => (window.location.hash = `/eleves/${e.id}`)}
          colonnes={[
            { cle: 'last_name', titre: 'Nom', rendu: (e) => <b>{e.last_name}</b> },
            { cle: 'first_name', titre: 'Prénom(s)' },
            {
              cle: 'class_name',
              titre: 'Classe',
              rendu: (e) =>
                e.class_id ? (
                  e.class_name
                ) : (
                  <select
                    className="input"
                    style={{ width: 'auto', padding: '6px 8px', fontSize: 13 }}
                    value=""
                    onClick={(ev) => ev.stopPropagation()}
                    disabled={busy === e.id || !classes.data?.length}
                    onChange={(ev) => placer(e.id, ev.target.value)}
                  >
                    <option value="">{e.declared_class ? `${e.declared_class} → placer…` : 'Placer…'}</option>
                    {(classes.data || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                ),
            },
            { cle: 'matricule', titre: 'Matricule' },
            { cle: 'parents', titre: 'Parents', style: { textAlign: 'center' } },
            { cle: 'a_un_compte', titre: 'Compte', rendu: (e) => (e.a_un_compte ? 'Oui' : '—'), tri: (e) => (e.a_un_compte ? 1 : 0) },
            {
              cle: 'reste',
              titre: 'Scolarité',
              tri: (e) => Math.max(0, (e.scol_du || 0) - (e.scol_paye || 0)),
              rendu: (e) => <StatutScolarite statut={statutDe(e)} reste={(e.scol_du || 0) - (e.scol_paye || 0)} />,
            },
          ]}
        />
      )}
      {liste.length > 0 && !surOrdinateur() && (
        <ul className="liste-eleves">
          {liste.map((e) => (
            <li key={e.id}>
              <a href={`#/eleves/${e.id}`}>
                <span className="initiales">
                  {(e.last_name || '?')[0]}
                  {(e.first_name || '')[0]}
                </span>
                <span className="nom">
                  <b>
                    {e.last_name} {e.first_name}
                  </b>
                  <small>
                    {e.class_name || `Déclaré : ${e.declared_class || '—'}`}
                    {e.parents > 0 ? ` · ${e.parents} parent(s)` : ''}
                    {e.a_un_compte ? ' · compte' : ''}
                  </small>
                </span>
                <StatutScolarite statut={statutDe(e)} reste={e.scol_du - e.scol_paye} />
              </a>
              {!e.class_id && (
                <select
                  className="input"
                  style={{ width: 'auto', maxWidth: 120, padding: '8px 10px' }}
                  value=""
                  disabled={busy === e.id || !classes.data?.length}
                  onChange={(ev) => placer(e.id, ev.target.value)}
                >
                  <option value="">Classe…</option>
                  {(classes.data || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </li>
          ))}
        </ul>
      )}
      {!eleves.loading && liste.length === 0 && <p className="lede">Aucun élève. Importez une liste de classe pour commencer.</p>}
    </>
  )
}
