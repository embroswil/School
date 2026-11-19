import { useEffect, useState } from 'react'
import { api, apiBase } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'
import ChoixEleve from '../ChoixEleve.jsx'
import { fcfa, MODES_PAIEMENT } from '../recus.js'
import { IcImprimante, IcReglages } from '../icones.jsx'
import { brouillardHtml, ecrireReglagesImpression, FORMATS, imprimer, lireReglagesImpression, recuHtml } from '../impression.js'

const MODES = ['especes', 'mobile_money', 'banque', 'autre']
const nombre = (v) => Number(String(v ?? '').replace(/[^\d]/g, '')) || 0
const millier = (n) => (n ? Number(n).toLocaleString('fr-FR') : '')
const heure = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
const aujourdhui = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const jourCourt = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
const logoEcole = (op) => (op.ecole.aPhoto ? `${apiBase()}/api/actualites/ecoles/${op.ecole.id}/photo` : '')

// Impression d'un recu de caisse, en un ou deux exemplaires
function imprimerRecu(op, reglages) {
  const exemplaires = reglages.copies === 2 ? ['Exemplaire de l’élève', 'Exemplaire de la caisse'] : ['']
  const html = exemplaires.map((e) => recuHtml(op, { format: reglages.format, exemplaire: e, logo: logoEcole(op) })).join('<div class="saut-page"></div>')
  imprimer(html, reglages.format)
}

// Guichet de l'intendance : encaisser un ou plusieurs frais d'un eleve, imprimer le recu,
// suivre la caisse du jour et imprimer le brouillard de caisse.
export default function Guichet() {
  const [eleveId, setEleveId] = useState('')
  const situation = useApi(eleveId ? `/api/scolarite/eleves/${eleveId}` : null)
  const [choix, setChoix] = useState({}) // fraisId -> montant (texte) pour les frais coches
  const [mode, setMode] = useState('especes')
  const [ref, setRef] = useState('')
  const [versePar, setVersePar] = useState('')
  const [telephone, setTelephone] = useState('')
  const [remis, setRemis] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [recu, setRecu] = useState(null) // encaissement termine
  const [date, setDate] = useState(aujourdhui)
  const [q, setQ] = useState('')
  const caisse = useApi(`/api/scolarite/caisse?date=${date}`)
  const [reglages, setReglages] = useState(lireReglagesImpression)
  const [voirReglages, setVoirReglages] = useState(false)
  const [reimpression, setReimpression] = useState('')

  // nouvel eleve choisi : on repart de zero
  useEffect(() => {
    setChoix({})
    setRef('')
    setVersePar('')
    setTelephone('')
    setRemis('')
    setError('')
  }, [eleveId])

  const majReglages = (r) => {
    const n = { ...reglages, ...r }
    setReglages(n)
    ecrireReglagesImpression(n)
  }

  const s = situation.data
  const dus = (s?.frais || []).filter((f) => f.reste > 0)
  const soldes = (s?.frais || []).length - dus.length
  const lignes = dus.filter((f) => choix[f.id] !== undefined).map((f) => ({ frais: f, montant: nombre(choix[f.id]) }))
  const total = lignes.reduce((t, l) => t + l.montant, 0)
  const trop = lignes.find((l) => l.montant > l.frais.reste)
  const vide = lignes.find((l) => !l.montant)
  const rendu = mode === 'especes' && nombre(remis) > total ? nombre(remis) - total : 0
  const manque = mode === 'especes' && remis && nombre(remis) < total

  const cocher = (f) =>
    setChoix((c) => {
      const n = { ...c }
      if (n[f.id] !== undefined) delete n[f.id]
      else n[f.id] = millier(f.reste)
      return n
    })
  const toutCocher = () => setChoix(Object.fromEntries(dus.map((f) => [f.id, millier(f.reste)])))

  async function encaisser(e) {
    e.preventDefault()
    if (!lignes.length || trop || vide || busy) return
    setBusy(true)
    setError('')
    try {
      const r = await api.post('/api/scolarite/encaissements', {
        studentId: Number(eleveId),
        lignes: lignes.map((l) => ({ fraisId: l.frais.id, montant: l.montant })),
        mode,
        recuExterne: ref.trim(),
        versePar: versePar.trim(),
        telephone: telephone.trim(),
      })
      setRecu(r.data)
      caisse.reload()
      if (reglages.auto) imprimerRecu(r.data, reglages)
      window.scrollTo(0, 0)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  function nouveau() {
    setRecu(null)
    setEleveId('')
    setMode('especes')
    window.scrollTo(0, 0)
  }

  async function reimprimer(op) {
    setReimpression(op)
    try {
      imprimerRecu((await api.get(`/api/scolarite/encaissements/${encodeURIComponent(op)}`)).data, reglages)
    } catch (err) {
      setError(err.message)
    }
    setReimpression('')
  }

  const c = caisse.data
  const ops = (c?.operations || []).filter((o) => {
    const t = q.trim().toLowerCase()
    return !t || `${o.nom} ${o.prenom} ${o.classe} ${o.numero} ${o.recu_externe || ''} ${o.frais}`.toLowerCase().includes(t)
  })
  const estAujourdhui = date === aujourdhui()

  return (
    <div className="guichet">
      <div className="guichet-tete">
        <h1 className="page-title">Encaisser</h1>
        <button type="button" className={`icon-btn ${voirReglages ? 'actif' : ''}`} aria-label="Réglages d’impression" title="Réglages d’impression" onClick={() => setVoirReglages((v) => !v)}>
          <IcReglages size={20} />
        </button>
      </div>

      {voirReglages && (
        <div className="card guichet-reglages">
          <b>Impression des reçus</b>
          <div className="gu-choix" role="group" aria-label="Format">
            {Object.entries(FORMATS).map(([k, v]) => (
              <button key={k} type="button" aria-pressed={reglages.format === k} onClick={() => majReglages({ format: k })}>
                {v}
              </button>
            ))}
          </div>
          <label className="gu-case">
            <input type="checkbox" checked={reglages.copies === 2} onChange={(e) => majReglages({ copies: e.target.checked ? 2 : 1 })} />
            Deux exemplaires (élève et caisse)
          </label>
          <label className="gu-case">
            <input type="checkbox" checked={reglages.auto} onChange={(e) => majReglages({ auto: e.target.checked })} />
            Imprimer automatiquement après chaque encaissement
          </label>
          <p className="muted">Ticket 80 mm : imprimante de caisse. A5 : imprimante de bureau, avec QR code et cachet.</p>
        </div>
      )}

      <div className="guichet-corps">
        <div className="guichet-principal">
          {/* ---------- recu de l'encaissement qui vient d'etre fait ---------- */}
          {recu && (
            <div className="card gu-fait">
              <div className="gu-fait-tete">
                <span className="gu-sceau" aria-hidden="true">
                  ✓
                </span>
                <div>
                  <b>{`${fcfa(recu.total)} encaissés`}</b>
                  <small>{`${recu.eleve.nom} ${recu.eleve.prenom} · ${recu.eleve.classe || '—'}`}</small>
                </div>
              </div>
              <div className="gu-apercu" dangerouslySetInnerHTML={{ __html: recuHtml(recu, { format: 'a5', logo: logoEcole(recu) }) }} />
              <div className="gu-actions">
                <button type="button" className="btn bouton-icone" onClick={() => imprimerRecu(recu, reglages)}>
                  <IcImprimante size={19} /> Imprimer le reçu
                </button>
                <button type="button" className="btn btn-quiet" onClick={nouveau}>
                  Nouvel encaissement
                </button>
              </div>
              <p className="gu-liens">
                {recu.lignes.map((l) => (
                  <a key={l.id} href={`#/recus/${l.id}`}>{`Reçu ${l.numero} (PDF, partage)`}</a>
                ))}
                <a href={`#/releve/${recu.eleve.id}`}>Relevé de l’élève</a>
              </p>
            </div>
          )}

          {/* ---------- formulaire d'encaissement ---------- */}
          {!recu && (
            <form className="card gu-form" onSubmit={encaisser}>
              <p className="gu-etape">1. Élève</p>
              <ChoixEleve valeur={eleveId} onChange={setEleveId} />

              {eleveId && situation.loading && !s && <p className="muted">Chargement de la situation…</p>}
              {eleveId && situation.error && <Note>{situation.error}</Note>}
              {s && (
                <>
                  <div className="gu-situation">
                    <div>
                      <span>Année</span>
                      <b>{millier(s.total) || '0'}</b>
                    </div>
                    <div>
                      <span>Payé</span>
                      <b className="vert">{millier(s.paye) || '0'}</b>
                    </div>
                    <div>
                      <span>Reste</span>
                      <b className={s.reste ? 'rouge' : 'vert'}>{millier(s.reste) || '0'}</b>
                    </div>
                    <small className="gu-situation-unite">Montants en FCFA</small>
                  </div>

                  <div className="gu-etape-ligne">
                    <p className="gu-etape">2. Frais à encaisser</p>
                    {dus.length > 1 && (
                      <button type="button" className="lien-discret" onClick={toutCocher}>
                        Tout solder
                      </button>
                    )}
                  </div>
                  {!dus.length && <p className="gu-ajour">Cet élève est à jour : aucun frais à payer.</p>}
                  <div className="gu-frais">
                    {dus.map((f) => {
                      const coche = choix[f.id] !== undefined
                      const retard = f.echeance && new Date(f.echeance) < new Date() && f.reste > 0
                      return (
                        <div key={f.id} className={`gu-ligne ${coche ? 'coche' : ''}`}>
                          <label className="gu-ligne-nom">
                            <input type="checkbox" checked={coche} onChange={() => cocher(f)} />
                            <span>
                              <b>{f.nom}</b>
                              <small className={retard ? 'rouge' : ''}>
                                {`Reste ${fcfa(f.reste)}${f.paye ? ` sur ${fcfa(f.montant)}` : ''}${retard ? ' · en retard' : ''}`}
                              </small>
                            </span>
                          </label>
                          {coche && (
                            <input
                              className={`input gu-montant ${nombre(choix[f.id]) > f.reste ? 'erreur' : ''}`}
                              inputMode="numeric"
                              aria-label={`Montant pour ${f.nom}`}
                              value={choix[f.id]}
                              onChange={(e) => setChoix((x) => ({ ...x, [f.id]: millier(nombre(e.target.value)) }))}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {soldes > 0 && <p className="muted gu-soldes">{`${soldes} frais déjà soldé(s)`}</p>}
                  {trop && <Note>{`${trop.frais.nom} : le montant dépasse le reste à payer (${fcfa(trop.frais.reste)}).`}</Note>}

                  {lignes.length > 0 && (
                    <>
                      <p className="gu-etape">3. Paiement</p>
                      <div className="gu-choix" role="group" aria-label="Mode de paiement">
                        {MODES.map((m) => (
                          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
                            {MODES_PAIEMENT[m]}
                          </button>
                        ))}
                      </div>
                      <div className="grid2">
                        <label className="gu-champ">
                          <span>{mode === 'banque' ? 'N° du bordereau' : mode === 'mobile_money' ? 'N° de transaction' : 'N° du reçu papier'} (facultatif)</span>
                          <input className="input" value={ref} onChange={(e) => setRef(e.target.value)} autoComplete="off" />
                        </label>
                        <label className="gu-champ">
                          <span>Versé par (facultatif)</span>
                          <input className="input" value={versePar} onChange={(e) => setVersePar(e.target.value)} placeholder="Nom du parent ou du tuteur" />
                        </label>
                      </div>
                      <div className="grid2">
                        <label className="gu-champ">
                          <span>Téléphone (facultatif)</span>
                          <input className="input" type="tel" inputMode="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} />
                        </label>
                        {mode === 'especes' && (
                          <label className="gu-champ">
                            <span>Somme remise (pour la monnaie)</span>
                            <input className="input" inputMode="numeric" value={remis} onChange={(e) => setRemis(millier(nombre(e.target.value)))} />
                          </label>
                        )}
                      </div>
                      {rendu > 0 && <p className="gu-rendu">{`Monnaie à rendre : ${fcfa(rendu)}`}</p>}
                      {manque && <p className="gu-rendu rouge">{`Il manque ${fcfa(total - nombre(remis))}`}</p>}
                    </>
                  )}
                </>
              )}

              <Note>{error}</Note>
              {s && dus.length > 0 && (
                <button className="btn btn-block gu-valider" type="submit" disabled={busy || !lignes.length || Boolean(trop) || Boolean(vide)}>
                  {busy ? 'Enregistrement…' : lignes.length ? `Encaisser ${fcfa(total)}` : 'Cochez le ou les frais payés'}
                </button>
              )}
              {s && <a className="gu-releve" href={`#/releve/${s.eleve.id}`}>Relevé de scolarité de l’élève</a>}
            </form>
          )}
        </div>

        {/* ---------- caisse du jour ---------- */}
        <aside className="guichet-caisse">
          <div className="card gu-caisse">
            <div className="gu-caisse-tete">
              <div>
                <span>{estAujourdhui ? 'Caisse du jour' : 'Caisse du'}</span>
                <small>{jourCourt(date)}</small>
              </div>
              <input className="input gu-date" type="date" value={date} max={aujourdhui()} onChange={(e) => setDate(e.target.value || aujourdhui())} aria-label="Jour" />
            </div>
            <b className="gu-total">{fcfa(c?.total)}</b>
            <small className="muted">{c ? `${c.nb} encaissement(s)` : 'Chargement…'}</small>
            {c && Object.keys(c.parMode).length > 0 && (
              <div className="gu-modes">
                {Object.entries(c.parMode).map(([m, v]) => (
                  <span key={m}>
                    {MODES_PAIEMENT[m] || m} <b>{fcfa(v)}</b>
                  </span>
                ))}
              </div>
            )}
            <button type="button" className="btn btn-quiet bouton-icone gu-brouillard" disabled={!c} onClick={() => imprimer(brouillardHtml(c), 'a4')}>
              <IcImprimante size={18} /> Brouillard de caisse
            </button>
          </div>

          <div className="gu-liste-tete">
            <p className="niveau-titre">Encaissements</p>
            {(c?.operations || []).length > 4 && (
              <input className="input gu-recherche" type="search" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
            )}
          </div>
          {c && !c.operations.length && <p className="muted">{estAujourdhui ? 'Aucun encaissement pour le moment aujourd’hui.' : 'Aucun encaissement ce jour-là.'}</p>}
          {ops.length > 0 && (
            <ul className="liste-simple gu-liste">
              {ops.map((o) => (
                <li key={o.op}>
                  <span className="ls-texte">
                    <b data-brut>{`${o.nom} ${o.prenom}`}</b>
                    <small>{`${heure(o.created_at)} · ${o.classe || '—'} · ${o.frais}`}</small>
                    <small>{`${MODES_PAIEMENT[o.mode] || o.mode} · ${o.numero}`}</small>
                  </span>
                  <span className="ls-montant">
                    <b>{fcfa(o.montant)}</b>
                    <button type="button" className="lien-action" disabled={reimpression === o.op} onClick={() => reimprimer(o.op)}>
                      {reimpression === o.op ? '…' : 'Imprimer'}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  )
}
