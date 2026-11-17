import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'
import { ListeOrdres } from './OrdrePaiement.jsx'
import StatutScolarite from './StatutScolarite.jsx'
import { IcImport, IcPlus } from '../icones.jsx'
import { preparerDocument } from '../lecture-fichier.js'
import Comptabilite from './Comptabilite.jsx'
import { envoyer } from './Documents.jsx'
import { useDepotPage } from '../depot.jsx'
import ChoixEleve from '../ChoixEleve.jsx'
import CompteurIA from '../CompteurIA.jsx'

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
          setInfo('Paiement confirmé. Votre reçu est disponible dans « Paiements effectués ».')
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
        <div className="vide">
          <b>Aucun enfant relié</b>
          <small>Ajoutez votre enfant depuis l’accueil pour voir sa scolarité et la payer.</small>
          <a href="#/trouver-eleve">Ajouter mon enfant</a>
        </div>
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
                    <span className="etiquette ok">Payé</span>
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
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 10px' }}>
            {paiement.moyen === 'enligne' ? 'Vous validez sur votre téléphone. Le reçu est émis automatiquement.' : 'Vous payez directement l’établissement. Le numéro et le motif s’affichent à l’étape suivante.'}
          </p>
          <div className="chips">
            {paiement.moyens.enLigne && (
              <button type="button" className="chip" aria-pressed={paiement.moyen === 'enligne'} onClick={() => setPaiement({ ...paiement, moyen: 'enligne' })}>
                En ligne
              </button>
            )}
            {paiement.moyens.orange && (
              <button type="button" className="chip" aria-pressed={paiement.moyen === 'orange_money'} onClick={() => setPaiement({ ...paiement, moyen: 'orange_money' })}>
                Orange Money
              </button>
            )}
            {paiement.moyens.mtn && (
              <button type="button" className="chip" aria-pressed={paiement.moyen === 'mtn_momo'} onClick={() => setPaiement({ ...paiement, moyen: 'mtn_momo' })}>
                MTN MoMo
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
const STATUT_LU = { nouveau: ['Ajouté'], modifie: ['Mis à jour'], identique: ['Inchangé'] }

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
  const [ajout, setAjout] = useState(false)

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
      setOk(edition ? 'Frais modifié.' : 'Frais ajouté.')
      setF({ ...FRAIS_VIDE, categorie: f.categorie })
      setAjout(false)
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

  // Document contenant tous les frais : Sùkûl le lit, compare avec les frais existants
  async function choisirDocument(e) {
    const fichier = [...(e.target.files || [])][0]
    e.target.value = ''
    if (!fichier) return
    setError('')
    setOk('')
    setLus(null)
    try {
      setLecture('Envoi du document…')
      setAjout(false)
      let corps
      if (/\.(xlsx|xls|csv)$/i.test(fichier.name)) corps = { texte: await texteDuTableur(fichier) }
      else if (/\.docx$/i.test(fichier.name)) corps = { texte: (await preparerDocument([fichier])).texte }
      else {
        const env = await envoyer(fichier)
        corps = { url: env.url, mime: env.mime }
      }
      setLecture('Lecture du document… (jusqu’à une minute)')
      const r = (await api.post('/api/scolarite/frais/lire', corps)).data
      // Mise a jour automatique : nouveaux frais ajoutes, frais modifies mis a jour,
      // frais identiques laisses tels quels. Aucun frais existant n'est supprime.
      const aEnvoyer = r.filter((x) => x.statut !== 'identique')
      if (aEnvoyer.length) {
        setLecture('Mise à jour des frais…')
        await api.post('/api/scolarite/frais/appliquer', {
          frais: aEnvoyer.map(({ id, nom, montant, echeance, classes, categorie, obligatoire }) => ({ id, nom, montant, echeance, classes, categorie, obligatoire })),
        })
      }
      setLus(r.map((x, i) => ({ ...x, cle: i })))
      frais.reload()
    } catch (err) {
      setError(err.message)
    }
    setLecture('')
  }
  const zoneDepot = useDepotPage(choisirDocument, { texte: 'Déposez le document des frais', detail: 'PDF, Excel, Word ou photo' })


  const formulaireOuvert = edition || ajout
  return (
    <>
      {zoneDepot}
      <div className="barre-actions">
        <button type="button" className="btn bouton-icone" onClick={() => { setF(FRAIS_VIDE); setAjout(true); setOk('') }}>
          <IcPlus size={18} /> Ajouter
        </button>
        <button type="button" className="btn btn-quiet bouton-icone" onClick={() => champ.current?.click()} disabled={Boolean(lecture)}>
          <IcImport size={18} /> {lecture ? 'Lecture…' : 'Importer'}
        </button>
      </div>
      <input ref={champ} type="file" hidden accept=".pdf,.xlsx,.xls,.csv,.docx,image/*" onChange={choisirDocument} />
      <CompteurIA discret />
      {lecture && <p className="muted" style={{ fontSize: 13 }}>{lecture}</p>}
      <Note kind="ok">{ok}</Note>
      <Note>{error}</Note>

      {lus && (
        <div className="resultat-import" style={{ marginTop: 0, marginBottom: 14 }}>
          <b>Frais mis à jour depuis le document</b>
          <p>
            {lus.filter((x) => x.statut === 'nouveau').length} ajouté(s) · {lus.filter((x) => x.statut === 'modifie').length} mis à jour ·{' '}
            {lus.filter((x) => x.statut === 'identique').length} inchangé(s)
          </p>
          <ul className="liste-simple" style={{ marginBottom: 10 }}>
            {lus.map((x) => (
              <li key={x.cle}>
                <span className="ls-texte">
                  <b>{x.nom}</b>
                  <small>
                    {fcfa(x.montant)} · {x.classes?.length ? x.classes.join(', ') : 'toutes les classes'}
                    {x.changements?.length ? ` · ${x.changements.join(' ; ')}` : ''}
                  </small>
                </span>
                <span className={`etiquette ${x.statut === 'identique' ? 'neutre' : 'ok'}`}>{STATUT_LU[x.statut][0]}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="lien-action" onClick={() => setLus(null)}>
            Fermer
          </button>
        </div>
      )}

      {formulaireOuvert && (
        <form className="card" onSubmit={enregistrer} style={{ marginBottom: 14 }}>
          <b>{edition ? `Modifier le frais « ${f.nom} »` : 'Nouveau frais'}</b>
          <Field label="Nom du frais">
            <input className="input" placeholder="ex. Pension – 1re tranche" value={f.nom} onChange={maj('nom')} required />
          </Field>
          <div className="grid2">
            <Field label="Montant (FCFA)">
              <input className="input" inputMode="numeric" placeholder="ex. 50000" value={f.montant} onChange={maj('montant')} required />
            </Field>
            <Field label="Échéance (facultative)">
              <input className="input" type="date" value={f.echeance} onChange={maj('echeance')} />
            </Field>
          </div>
          <Field label="Type de frais">
            <select className="input" value={f.categorie} onChange={maj('categorie')}>
              {Object.entries(CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Classes concernées (vide = toutes)">
            <input className="input" placeholder="ex. 6e A, 6e B" value={f.classes} onChange={maj('classes')} />
          </Field>
          <label className="check">
            <input type="checkbox" checked={!f.obligatoire} onChange={(e) => setF((x) => ({ ...x, obligatoire: !e.target.checked }))} />
            <span>Facultatif (cantine, transport, sortie…)</span>
          </label>
          <div className="actions">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => { setF(FRAIS_VIDE); setAjout(false) }}>
              Annuler
            </button>
          </div>
        </form>
      )}

      {frais.data?.length === 0 && !formulaireOuvert && (
        <div className="vide">
          <b>Aucun frais pour l’instant</b>
          <small>Ajoutez vos frais un par un, ou importez le document de vos frais (PDF, Excel, Word ou photo).</small>
        </div>
      )}
      {frais.data?.length > 0 && (
        <ul className="liste-simple">
          {frais.data.map((x) => (
            <li key={x.id}>
              <span className="ls-texte">
                <b>{x.nom}</b>
                <small>
                  {fcfa(x.montant)} · {x.classes?.length ? x.classes.join(', ') : 'toutes les classes'} · {x.echeance ? `avant le ${jour(x.echeance)}` : 'sans échéance'}
                  {x.obligatoire ? '' : ' · facultatif'}
                </small>
                <span className="ls-actions">
                  <button type="button" className="lien-action" onClick={() => modifier(x)}>
                    Modifier
                  </button>
                  <button type="button" className="lien-action discret" onClick={() => supprimer(x.id)}>
                    Supprimer
                  </button>
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="niveau-titre" style={{ marginTop: 22 }}>Où les parents paient</p>
      <Reglages />
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
      setOk('Frais modifié. Le reste à payer est mis à jour.')
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
                Modifier ce frais
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

      <p className="niveau-titre" style={{ marginTop: 22 }}>
        Derniers paiements reçus
      </p>
      {liste.data?.length === 0 && <p className="muted">Aucun paiement pour le moment.</p>}
      {liste.data?.length > 0 && (
        <ul className="liste-simple">
          {liste.data.slice(0, 30).map((p) => (
            <li key={p.id}>
              <span className="ls-texte">
                <b data-brut>
                  {p.first_name} {p.last_name}
                </b>
                <small>
                  {p.frais} · {p.classe || '—'} · {MODES[p.mode]} · {jour(p.created_at)}
                </small>
              </span>
              <span className="ls-montant">
                <b>{fcfa(p.montant)}</b>
                <a className="lien-action" href={`#/recus/${p.id}`}>
                  Reçu
                </a>
              </span>
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
      <p className="muted" style={{ fontSize: 13, margin: '0 2px 10px' }}>
        Vérifiez la réception sur votre compte Mobile Money avant de confirmer.
      </p>
      <ListeOrdres statut="paye,litige" vide="Aucun paiement à confirmer." />
      <p className="niveau-titre" style={{ marginTop: 22 }}>
        En attente du paiement des parents
      </p>
      <ListeOrdres statut="a_payer" vide="Aucun." />
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
      <Note>{error}</Note>
      <p className="niveau-titre" style={{ marginTop: 22 }}>
        Anciennes déclarations à confirmer
      </p>

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
              Confirmer
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
      <Field label="Orange Money">
        <input className="input" type="tel" inputMode="tel" placeholder="6 9X XX XX XX" value={v.orange} onChange={maj('orange')} />
      </Field>
      <Field label="MTN MoMo">
        <input className="input" type="tel" inputMode="tel" placeholder="6 7X XX XX XX" value={v.mtn} onChange={maj('mtn')} />
      </Field>
      <Field label="Téléphone pour les questions de paiement">
        <input className="input" type="tel" placeholder="6 XX XX XX XX" value={v.telephone} onChange={maj('telephone')} />
      </Field>
      <Field label="Titulaire du compte et consignes aux parents">
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
  // Onglet demande dans l'adresse (#/scolarite?onglet=encaisser), par ex. depuis le bouton « + » ou l'accueil
  const [onglet, setOnglet] = useState(() => {
    const o = new URLSearchParams(window.location.hash.split('?')[1] || '').get('onglet')
    return ['suivi', 'encaisser', 'confirmer', 'frais'].includes(o) ? o : 'suivi'
  })
  const aConfirmer = useApi(etablissement ? '/api/scolarite/ordres?statut=paye,litige' : null)
  const nb = aConfirmer.data?.length || 0
  if (!etablissement)
    return (
      <>
        <h1 className="page-title">Scolarité</h1>
        <Situation />
      </>
    )
  return (
    <>
      <h1 className="page-title">Scolarité</h1>
      <div className="segments" role="tablist">
        {[
          ['suivi', 'Suivi'],
          ['encaisser', 'Encaisser'],
          ['confirmer', 'À confirmer'],
          ['frais', 'Frais'],
        ].map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={onglet === k} onClick={() => setOnglet(k)}>
            {t}
            {k === 'confirmer' && nb > 0 && <span className="segment-nb">{nb}</span>}
          </button>
        ))}
      </div>
      {onglet === 'suivi' && <Comptabilite />}
      {onglet === 'encaisser' && <Paiements />}
      {onglet === 'confirmer' && <AConfirmer />}
      {onglet === 'frais' && <Frais />}
    </>
  )
}
