import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'
import { TableauTriable } from '../export.jsx'
import { IcActus, IcCarte, IcChevron, IcClasses, IcEcole, IcEleves } from '../icones.jsx'

// Ligne d'action (meme style que le tableau de bord)
function Ligne({ Icone, titre, texte, href, onClick, ouvert, compteur }) {
  const contenu = (
    <>
      <span className="ico">
        <Icone />
      </span>
      <span>
        <b>{titre}</b>
        <small>{texte}</small>
      </span>
      <span className="fin">
        {compteur !== undefined && <span className="tag">{compteur}</span>}
        <span style={{ display: 'inline-flex', transform: ouvert ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>
          <IcChevron size={18} />
        </span>
      </span>
    </>
  )
  return href ? (
    <a className="action-row" href={href}>
      {contenu}
    </a>
  ) : (
    <button type="button" className="action-row" onClick={onClick} style={{ width: '100%', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}>
      {contenu}
    </button>
  )
}

// Une classe : un resume, puis des rubriques a ouvrir
export default function ClassDetail({ id }) {
  const d = useApi(`/api/etablissement/classes/${id}`)
  const profs = useApi('/api/etablissement/enseignants')
  const [ouvert, setOuvert] = useState(null) // 'eleves' | 'enseignants' | 'pp'
  const [recherche, setRecherche] = useState('')
  const bascule = (k) => setOuvert((o) => (o === k ? null : k))

  async function definirPP(teacherId) {
    await api.put(`/api/etablissement/classes/${id}/professeur-principal`, { teacherId: Number(teacherId) || null })
    setOuvert(null)
    d.reload()
  }

  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Chargement…</p>
  const { classe, eleves, enseignants } = d.data
  const filles = eleves.filter((e) => e.gender === 'female').length
  const garcons = eleves.filter((e) => e.gender === 'male').length
  const q = recherche.trim().toLowerCase()
  const visibles = eleves.filter((e) => !q || `${e.last_name} ${e.first_name}`.toLowerCase().includes(q))

  return (
    <>
      <section className="hero-card" style={{ marginTop: 4 }}>
        <span className="badge">Année {classe.annee}</span>
        <h2 style={{ marginTop: 8 }}>{classe.name}</h2>
        <p>{classe.class_teacher_id ? `Prof. principal : ${classe.pp_prenom} ${classe.pp_nom}` : 'Aucun professeur principal'}</p>
      </section>
      <div className="stats" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <div className="stat">
          <b>{eleves.length}</b>
          <span>élèves</span>
        </div>
        <div className="stat">
          <b>{garcons}</b>
          <span>garçons</span>
        </div>
        <div className="stat">
          <b>{filles}</b>
          <span>filles</span>
        </div>
      </div>

      <h2 className="section-title">Suivi de la classe</h2>
      <Ligne Icone={IcCarte} titre="Résultats et classement" texte="Moyennes, rangs, taux de réussite" href={`#/classes/${id}/notes?onglet=resultats`} />
      <Ligne Icone={IcCarte} titre="Conseil de fin d’année" texte="Moyenne annuelle et décisions" href={`#/classes/${id}/annuel`} />
      <Ligne Icone={IcActus} titre="Conseil d’enseignement" texte="Rapport de fin de trimestre par matière" href="#/conseil-enseignement" />
      <Ligne Icone={IcClasses} titre="Emploi du temps" texte="Cours de la semaine" href={`#/classes/${id}/emploi`} />
      <Ligne Icone={IcActus} titre="Évaluations" texte="Devoirs et notes publiés par les enseignants" href={`#/classes/${id}/notes`} />
      <Ligne Icone={IcClasses} titre="Présences" texte="Appel fait en classe par les enseignants" href={`#/classes/${id}/appel`} />
      <Ligne Icone={IcActus} titre="Cahier de textes" texte="Devoirs donnés par les enseignants" href={`#/classes/${id}/devoirs`} />

      <h2 className="section-title">Équipe et élèves</h2>
      <Ligne
        Icone={IcEleves}
        titre="Afficher les élèves"
        texte="Liste, fiches et parents"
        compteur={eleves.length}
        ouvert={ouvert === 'eleves'}
        onClick={() => bascule('eleves')}
      />
      {ouvert === 'eleves' && (
        <div style={{ margin: '10px 0 4px' }}>
          {eleves.length > 10 && (
            <input className="input" placeholder="Rechercher un élève" value={recherche} onChange={(e) => setRecherche(e.target.value)} style={{ marginBottom: 10 }} />
          )}
          {eleves.length === 0 ? (
            <p className="muted">
              Aucun élève. <a href="#/import-eleves">Importer une liste</a>
            </p>
          ) : (
            <TableauTriable
              tableur
              lignes={visibles}
              onLigne={(e) => (window.location.hash = `/eleves/${e.id}`)}
              colonnes={[
                { cle: 'n', titre: 'N°', classe: 'g-num', rendu: (e) => eleves.indexOf(e) + 1, tri: (e) => eleves.indexOf(e) },
                { cle: 'last_name', titre: 'Nom et prénom', classe: 'g-nom', rendu: (e) => `${e.last_name} ${e.first_name}` },
                { cle: 'gender', titre: 'Sexe', rendu: (e) => ({ female: 'F', male: 'M' })[e.gender] || '—' },
                { cle: 'parents', titre: 'Parents', classe: 'g-num' },
                { cle: 'a_un_compte', titre: 'Compte', rendu: (e) => (e.a_un_compte ? 'Oui' : 'Non') },
              ]}
            />
          )}
        </div>
      )}

      <Ligne
        Icone={IcEcole}
        titre="Enseignants de la classe"
        texte="Matières et professeurs"
        compteur={enseignants.length}
        ouvert={ouvert === 'enseignants'}
        onClick={() => bascule('enseignants')}
      />
      {ouvert === 'enseignants' && (
        <div style={{ margin: '10px 0 4px' }}>
          {enseignants.length === 0 ? (
            <p className="muted">
              Aucun enseignant affecté. <a href="#/enseignants">Affecter des enseignants</a>
            </p>
          ) : (
            <TableauTriable
              tableur
              lignes={enseignants}
              cleLigne={(t) => `${t.id}-${t.matiere}`}
              colonnes={[
                { cle: 'matiere', titre: 'Matière', classe: 'g-nom' },
                { cle: 'last_name', titre: 'Enseignant', rendu: (t) => `${t.first_name} ${t.last_name}` },
                { cle: 'phone', titre: 'Téléphone', rendu: (t) => (t.phone ? <a href={`tel:${t.phone}`}>{t.phone}</a> : '—') },
              ]}
            />
          )}
        </div>
      )}

      <Ligne
        Icone={IcEleves}
        titre="Professeur principal"
        texte={classe.class_teacher_id ? `${classe.pp_prenom} ${classe.pp_nom}` : 'À désigner'}
        ouvert={ouvert === 'pp'}
        onClick={() => bascule('pp')}
      />
      {ouvert === 'pp' && (
        <div className="card" style={{ marginTop: 10 }}>
          <p className="muted" style={{ fontSize: 14, marginBottom: 8 }}>
            Il gère les coefficients et les résultats de la classe.
          </p>
          <select className="input" defaultValue={classe.class_teacher_id || ''} onChange={(e) => definirPP(e.target.value)}>
            <option value="">— Aucun —</option>
            {(profs.data || []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.last_name} {t.first_name}
                {t.matieres ? ` (${t.matieres})` : ''}
              </option>
            ))}
          </select>
          {classe.pp_tel && (
            <a className="btn btn-quiet btn-block" href={`tel:${classe.pp_tel}`} style={{ marginTop: 10 }}>
              📞 Appeler {classe.pp_prenom}
            </a>
          )}
        </div>
      )}
    </>
  )
}
