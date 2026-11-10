import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'
import { ListeOrdres } from './OrdrePaiement.jsx'
import StatutScolarite from './StatutScolarite.jsx'
import { BoutonExcel, exporterExcel } from '../export.jsx'
import Comptabilite from './Comptabilite.jsx'
import { envoyer } from './Documents.jsx'
import { useDepotPage } from '../depot.jsx'
import ChoixEleve from '../ChoixEleve.jsx'

const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`
const jour = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
const MODES = { mobile_money: 'Mobile Money', especes: 'Espèces', banque: 'Banque', autre: 'Autre' }
export const CATEGORIES = {
  scolarite: 'Scolarité / pension',
  inscription: 'Inscription',
  apee: 'APEE / APE',
  examen: 'Examens',
  tenue: 'Tenue scolaire',
  cantine: 'Cantine',
  transport: 'Transport',
  activite: 'Activités / sorties',
  autre: 'Autre',
}

// ------------------------------------------------------------ parents et eleves
function Situation() {
  const situation = useApi('/api/scolarite/situation')
  const [paiement, setPaiement] = useState(null) // { eleve, frais, moyens, mode: 'enligne' | 'transfert' }
  const [montant, setMontant] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  // Retour du paiement Mobile Money : verification
  useEffect(() => {
    const ref =
      new URLSearchParams(window.location.hash.split('?')[1] || '').get('reference') ||
      new URLSearchParams(window.location.search).get('reference') ||
      localStorage.getItem('school-paiement')
    if (!ref) return
    api
      .get(`/api/scolarite/verifier/${encodeURIComponent(ref)}`)
      .then((r) => {
        if (r.data.statut === 'reussi') {
          setInfo('✓ Paiement confirmé. Merci ! Votre reçu est disponible dans « Paiements effectués ».')
        }
        else if (r.data.statut === 'echoue') setError('Le paiement n’a pas abouti.')
        if (r.data.statut !== 'en_attente') localStorage.removeItem('school-paiement')
        situation.reload()
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Ordre de paiement « P2P » : le parent paie directement l'etablissement par Mobile Money
  async function payer(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      // Paiement en ligne (NotchPay : Orange Money, MTN MoMo, carte)
      if (paiement.moyen === 'enligne') {
        const r = await api.post('/api/scolarite/payer', {
          studentId: paiement.eleve.id,
          fraisId: paiement.frais.id,
          montant: Number(String(montant).replace(/\s/g, '')),
        })
        try {
          localStorage.setItem('school-paiement', r.data.reference)
        } catch (_) {}
        window.location.href = r.data.url
        return
      }
      const r = await api.post('/api/scolarite/ordres', {
        studentId: paiement.eleve.id,
        fraisId: paiement.frais.id,
        montant: Number(String(montant).replace(/\s/g, '')),
        moyen: paiement.moyen,
      })
      window.location.hash = `/ordres/${r.data.id}`
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <>
      <Note kind="ok">{info}</Note>
      <Note>{error}</Note>
      <ListeOrdres statut="a_payer,paye,litige" />
      {situation.loading && <p className="muted">Chargement…</p>}
      {situation.data?.length === 0 && (
        <p className="lede">
          Aucun élève relié à votre compte pour le moment. Un enfant est relié automatiquement dès qu’il apparaît dans l’établissement.
        </p>
      )}
      {situation.data?.map((s) => (
        <section key={s.eleve.id} style={{ marginBottom: 22 }}>
          <div className="hero-card" style={{ padding: 18 }}>
            <span className="badge">{s.eleve.classe || 'Classe non précisée'}</span>
            <h2 style={{ marginTop: 8, fontSize: 21 }}>
              {s.eleve.prenom} {s.eleve.nom}
            </h2>
            <div style={{ marginTop: 8 }}>
              <StatutScolarite statut={s.statut} reste={s.resteObligatoire} enRetard={s.enRetard} grand />
            </div>
            <div className="grid2" style={{ marginTop: 12 }}>
              <div>
                <div style={{ opacity: 0.8, fontSize: 13 }}>Payé</div>
                <div style={{ font: '800 20px/1.2 var(--font-display)' }}>{fcfa(s.paye)}</div>
              </div>
              <div>
                <div style={{ opacity: 0.8, fontSize: 13 }}>Reste à payer</div>
                <div style={{ font: '800 20px/1.2 var(--font-display)', color: s.reste ? '#ffd27a' : '#9ff0c4' }}>{fcfa(s.reste)}</div>
              </div>
            </div>
          </div>
          {s.frais.length === 0 && <p className="muted" style={{ marginTop: 10 }}>L’établissement n’a pas encore publié ses frais.</p>}
          {s.frais.length > 0 && (
            <ul className="rows" style={{ marginTop: 12 }}>
              {s.frais.map((f) => (
                <li className="row" key={f.id} style={{ flexWrap: 'wrap' }}>
                  <div className="row-main">
                    <div className="row-title">{f.nom}</div>
                    <div className="row-sub">
                      {CATEGORIES[f.categorie] && f.categorie !== 'scolarite' ? `${CATEGORIES[f.categorie]} · ` : ''}
                      {fcfa(f.montant)}
                      {f.echeance ? ` · avant le ${jour(f.echeance)}` : ''}
                      {!f.obligatoire ? ' · facultatif' : ''}
                    </div>
                  </div>
                  {f.reste === 0 ? (
                    <span className="tag tag-now">✓ Payé</span>
                  ) : (
                    <>
                      <span className="tag tag-wait">Reste {fcfa(f.reste)}</span>
                      {(s.moyens?.enLigne || s.moyens?.orange || s.moyens?.mtn) ? (
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: '9px 14px', fontSize: 14 }}
                          onClick={() => {
                            setPaiement({ eleve: s.eleve, frais: f, moyens: s.moyens, moyen: s.moyens.enLigne ? 'enligne' : s.moyens.orange ? 'orange_money' : 'mtn_momo' })
                            setMontant(String(f.reste))
                            setError('')
                          }}
                        >
                          Payer
                        </button>
                      ) : (
                        <span className="muted" style={{ fontSize: 13 }}>Paiement au guichet</span>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {s.paiements.length > 0 && (
            <>
              <h3 style={{ font: '700 16px/1.3 var(--font-display)', margin: '16px 0 8px' }}>Paiements effectués</h3>
              <ul className="rows">
                {s.paiements.map((p) => (
                  <li className="row" key={p.id}>
                    <div className="row-main">
                      <div className="row-title">{fcfa(p.montant)}</div>
                      <div className="row-sub">
                        {p.frais} · {MODES[p.mode]} · {jour(p.created_at)}
                      </div>
                    </div>
                    <a className="btn btn-quiet" style={{ padding: '8px 12px', fontSize: 14 }} href={`#/recus/${p.id}`}>
                      Reçu
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ))}

      {paiement && (
        <form className="card" onSubmit={payer} style={{ position: 'sticky', bottom: 90, border: '2px solid var(--primary)' }}>
          <b>
            {paiement.frais.nom} · {paiement.eleve.prenom}
          </b>
          <p className="muted" style={{ fontSize: 14, margin: '4px 0 10px' }}>
            {paiement.moyen === 'enligne'
              ? 'Paiement sécurisé par NotchPay : vous validez sur votre téléphone, le reçu est émis automatiquement.'
              : 'Transfert direct à l’établissement : School vous indique le numéro, le montant et un code à mettre en motif.'}
          </p>
          <div className="chips">
            {paiement.moyens.enLigne && (
              <button type="button" className="chip" aria-pressed={paiement.moyen === 'enligne'} onClick={() => setPaiement({ ...paiement, moyen: 'enligne' })}>
                💳 En ligne · Orange, MTN, carte
              </button>
            )}
            {paiement.moyens.orange && (
              <button type="button" className="chip" aria-pressed={paiement.moyen === 'orange_money'} onClick={() => setPaiement({ ...paiement, moyen: 'orange_money' })}>
                🟠 Orange Money
              </button>
            )}
            {paiement.moyens.mtn && (
              <button type="button" className="chip" aria-pressed={paiement.moyen === 'mtn_momo'} onClick={() => setPaiement({ ...paiement, moyen: 'mtn_momo' })}>
                🟡 MTN MoMo
              </button>
            )}
          </div>
          <Field label="Montant à payer (FCFA)">
            <input className="input" inputMode="numeric" value={montant} onChange={(e) => setMontant(e.target.value)} required />
          </Field>
          <Note>{error}</Note>
          <div className="actions">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Un instant…' : paiement.moyen === 'enligne' ? 'Payer maintenant' : 'Continuer'}
            </button>
            <button className="btn btn-quiet" type="button" onClick={() => setPaiement(null)}>
              Annuler
            </button>
          </div>
        </form>
      )}
    </>
  )
}

// ------------------------------------------------------------ etablissement
const FRAIS_VIDE = { id: null, nom: '', montant: '', echeance: '', classes: '', categorie: 'scolarite', obligatoire: true }
const STATUT_LU = { nouveau: ['Nouveau', '#5fd0a0'], modifie: ['Modifié', '#e0a21a'], identique: ['Identique', '#8c96aa'] }

// Lecture d'un document de frais : PDF, photo, Excel ou CSV
async function texteDuTableur(fichier) {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await fichier.arrayBuffer(), { type: 'array' })
  return wb.SheetNames.map((n) => `Feuille « ${n} »\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`).join('\n\n')
}

function Frais() {
  const frais = useApi('/api/scolarite/frais')
  const champ = useRef(null)
  const [f, setF] = useState(FRAIS_VIDE)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const [lus, setLus] = useState(null)
  const [lecture, setLecture] = useState('')
  const maj = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const edition = f.id !== null

  function modifier(x) {
    setF({
      id: x.id,
      nom: x.nom,
      montant: String(x.montant),
      echeance: x.echeance ? String(x.echeance).slice(0, 10) : '',
      classes: (x.classes || []).join(', '),
      categorie: x.categorie || 'scolarite',
      obligatoire: x.obligatoire,
    })
    setOk('')
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function enregistrer(e) {
    e.preventDefault()
    setError('')
    setOk('')
    setBusy(true)
    const donnees = {
      nom: f.nom,
      montant: Number(String(f.montant).replace(/\s/g, '')),
      echeance: f.echeance || null,
      categorie: f.categorie,
      obligatoire: f.obligatoire,
      classes: f.classes
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    }
    try {
      if (edition) await api.put(`/api/scolarite/frais/${f.id}`, donnees)
      else await api.post('/api/scolarite/frais', donnees)
      setOk(edition ? '✓ Frais modifié.' : '✓ Frais ajouté.')
      setF({ ...FRAIS_VIDE, categorie: f.categorie })
      frais.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }
  async function supprimer(id) {
    if (!window.confirm('Supprimer ce frais ?')) return
    try {
      await api.delete(`/api/scolarite/frais/${id}`)
      frais.reload()
    } catch (err) {
      setError(err.message)
    }
  }

  // Document contenant tous les frais : School le lit, compare avec les frais existants
  async function choisirDocument(e) {
    const fichier = [...(e.target.files || [])][0]
    e.target.value = ''
    if (!fichier) return
    setError('')
    setOk('')
    setLus(null)
    try {
      setLecture('Envoi du document…')
      let corps
      if (/\.(xlsx|xls|csv)$/i.test(fichier.name)) corps = { texte: await texteDuTableur(fichier) }
      else {
        const env = await envoyer(fichier)
        corps = { url: env.url, mime: env.mime }
      }
      setLecture('School lit le document… (jusqu’à une minute)')
      const r = (await api.post('/api/scolarite/frais/lire', corps)).data
      setLus(r.map((x, i) => ({ ...x, cle: i, choisi: x.statut !== 'identique' })))
    } catch (err) {
      setError(err.message)
    }
    setLecture('')
  }
  const zoneDepot = useDepotPage(choisirDocument, { texte: 'Déposez le document des frais', detail: 'PDF, photo, Excel ou CSV' })

  async function appliquer() {
    const choisis = lus.filter((x) => x.choisi && x.statut !== 'identique')
    if (!choisis.length) return setLus(null)
    setBusy(true)
    setError('')
    try {
      const r = (await api.post('/api/scolarite/frais/appliquer', { frais: choisis.map(({ id, nom, montant, echeance, classes, categorie, obligatoire }) => ({ id, nom, montant, echeance, classes, categorie, obligatoire })) })).data
      setOk(`✓ ${r.crees} frais ajouté(s), ${r.modifies} mis à jour. Les frais identiques n’ont pas été touchés.`)
      setLus(null)
      frais.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }
  const majLu = (cle, champs) => setLus((l) => l.map((x) => (x.cle === cle ? { ...x, ...champs } : x)))

  return (
    <>
      {zoneDepot}
      <input ref={champ} type="file" hidden accept=".pdf,.xlsx,.xls,.csv,image/*" onChange={choisirDocument} />
      <button type="button" className="depot" onClick={() => champ.current?.click()} disabled={Boolean(lecture)}>
        <span style={{ fontSize: 30 }}>📄</span>
        <b>{lecture || 'Importer un document de frais'}</b>
        <small>PDF, photo, Excel ou CSV : School remplit les frais automatiquement</small>
        <small className="astuce-depot">ou glissez-déposez le fichier n’importe où sur cette page</small>
      </button>
      <Note kind="ok">{ok}</Note>
      <Note>{error}</Note>

      {lus && (
        <div className="card" style={{ marginTop: 12 }}>
          <b>{lus.length} frais trouvé(s) dans le document</b>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 10px' }}>
            Vérifiez, décochez ce que vous ne voulez pas. Les frais <b>identiques</b> à ceux déjà enregistrés ne sont pas modifiés : seuls les nouveaux et les modifiés sont appliqués.
          </p>
          {lus.map((x) => (
            <div key={x.cle} className="frais-lu">
              <label className="check" style={{ margin: 0, alignItems: 'flex-start' }}>
                <input type="checkbox" checked={x.choisi && x.statut !== 'identique'} disabled={x.statut === 'identique'} onChange={(e) => majLu(x.cle, { choisi: e.target.checked })} />
                <span style={{ flex: 1 }}>
                  <b>{x.nom}</b> · {fcfa(x.montant)}
                  <small className="muted" style={{ display: 'block' }}>
                    {CATEGORIES[x.categorie]}
                    {x.obligatoire ? '' : ' · facultatif'} · {x.classes?.length ? x.classes.join(', ') : 'toutes les classes'} · {x.echeance ? `avant le ${jour(x.echeance)}` : 'sans échéance'}
                  </small>
                  {x.changements?.length > 0 && <small style={{ display: 'block', color: '#e0a21a' }}>Change : {x.changements.join(' ; ')}</small>}
                </span>
                <span className="frais-lu-statut" style={{ color: STATUT_LU[x.statut][1] }}>
                  {STATUT_LU[x.statut][0]}
                </span>
              </label>
            </div>
          ))}
          <div className="actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={appliquer} disabled={busy}>
              {busy ? 'Application…' : `Appliquer (${lus.filter((x) => x.choisi && x.statut !== 'identique').length})`}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setLus(null)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      <form className="card" onSubmit={enregistrer} style={{ marginTop: 12 }}>
        <b>{edition ? `Modifier le frais « ${f.nom} »` : 'Ajouter un frais'}</b>
        <Field label="Nom du frais">
          <input className="input" placeholder="ex. Pension – 1re tranche, Inscription, APEE" value={f.nom} onChange={maj('nom')} required />
        </Field>
        <div className="grid2">
          <Field label="Montant (FCFA)">
            <input className="input" inputMode="numeric" placeholder="ex. 50000" value={f.montant} onChange={maj('montant')} required />
          </Field>
          <Field label="Échéance (facultative)">
            <input className="input" type="date" value={f.echeance} onChange={maj('echeance')} />
          </Field>
        </div>
        <p className="muted" style={{ fontSize: 12.5, margin: '-4px 2px 10px' }}>
          Sans échéance, le frais n’est jamais « en retard » : il reste simplement dû jusqu’au paiement.
        </p>
        <Field label="Type de frais">
          <select className="input" value={f.categorie} onChange={maj('categorie')}>
            {Object.entries(CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <label className="check">
          <input type="checkbox" checked={!f.obligatoire} onChange={(e) => setF((x) => ({ ...x, obligatoire: !e.target.checked }))} />
          <span>Facultatif (cantine, transport, sortie…) : non compté dans les retards</span>
        </label>
        <Field label="Classes concernées (laisser vide = toutes)">
          <input className="input" placeholder="ex. 6e A, 6e B" value={f.classes} onChange={maj('classes')} />
        </Field>
        <div className="actions">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Enregistrement…' : edition ? 'Enregistrer les modifications' : '+ Ajouter le frais'}
          </button>
          {edition && (
            <button type="button" className="btn btn-quiet" onClick={() => setF(FRAIS_VIDE)}>
              Annuler
            </button>
          )}
        </div>
      </form>

      <h2 className="section-title">Frais de l’année</h2>
      {frais.data?.length === 0 && <p className="muted">Aucun frais pour le moment.</p>}
      {frais.data?.length > 0 && (
        <ul className="rows">
          {frais.data.map((x) => (
            <li className="row" key={x.id} style={{ flexWrap: 'wrap' }}>
              <div className="row-main">
                <div className="row-title">
                  {x.nom} · {fcfa(x.montant)}
                </div>
                <div className="row-sub">
                  {CATEGORIES[x.categorie] || 'Scolarité'}
                  {x.obligatoire ? '' : ' · facultatif'}
                </div>
                <div className="row-sub">
                  {x.classes?.length ? x.classes.join(', ') : 'Toutes les classes'} · {x.echeance ? `avant le ${jour(x.echeance)}` : 'sans échéance'} · encaissé {fcfa(x.encaisse)}
                </div>
              </div>
              <span style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn btn-quiet" style={{ padding: '8px 12px', fontSize: 14 }} onClick={() => modifier(x)}>
                  Modifier
                </button>
                <button type="button" className="btn btn-quiet btn-danger" style={{ padding: '8px 12px', fontSize: 14 }} onClick={() => supprimer(x.id)}>
                  Supprimer
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function Paiements() {
  const liste = useApi('/api/scolarite/paiements')
  const [eleveId, setEleveId] = useState('')
  const situation = useApi(eleveId ? `/api/scolarite/eleves/${eleveId}` : null)
  const tousFrais = useApi('/api/scolarite/frais')
  const [ed, setEd] = useState(null) // modification du frais choisi, sans quitter l'encaissement
  const [f, setF] = useState({ fraisId: '', montant: '', mode: 'especes', reference: '' })
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  async function enregistrer(e) {
    e.preventDefault()
    setError('')
    setOk('')
    setBusy(true)
    try {
      await api.post('/api/scolarite/paiements', {
        studentId: Number(eleveId),
        fraisId: Number(f.fraisId),
        montant: Number(String(f.montant).replace(/\s/g, '')),
        mode: f.mode,
        reference: f.reference,
      })
      setOk('Paiement enregistré. Les parents de l’élève sont notifiés.')
      setF({ fraisId: '', montant: '', mode: 'especes', reference: '' })
      situation.reload()
      liste.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  const dus = (situation.data?.frais || []).filter((x) => x.reste > 0)
  const fraisChoisi = (tousFrais.data || []).find((x) => String(x.id) === String(f.fraisId))

  function ouvrirModif() {
    if (!fraisChoisi) return
    setEd({ nom: fraisChoisi.nom, montant: String(fraisChoisi.montant), echeance: fraisChoisi.echeance ? String(fraisChoisi.echeance).slice(0, 10) : '' })
    setError('')
  }
  async function enregistrerModif() {
    setError('')
    try {
      await api.put(`/api/scolarite/frais/${fraisChoisi.id}`, {
        nom: ed.nom,
        montant: Number(String(ed.montant).replace(/\s/g, '')),
        echeance: ed.echeance || null,
        classes: fraisChoisi.classes || [],
        categorie: fraisChoisi.categorie,
        obligatoire: fraisChoisi.obligatoire,
      })
      setEd(null)
      setOk('✓ Frais modifié. Le reste à payer est mis à jour.')
      setF((y) => ({ ...y, montant: '' }))
      tousFrais.reload()
      situation.reload()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <>
      <form className="card" onSubmit={enregistrer}>
        <b>Enregistrer un paiement reçu au guichet</b>
        <Field label="Élève">
          <ChoixEleve valeur={eleveId} onChange={setEleveId} />
        </Field>
        {situation.data && (
          <p className="muted" style={{ marginBottom: 10 }}>
            Payé {fcfa(situation.data.paye)} · reste {fcfa(situation.data.reste)}
          </p>
        )}
        {eleveId && (
          <>
            <Field label="Frais">
              <select
                className="input"
                value={f.fraisId}
                onChange={(e) => {
                  const fr = dus.find((x) => String(x.id) === e.target.value)
                  setF((y) => ({ ...y, fraisId: e.target.value, montant: fr ? String(fr.reste) : '' }))
                }}
                required
              >
                <option value="">Choisir le frais</option>
                {dus.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nom} (reste {fcfa(x.reste)})
                  </option>
                ))}
              </select>
            </Field>
            {fraisChoisi && !ed && (
              <button type="button" className="lien-discret" style={{ margin: '-4px 0 10px', textAlign: 'left' }} onClick={ouvrirModif}>
                ✏️ Modifier ce frais
              </button>
            )}
            {ed && (
              <div className="card" style={{ marginBottom: 10, background: 'rgba(47,107,255,0.06)' }}>
                <b>Modifier « {fraisChoisi?.nom} »</b>
                <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 8px' }}>
                  Le changement s’applique à tous les élèves concernés par ce frais.
                </p>
                <Field label="Nom">
                  <input className="input" value={ed.nom} onChange={(e) => setEd({ ...ed, nom: e.target.value })} />
                </Field>
                <div className="grid2">
                  <Field label="Montant (FCFA)">
                    <input className="input" inputMode="numeric" value={ed.montant} onChange={(e) => setEd({ ...ed, montant: e.target.value })} />
                  </Field>
                  <Field label="Échéance (facultative)">
                    <input className="input" type="date" value={ed.echeance} onChange={(e) => setEd({ ...ed, echeance: e.target.value })} />
                  </Field>
                </div>
                <div className="actions">
                  <button type="button" className="btn" onClick={enregistrerModif}>
                    Enregistrer
                  </button>
                  <button type="button" className="btn btn-quiet" onClick={() => setEd(null)}>
                    Annuler
                  </button>
                </div>
              </div>
            )}
            <div className="grid2">
              <Field label="Montant (FCFA)">
                <input className="input" inputMode="numeric" value={f.montant} onChange={(e) => setF({ ...f, montant: e.target.value })} required />
              </Field>
              <Field label="Mode">
                <select className="input" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>
                  {Object.entries(MODES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="N° de reçu (facultatif)">
              <input className="input" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />
            </Field>
          </>
        )}
        <Note>{error}</Note>
        <Note kind="ok">{ok}</Note>
        <button className="btn" type="submit" disabled={busy || !eleveId}>
          {busy ? 'Enregistrement…' : 'Enregistrer le paiement'}
        </button>
      </form>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 className="section-title" style={{ flex: 1 }}>
          Paiements reçus {liste.data ? `· ${fcfa((liste.data || []).reduce((s, p) => s + p.montant, 0))}` : ''}
        </h2>
        {liste.data?.length > 0 && (
          <BoutonExcel
            onClick={() =>
              exporterExcel('paiements', [
                {
                  nom: 'Paiements reçus',
                  lignes: liste.data.map((p) => ({
                    Date: new Date(p.created_at).toLocaleDateString('fr-FR'),
                    'Reçu n°': p.numero_recu || '',
                    Nom: p.last_name,
                    'Prénom(s)': p.first_name,
                    Classe: p.classe || '',
                    Frais: p.frais,
                    'Montant (FCFA)': p.montant,
                    Mode: MODES[p.mode] || p.mode,
                    Référence: p.reference || '',
                  })),
                },
              ])
            }
          />
        )}
      </div>
      {liste.data?.length === 0 && <p className="muted">Aucun paiement pour le moment.</p>}
      {liste.data?.length > 0 && (
        <ul className="rows">
          {liste.data.map((p) => (
            <li className="row" key={p.id}>
              <span style={{ fontSize: 22 }}>{p.mode === 'mobile_money' ? '📱' : '💵'}</span>
              <div className="row-main">
                <div className="row-title">
                  {fcfa(p.montant)} · {p.first_name} {p.last_name}
                </div>
                <div className="row-sub">
                  {p.frais} · {p.classe || '—'} · {MODES[p.mode]} · {jour(p.created_at)}
                </div>
              </div>
              <a className="btn btn-quiet" style={{ padding: '8px 12px', fontSize: 14 }} href={`#/recus/${p.id}`}>
                Reçu
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function AConfirmer() {
  return (
    <>
      <p className="muted" style={{ fontSize: 14, margin: '0 2px 10px' }}>
        Les parents paient directement sur vos numéros, puis signalent leur paiement. Vérifiez votre compte Mobile Money avant de confirmer.
      </p>
      <ListeOrdres statut="paye,litige" vide="Aucun paiement à confirmer. 👍" />
      <h2 className="section-title">En attente du paiement des parents</h2>
      <ListeOrdres statut="a_payer" vide="Aucun ordre en cours." />
      <h2 className="section-title">Derniers paiements confirmés</h2>
      <ListeOrdres statut="confirme" vide="Aucun pour le moment." />
      <AConfirmerAncien />
    </>
  )
}

function AConfirmerAncien() {
  const liste = useApi('/api/scolarite/a-confirmer')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)
  async function decider(id, decision) {
    let motif
    if (decision === 'rejeter') motif = window.prompt('Motif (facultatif) :') ?? undefined
    setBusy(id)
    setError('')
    try {
      await api.post(`/api/scolarite/a-confirmer/${id}/${decision}`, motif ? { motif } : {})
      liste.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(null)
  }
  if (!liste.data?.length) return null // anciennes declarations (avant les ordres)
  return (
    <>
      <p className="muted" style={{ marginBottom: 12 }}>
        Paiements Mobile Money déclarés par les parents : vérifiez la transaction sur votre compte, puis confirmez.
      </p>
      <Note>{error}</Note>
      <h2 className="section-title">Anciennes déclarations à confirmer</h2>

      {liste.data?.map((p) => (
        <div className="card" key={p.id}>
          <div className="row-title" style={{ fontSize: 17 }}>
            {fcfa(p.montant)} · {p.first_name} {p.last_name}
          </div>
          <div className="row-sub">
            {p.frais} · {p.classe || '—'} · {jour(p.created_at)}
          </div>
          <p style={{ marginTop: 8, fontSize: 15 }}>
            Transaction : <b>{String(p.reference || '').replace(/^TX-/, '')}</b>
            {p.telephone ? ` · depuis le ${p.telephone}` : ''}
            {p.payeur_prenom ? ` · par ${p.payeur_prenom} ${p.payeur_nom}` : ''}
          </p>
          <div className="actions">
            <button type="button" className="btn btn-ok" disabled={busy === p.id} onClick={() => decider(p.id, 'confirmer')}>
              ✓ Confirmer
            </button>
            <button type="button" className="btn btn-quiet btn-danger" disabled={busy === p.id} onClick={() => decider(p.id, 'rejeter')}>
              Non reçu
            </button>
          </div>
        </div>
      ))}
    </>
  )
}

function Recouvrement() {
  const d = useApi('/api/scolarite/recouvrement')
  const [classe, setClasse] = useState(null)
  const eleves = useApi(classe ? `/api/scolarite/recouvrement?classe=${encodeURIComponent(classe)}` : null)
  const [info, setInfo] = useState('')
  const [error, setError] = useState('')
  async function relancer(c) {
    setInfo('')
    setError('')
    if (!window.confirm(c ? `Envoyer un rappel aux parents des élèves en retard de ${c} ?` : 'Envoyer un rappel aux parents de tous les élèves en retard ?')) return
    try {
      const r = await api.post('/api/scolarite/relancer', c ? { classe: c } : {})
      setInfo(`Rappel envoyé à ${r.data.parents} parent(s).`)
      d.reload()
    } catch (err) {
      setError(err.message)
    }
  }
  if (!d.data) return <p className="muted">Calcul…</p>
  const t = d.data.totaux
  const taux = t.attendu ? Math.round((t.encaisse / t.attendu) * 100) : 0
  return (
    <>
      <div className="kpis">
        <div className="kpi">
          <b>{taux} %</b>
          <span>recouvré</span>
          <small>
            {fcfa(t.encaisse)} sur {fcfa(t.attendu)}
          </small>
        </div>
        <div className="kpi">
          <b style={{ color: t.reste ? 'var(--danger)' : undefined }}>{fcfa(t.reste)}</b>
          <span>reste à encaisser</span>
          <small>{t.enRetard} élève(s) en retard</small>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
        <BoutonExcel
          texte="Exporter le recouvrement"
          onClick={async () => {
            const tous = (await api.get('/api/scolarite/recouvrement?tous=1')).data
            await exporterExcel('recouvrement', [
              {
                nom: 'Par classe',
                lignes: d.data.classes.map((c) => ({
                  Classe: c.classe,
                  Effectif: c.effectif,
                  'Attendu (FCFA)': Number(c.attendu),
                  'Encaissé (FCFA)': Number(c.encaisse),
                  'Reste (FCFA)': Number(c.reste),
                  'Taux (%)': Number(c.attendu) ? Math.round((Number(c.encaisse) / Number(c.attendu)) * 100) : 0,
                  'Élèves en retard': c.en_retard,
                })),
              },
              {
                nom: 'Élèves',
                lignes: tous.map((e) => ({
                  Classe: e.classe,
                  Nom: e.last_name,
                  'Prénom(s)': e.first_name,
                  'Dû (FCFA)': e.du,
                  'Payé (FCFA)': e.paye,
                  'Reste (FCFA)': e.reste,
                  'En retard': e.en_retard ? 'Oui' : '',
                })),
              },
            ])
          }}
        />
      </div>
      <p className="muted" style={{ fontSize: 13, margin: '8px 2px' }}>
        Frais obligatoires uniquement. {d.data.derniereRelance ? `Dernier rappel : ${jour(d.data.derniereRelance)}.` : ''}
      </p>
      <Note kind="ok">{info}</Note>
      <Note>{error}</Note>
      {t.enRetard > 0 && (
        <button type="button" className="btn btn-block" style={{ marginBottom: 12 }} onClick={() => relancer(null)}>
          🔔 Rappeler tous les parents en retard
        </button>
      )}
      {d.data.classes.length === 0 && <p className="muted">Aucun élève ou aucun frais obligatoire pour le moment.</p>}
      <ul className="rows">
        {d.data.classes.map((c) => {
          const tx = Number(c.attendu) ? Math.round((Number(c.encaisse) / Number(c.attendu)) * 100) : 0
          return (
            <li key={c.classe} style={{ padding: '12px 14px', borderTop: '1px solid var(--line)' }}>
              <button type="button" onClick={() => setClasse(classe === c.classe ? null : c.classe)} style={{ display: 'flex', width: '100%', gap: 10, alignItems: 'center', border: 0, background: 'none', padding: 0, font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                <div className="row-main">
                  <div className="row-title">{c.classe}</div>
                  <div className="row-sub">
                    {c.effectif} élèves · reste {fcfa(c.reste)}
                    {c.en_retard ? ` · ${c.en_retard} en retard` : ''}
                  </div>
                </div>
                <b style={{ color: tx >= 80 ? 'var(--ok)' : tx >= 50 ? '#a35d00' : 'var(--danger)' }}>{tx} %</b>
              </button>
              {classe === c.classe && (
                <div style={{ marginTop: 10 }}>
                  {c.en_retard > 0 && (
                    <button type="button" className="btn btn-quiet" style={{ padding: '8px 12px', fontSize: 14, marginBottom: 8 }} onClick={() => relancer(c.classe)}>
                      🔔 Rappeler les parents de {c.classe}
                    </button>
                  )}
                  {!eleves.data && <p className="muted">Chargement…</p>}
                  {eleves.data
                    ?.filter((e) => e.reste > 0)
                    .map((e) => (
                      <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '5px 0', borderTop: '1px dashed var(--line)' }}>
                        <a href={`#/eleves/${e.id}`}>
                          {e.last_name} {e.first_name}
                        </a>
                        <span style={{ color: e.en_retard ? 'var(--danger)' : 'var(--muted)' }}>
                          {fcfa(e.reste)}
                          {e.en_retard ? ' · en retard' : ''}
                        </span>
                      </div>
                    ))}
                  {eleves.data && eleves.data.every((e) => e.reste === 0) && <p className="muted">Tous les élèves sont à jour. 👏</p>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

function Reglages() {
  const r = useApi('/api/scolarite/reglages')
  const [f, setF] = useState(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const v = f || {
    cle: '',
    orange: r.data?.orange || '',
    mtn: r.data?.mtn || '',
    instructions: r.data?.instructions || '',
    telephone: r.data?.telephone || '',
    fraisServiceParent: r.data?.fraisServiceParent || false,
    fraisServicePct: String(r.data?.fraisServicePct ?? 0),
  }
  const maj = (k) => (e) => setF({ ...v, [k]: e.target.value })
  async function enregistrer(e) {
    e.preventDefault()
    setError('')
    setOk('')
    setBusy(true)
    try {
      const corps = { orange: v.orange, mtn: v.mtn, instructions: v.instructions, telephone: v.telephone, fraisServiceParent: v.fraisServiceParent, fraisServicePct: v.fraisServicePct }
      if (v.cle) corps.cle = v.cle
      await api.put('/api/scolarite/reglages', corps)
      setOk('Réglages enregistrés.')
      setF(null)
      r.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }
  return (
    <form className="card" onSubmit={enregistrer}>
      <b>Où les parents paient</b>
      <p className="muted" style={{ fontSize: 14, margin: '4px 0 12px' }}>
        Les parents paient directement sur ces numéros, puis signalent leur paiement : vous confirmez la réception dans « À confirmer ».
      </p>
      <div className="grid2">
        <Field label="Orange Money (numéro)">
          <input className="input" type="tel" placeholder="6 9X XX XX XX" value={v.orange} onChange={maj('orange')} />
        </Field>
        <Field label="MTN MoMo (numéro)">
          <input className="input" type="tel" placeholder="6 7X XX XX XX" value={v.mtn} onChange={maj('mtn')} />
        </Field>
      </div>
      <Field label="Téléphone à appeler pour les paiements (affiché aux parents)">
        <input className="input" type="tel" placeholder="6 XX XX XX XX" value={v.telephone} onChange={maj('telephone')} />
      </Field>
      <Field label="Nom du titulaire et consignes (affichés aux parents)">
        <textarea className="input" placeholder="ex. Compte au nom de LYCÉE DE YINGUI. Indiquez le nom de l’élève en motif." value={v.instructions} onChange={maj('instructions')} />
      </Field>
      <Note>{error}</Note>
      <Note kind="ok">{ok}</Note>
      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </form>
  )
}

export default function Scolarite() {
  const { user } = useAuth()
  const etablissement = user.role === 'principal'
  const [onglet, setOnglet] = useState(etablissement ? 'comptabilite' : 'paiements')
  return (
    <>
      <h1 className="page-title">Scolarité</h1>
      {etablissement ? (
        <>
          <p className="lede">Fixez vos frais, suivez les paiements et enregistrez ceux reçus au guichet.</p>
          <div className="chips">
            <button type="button" className="chip" aria-pressed={onglet === 'comptabilite'} onClick={() => setOnglet('comptabilite')}>
              📈 Comptabilité
            </button>
            <button type="button" className="chip" aria-pressed={onglet === 'paiements'} onClick={() => setOnglet('paiements')}>
              💳 Paiements
            </button>
            <button type="button" className="chip" aria-pressed={onglet === 'confirmer'} onClick={() => setOnglet('confirmer')}>
              ⏳ À confirmer
            </button>
            <button type="button" className="chip" aria-pressed={onglet === 'recouvrement'} onClick={() => setOnglet('recouvrement')}>
              📊 Recouvrement
            </button>
            <button type="button" className="chip" aria-pressed={onglet === 'frais'} onClick={() => setOnglet('frais')}>
              📋 Frais
            </button>
            <button type="button" className="chip" aria-pressed={onglet === 'reglages'} onClick={() => setOnglet('reglages')}>
              ⚙️ Réglages
            </button>
          </div>
          {onglet === 'comptabilite' && <Comptabilite />}
          {onglet === 'frais' && <Frais />}
          {onglet === 'recouvrement' && <Recouvrement />}
          {onglet === 'paiements' && <Paiements />}
          {onglet === 'confirmer' && <AConfirmer />}
          {onglet === 'reglages' && <Reglages />}
        </>
      ) : (
        <>
          <p className="lede">Ce qui est payé, ce qui reste, et le paiement par Mobile Money.</p>
          <Situation />
        </>
      )}
    </>
  )
}
