import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { BoutonExcel, exporterExcel } from '../export.jsx'
import { comparerClasses } from '../classes.js'

const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`
const court = (n) => {
  const v = Number(n || 0)
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} M`
  if (Math.abs(v) >= 1e3) return `${Math.round(v / 1e3).toLocaleString('fr-FR')} k`
  return String(v)
}
const taux = (e, a) => (Number(a) > 0 ? Math.round((Number(e) / Number(a)) * 100) : 0)
const couleur = (t) => (t >= 80 ? '#1e9e6a' : t >= 50 ? '#e0a21a' : '#e5484d')
const CATEGORIES = { scolarite: 'Scolarité / pension', inscription: 'Inscription', apee: 'APEE / APE', examen: 'Examens', tenue: 'Tenue scolaire', cantine: 'Cantine', transport: 'Transport', activite: 'Activités / sorties', autre: 'Autre' }
const MODES = { mobile_money: 'Mobile Money', especes: 'Espèces', banque: 'Banque', autre: 'Autre' }
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const jour = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Sans échéance')

function Barre({ valeur }) {
  const t = Math.min(100, valeur)
  return (
    <span className="compta-barre" title={`${valeur} %`}>
      <i style={{ width: `${t}%`, background: couleur(valeur) }} />
    </span>
  )
}
const Kpi = ({ titre, valeur, sous, accent }) => (
  <div className="compta-kpi">
    <span>{titre}</span>
    <b style={accent ? { color: accent } : undefined}>{valeur}</b>
    {sous && <small>{sous}</small>}
  </div>
)

function DetailClasse({ classe }) {
  const d = useApi(`/api/scolarite/comptabilite/eleves?classe=${encodeURIComponent(classe)}`)
  const [q, setQ] = useState('')
  const eleves = []
  const idx = new Map()
  for (const l of d.data || []) {
    if (!idx.has(l.id)) {
      const e = { id: l.id, nom: `${l.last_name} ${l.first_name}`, frais: [], du: 0, paye: 0, reste: 0 }
      idx.set(l.id, e)
      eleves.push(e)
    }
    const e = idx.get(l.id)
    e.frais.push(l)
    e.du += l.montant
    e.paye += l.paye
    e.reste += l.reste
  }
  const filtres = eleves.filter((e) => e.nom.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div className="compta-detail">
      <input className="input" placeholder="Rechercher un élève de la classe…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }} />
      {d.loading && <p className="muted">Chargement…</p>}
      {filtres.map((e) => (
        <details key={e.id} className="compta-eleve">
          <summary>
            <b>{e.nom}</b>
            <span className={e.reste > 0 ? 'rouge' : 'ok-vert'}>{e.reste > 0 ? `reste ${fcfa(e.reste)}` : '✓ réglé'}</span>
          </summary>
          <table className="tableau-ordi">
            <tbody>
              {e.frais.map((f) => (
                <tr key={f.frais}>
                  <td>
                    {f.frais}
                    <small className="muted" style={{ display: 'block' }}>
                      {CATEGORIES[f.categorie]} · {jour(f.echeance)}
                    </small>
                  </td>
                  <td style={{ textAlign: 'right' }}>{fcfa(f.montant)}</td>
                  <td style={{ textAlign: 'right' }}>{fcfa(f.paye)}</td>
                  <td style={{ textAlign: 'right', color: f.reste > 0 ? (f.en_retard ? '#ff7a82' : undefined) : '#5fd0a0' }}>{f.reste > 0 ? fcfa(f.reste) : '✓'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
      {!d.loading && filtres.length === 0 && <p className="muted">Aucun élève.</p>}
    </div>
  )
}

export default function Comptabilite() {
  const c = useApi('/api/scolarite/comptabilite')
  const [ouverte, setOuverte] = useState(null)
  const [categorieOuverte, setCategorieOuverte] = useState(null)
  const d = c.data
  if (c.loading && !d) return <p className="muted">Chargement de la comptabilité…</p>
  if (c.error) return <p className="muted">{c.error}</p>
  if (!d) return null
  const t = d.totaux
  const tx = taux(t.encaisse, t.attendu)
  const classes = [...d.classes].sort((a, b) => comparerClasses(a.classe, b.classe))
  const maxMois = Math.max(1, ...d.mois.map((m) => Number(m.total)))

  async function exporter() {
    const detail = (await api.get('/api/scolarite/comptabilite/eleves')).data
    await exporterExcel('comptabilite-scolarite', [
      {
        nom: 'Synthèse',
        lignes: [
          { Indicateur: 'Année scolaire', Valeur: d.annee || '' },
          { Indicateur: 'Attendu (FCFA)', Valeur: t.attendu },
          { Indicateur: 'Encaissé (FCFA)', Valeur: t.encaisse },
          { Indicateur: 'Reste à encaisser (FCFA)', Valeur: t.reste },
          { Indicateur: 'Taux de recouvrement (%)', Valeur: tx },
          { Indicateur: 'Élèves soldés', Valeur: t.soldes },
          { Indicateur: 'Élèves en retard', Valeur: t.enRetard },
        ],
      },
      { nom: 'Par type de frais', lignes: d.categories.map((x) => ({ 'Type de frais': CATEGORIES[x.categorie], 'Attendu (FCFA)': Number(x.attendu), 'Encaissé (FCFA)': Number(x.encaisse), 'Reste (FCFA)': Number(x.reste), 'Taux (%)': taux(x.encaisse, x.attendu) })) },
      { nom: 'Par frais', lignes: d.frais.map((x) => ({ Frais: x.nom, Type: CATEGORIES[x.categorie], Échéance: x.echeance ? jour(x.echeance) : 'Sans échéance', 'Attendu (FCFA)': Number(x.attendu), 'Encaissé (FCFA)': Number(x.encaisse), 'Reste (FCFA)': Number(x.reste), 'Taux (%)': taux(x.encaisse, x.attendu), 'Élèves en retard': x.en_retard })) },
      { nom: 'Par classe', lignes: classes.map((x) => ({ Classe: x.classe, Effectif: x.effectif, 'Attendu (FCFA)': Number(x.attendu), 'Encaissé (FCFA)': Number(x.encaisse), 'Reste (FCFA)': Number(x.reste), 'Taux (%)': taux(x.encaisse, x.attendu), 'Élèves en retard': x.en_retard })) },
      { nom: 'Détail élèves', lignes: detail.map((l) => ({ Classe: l.classe, Nom: l.last_name, 'Prénom(s)': l.first_name, Frais: l.frais, Type: CATEGORIES[l.categorie], Échéance: l.echeance ? jour(l.echeance) : 'Sans échéance', 'Montant (FCFA)': l.montant, 'Payé (FCFA)': l.paye, 'Reste (FCFA)': l.reste, 'En retard': l.en_retard ? 'Oui' : '' })) },
    ])
  }

  return (
    <>
      <div className="barre-outils">
        <h2 className="section-title" style={{ margin: 0 }}>
          Comptabilité {d.annee ? `· ${d.annee}` : ''}
        </h2>
        <span className="espace" />
        <BoutonExcel onClick={exporter} texte="Exporter tout en Excel" />
      </div>

      <div className="compta-kpis">
        <Kpi titre="Attendu" valeur={fcfa(t.attendu)} sous={`${t.eleves.toLocaleString('fr-FR')} élèves`} />
        <Kpi titre="Encaissé" valeur={fcfa(t.encaisse)} accent="#5fd0a0" sous={`${tx} % de l’attendu`} />
        <Kpi titre="Reste à encaisser" valeur={fcfa(t.reste)} accent={t.reste > 0 ? '#ff7a82' : undefined} sous={`${t.enRetard.toLocaleString('fr-FR')} élève(s) en retard`} />
        <Kpi titre="Taux de recouvrement" valeur={`${tx} %`} accent={couleur(tx)} sous={`${t.soldes.toLocaleString('fr-FR')} élève(s) soldé(s)`} />
      </div>

      <h2 className="section-title">Par type de frais</h2>
      {d.categories.length === 0 && <p className="muted">Aucun frais obligatoire n’est encore défini : ajoutez-les dans l’onglet Frais.</p>}
      <div className="tableau-ordi-cadre">
        <table className="tableau-ordi">
          <thead>
            <tr>
              <th>Type de frais</th>
              <th style={{ textAlign: 'right' }}>Attendu</th>
              <th style={{ textAlign: 'right' }}>Encaissé</th>
              <th style={{ textAlign: 'right' }}>Reste</th>
              <th>Taux</th>
            </tr>
          </thead>
          <tbody>
            {d.categories.map((x) => {
              const ouvert = categorieOuverte === x.categorie
              return [
                <tr key={x.categorie} className="cliquable" onClick={() => setCategorieOuverte(ouvert ? null : x.categorie)}>
                  <td>
                    <b>
                      {ouvert ? '▾' : '▸'} {CATEGORIES[x.categorie]}
                    </b>
                  </td>
                  <td style={{ textAlign: 'right' }}>{fcfa(x.attendu)}</td>
                  <td style={{ textAlign: 'right' }}>{fcfa(x.encaisse)}</td>
                  <td style={{ textAlign: 'right' }}>{fcfa(x.reste)}</td>
                  <td>
                    <Barre valeur={taux(x.encaisse, x.attendu)} /> {taux(x.encaisse, x.attendu)} %
                  </td>
                </tr>,
                ...(ouvert
                  ? d.frais
                      .filter((f) => f.categorie === x.categorie)
                      .map((f) => (
                        <tr key={`f${f.id}`} className="compta-sous">
                          <td>
                            {f.nom}
                            <small className="muted" style={{ display: 'block' }}>
                              {jour(f.echeance)} · {f.eleves.toLocaleString('fr-FR')} élèves{f.en_retard ? ` · ${f.en_retard} en retard` : ''}
                            </small>
                          </td>
                          <td style={{ textAlign: 'right' }}>{fcfa(f.attendu)}</td>
                          <td style={{ textAlign: 'right' }}>{fcfa(f.encaisse)}</td>
                          <td style={{ textAlign: 'right' }}>{fcfa(f.reste)}</td>
                          <td>
                            <Barre valeur={taux(f.encaisse, f.attendu)} /> {taux(f.encaisse, f.attendu)} %
                          </td>
                        </tr>
                      ))
                  : []),
              ]
            })}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">Modes de paiement et évolution</h2>
      <div className="compta-deux">
        <div className="card">
          <b>Par mode de paiement</b>
          {d.modes.length === 0 && <p className="muted">Aucun paiement pour le moment.</p>}
          {d.modes.map((m) => {
            const part = taux(m.total, d.modes.reduce((s, x) => s + Number(x.total), 0))
            return (
              <div key={m.mode} className="compta-ligne">
                <span>{MODES[m.mode] || m.mode}</span>
                <Barre valeur={part} />
                <b>{fcfa(m.total)}</b>
                <small className="muted">{m.nb} paiement(s)</small>
              </div>
            )
          })}
        </div>
        <div className="card">
          <b>Encaissements des 12 derniers mois</b>
          {d.mois.length === 0 && <p className="muted">Aucun encaissement pour le moment.</p>}
          <div className="compta-mois">
            {d.mois.map((m) => (
              <div key={m.mois} title={`${fcfa(m.total)} · ${m.nb} paiement(s)`}>
                <i style={{ height: `${Math.max(6, (Number(m.total) / maxMois) * 90)}px` }} />
                <small>{MOIS[Number(m.mois.slice(5)) - 1]}</small>
                <small className="muted">{court(m.total)}</small>
              </div>
            ))}
          </div>
        </div>
      </div>

      {d.facultatifs.length > 0 && (
        <>
          <h2 className="section-title">Frais facultatifs encaissés</h2>
          <div className="tableau-ordi-cadre">
            <table className="tableau-ordi">
              <tbody>
                {d.facultatifs.map((f) => (
                  <tr key={f.id}>
                    <td>
                      {f.nom}
                      <small className="muted" style={{ display: 'block' }}>
                        {CATEGORIES[f.categorie]}
                      </small>
                    </td>
                    <td style={{ textAlign: 'right' }}>{f.eleves} élève(s)</td>
                    <td style={{ textAlign: 'right' }}>
                      <b>{fcfa(f.encaisse)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 className="section-title">Par classe et par élève</h2>
      <p className="muted" style={{ fontSize: 13, margin: '0 2px 8px' }}>
        Touchez une classe pour voir ses élèves, frais par frais.
      </p>
      <div className="tableau-ordi-cadre">
        <table className="tableau-ordi">
          <thead>
            <tr>
              <th>Classe</th>
              <th style={{ textAlign: 'right' }}>Effectif</th>
              <th style={{ textAlign: 'right' }}>Encaissé</th>
              <th style={{ textAlign: 'right' }}>Reste</th>
              <th>Taux</th>
            </tr>
          </thead>
          <tbody>
            {classes.map((x) => {
              const ouvert = ouverte === x.classe
              return [
                <tr key={x.classe} className="cliquable" onClick={() => setOuverte(ouvert ? null : x.classe)}>
                  <td>
                    <b>
                      {ouvert ? '▾' : '▸'} {x.classe}
                    </b>
                  </td>
                  <td style={{ textAlign: 'right' }}>{x.effectif}</td>
                  <td style={{ textAlign: 'right' }}>{fcfa(x.encaisse)}</td>
                  <td style={{ textAlign: 'right' }}>{fcfa(x.reste)}</td>
                  <td>
                    <Barre valeur={taux(x.encaisse, x.attendu)} /> {taux(x.encaisse, x.attendu)} %
                  </td>
                </tr>,
                ouvert && (
                  <tr key={`d${x.classe}`}>
                    <td colSpan={5} style={{ padding: 10 }}>
                      <DetailClasse classe={x.classe} />
                    </td>
                  </tr>
                ),
              ]
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
