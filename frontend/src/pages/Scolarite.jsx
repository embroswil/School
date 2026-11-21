import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'
import { ListeOrdres } from './OrdrePaiement.jsx'
import StatutScolarite from './StatutScolarite.jsx'
import { IcCalendrier, IcChevron, IcCrayon, IcImport, IcPlus, IcPoubelle } from '../icones.jsx'
import { preparerDocument } from '../lecture-fichier.js'
import Comptabilite from './Comptabilite.jsx'
import { envoyer } from './Documents.jsx'
import { useDepotPage } from '../depot.jsx'
import { textePdf } from '../documents-ecole.js'
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

  const auj = new Date().toISOString().slice(0, 10)
  const ouvrir = (s, f) => {
    if (!(s.moyens?.enLigne || s.moyens?.orange || s.moyens?.mtn)) return
    setPaiement({ eleve: s.eleve, frais: f, moyens: s.moyens, moyen: s.moyens.enLigne ? 'enligne' : s.moyens.orange ? 'orange_money' : 'mtn_momo' })
    setMontant(String(f.reste))
    setError('')
  }

  return (
    <div className="sco-page">
      <Note kind="ok">{info}</Note>
      {!paiement && <Note>{error}</Note>}
      <ListeOrdres statut="a_payer,paye,litige" />
      {situation.loading && !situation.data && <p className="muted">Chargement…</p>}
      {situation.data?.length === 0 && (
        <div className="vide">
          <b>Aucun enfant relié</b>
          <small>Ajoutez votre enfant pour voir sa scolarité et la payer.</small>
          <a href="#/trouver-eleve">Ajouter mon enfant</a>
        </div>
      )}
      {situation.data?.map((s) => {
        const total = s.frais.reduce((n, f) => n + Number(f.montant || 0), 0)
        const pct = total ? Math.min(100, Math.round((Number(s.paye || 0) / total) * 100)) : 0
        const enLigne = s.moyens?.enLigne || s.moyens?.orange || s.moyens?.mtn
        const aPayer = s.frais.filter((f) => f.reste > 0)
        return (
          <section key={s.eleve.id} className="sco-enfant">
            {situation.data.length > 1 && (
              <p className="sco-qui">
                <b data-brut>{`${s.eleve.prenom} ${s.eleve.nom}`}</b>
                <span>{s.eleve.classe || ''}</span>
              </p>
            )}
            <div className="sco-solde">
              <div className="sco-solde-haut">
                <span className="sco-anneau" style={{ '--p': pct }} aria-label={`${pct} % payé`}>
                  <svg viewBox="0 0 36 36" aria-hidden="true">
                    <circle cx="18" cy="18" r="15.5" className="fond" />
                    <circle cx="18" cy="18" r="15.5" className="plein" strokeDasharray={`${(pct * 97.4) / 100} 97.4`} />
                  </svg>
                  <b>{`${pct} %`}</b>
                </span>
                <span className="sco-solde-texte">
                  <small>Reste à payer</small>
                  <b>{fcfa(s.reste)}</b>
                  {s.reste === 0 ? <em className="sco-etat ok">À jour</em> : s.enRetard ? <em className="sco-etat retard">En retard</em> : <em className="sco-etat">{`${fcfa(s.paye)} payés`}</em>}
                </span>
              </div>
              {aPayer.length > 0 && enLigne && (
                <button type="button" className="btn btn-block sco-payer" onClick={() => ouvrir(s, aPayer[0])}>
                  Payer
                </button>
              )}
              {aPayer.length > 0 && !enLigne && <p className="sco-aide">Paiement au guichet de l’établissement.</p>}
            </div>

            {s.frais.length === 0 && <p className="muted">L’établissement n’a pas encore publié ses frais.</p>}
            {s.frais.length > 0 && (
              <div className="sco-tuiles">
                {s.frais.map((f) => {
                  const retard = f.reste > 0 && f.obligatoire && f.echeance && String(f.echeance).slice(0, 10) < auj
                  const payable = f.reste > 0 && enLigne
                  const Tag = payable ? 'button' : 'div'
                  return (
                    <Tag key={f.id} type={payable ? 'button' : undefined} className={`sco-tuile ${f.reste === 0 ? 'paye' : retard ? 'retard' : ''}`} onClick={payable ? () => ouvrir(s, f) : undefined}>
                      <b className="sco-tuile-nom" data-brut>{f.nom}</b>
                      <span className="sco-tuile-montant">{f.reste === 0 ? 'Payé' : fcfa(f.reste)}</span>
                      <small>{f.reste === 0 ? fcfa(f.montant) : retard ? 'En retard' : f.echeance ? `Avant le ${jour(f.echeance).replace(/ \d{4}$/, '')}` : !f.obligatoire ? 'Facultatif' : 'À payer'}</small>
                    </Tag>
                  )
                })}
              </div>
            )}

            {s.paiements.length > 0 && (
              <>
                <h3 className="sco-titre">Reçus</h3>
                <div className="sco-recus">
                  {s.paiements.map((p) => (
                    <a key={p.id} className="sco-recu" href={`#/recus/${p.id}`}>
                      <b>{fcfa(p.montant)}</b>
                      <small data-brut>{p.frais}</small>
                      <small>{jour(p.created_at)}</small>
                    </a>
                  ))}
                  <a className="sco-recu releve" href={`#/releve/${s.eleve.id}`}>
                    <b>Relevé</b>
                    <small>de l’année</small>
                  </a>
                </div>
              </>
            )}
          </section>
        )
      })}

      {paiement && (
        <div className="voile" onClick={() => setPaiement(null)}>
          <form className="feuille sco-feuille" onSubmit={payer} onClick={(e) => e.stopPropagation()}>
            <div className="feuille-poignee" />
            <p className="feuille-titre">Payer</p>
            {situation.data?.length > 1 && <p className="sco-feuille-qui" data-brut>{`${paiement.eleve.prenom} ${paiement.eleve.nom}`}</p>}
            {situation.data?.flatMap((x) => (x.eleve.id === paiement.eleve.id ? x.frais.filter((f) => f.reste > 0) : [])).length === 1 && (
              <p className="sco-feuille-frais" data-brut>{paiement.frais.nom}</p>
            )}
            {situation.data?.flatMap((x) => (x.eleve.id === paiement.eleve.id ? x.frais.filter((f) => f.reste > 0) : [])).length > 1 && (
              <select
                className="input"
                aria-label="Frais"
                value={paiement.frais.id}
                onChange={(e) => {
                  const f = situation.data.find((x) => x.eleve.id === paiement.eleve.id).frais.find((y) => String(y.id) === e.target.value)
                  setPaiement({ ...paiement, frais: f })
                  setMontant(String(f.reste))
                }}
              >
                {situation.data
                  .find((x) => x.eleve.id === paiement.eleve.id)
                  .frais.filter((f) => f.reste > 0)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {`${f.nom} · ${fcfa(f.reste)}`}
                    </option>
                  ))}
              </select>
            )}
            <div className="sco-moyens" role="radiogroup" aria-label="Moyen de paiement">
              {paiement.moyens.enLigne && (
                <button type="button" role="radio" aria-checked={paiement.moyen === 'enligne'} onClick={() => setPaiement({ ...paiement, moyen: 'enligne' })}>
                  En ligne
                </button>
              )}
              {paiement.moyens.orange && (
                <button type="button" role="radio" aria-checked={paiement.moyen === 'orange_money'} onClick={() => setPaiement({ ...paiement, moyen: 'orange_money' })}>
                  <img className="moyen-logo petit" src="/paiement/orange-money.png" alt="" /> Orange Money
                </button>
              )}
              {paiement.moyens.mtn && (
                <button type="button" role="radio" aria-checked={paiement.moyen === 'mtn_momo'} onClick={() => setPaiement({ ...paiement, moyen: 'mtn_momo' })}>
                  <img className="moyen-logo petit" src="/paiement/mtn-momo.png" alt="" /> MTN MoMo
                </button>
              )}
            </div>
            <label className="sco-montant-champ">
              <span>Montant</span>
              <input className="input" inputMode="numeric" value={montant} onChange={(e) => setMontant(e.target.value)} required />
              <small>FCFA</small>
            </label>
            <Note>{error}</Note>
            <button className="btn btn-block" type="submit" disabled={busy}>
              {busy ? 'Un instant…' : paiement.moyen === 'enligne' ? 'Payer maintenant' : 'Continuer'}
            </button>
          </form>
        </div>
      )}
    </div>
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

  // Documents des frais (un ou plusieurs) : Sùkûl les lit, compare avec les frais existants
  async function choisirDocument(e) {
    const fichiers = [...(e.target.files || [])]
    e.target.value = ''
    if (!fichiers.length) return
    setError('')
    setOk('')
    setLus(null)
    setAjout(false)
    const tous = []
    const rates = []
    for (const [n, fichier] of fichiers.entries()) {
      const pre = fichiers.length > 1 ? `Fichier ${n + 1} / ${fichiers.length} · ` : ''
      try {
        tous.push(...(await lireUnDocument(fichier, pre)))
      } catch (err) {
        if (fichiers.length === 1) setError(err.message)
        else rates.push(fichier.name)
      }
    }
    if (tous.length) setLus(tous.map((x, i) => ({ ...x, cle: i })))
    if (rates.length) setError(`${rates.length} fichier(s) non lu(s) : ${rates.join(', ')}`)
    frais.reload()
    setLecture('')
  }
  async function lireUnDocument(fichier, pre) {
    setLecture(`${pre}Envoi du document…`)
    let corps
    let texte
    if (/\.(xlsx|xls|csv)$/i.test(fichier.name)) corps = { texte: await texteDuTableur(fichier) }
    else if (/\.docx$/i.test(fichier.name)) corps = { texte: (await preparerDocument([fichier])).texte }
    else if (/\.pdf$/i.test(fichier.name) && (texte = await textePdf(fichier))) corps = { texte }
    else {
      const env = await envoyer(fichier)
      corps = { url: env.url, mime: env.mime }
    }
    setLecture(`${pre}Lecture du document… (jusqu’à une minute)`)
    const r = (await api.post('/api/scolarite/frais/lire', corps)).data
    // Mise a jour automatique : nouveaux frais ajoutes, frais modifies mis a jour,
    // frais identiques laisses tels quels. Aucun frais existant n'est supprime.
    const aEnvoyer = r.filter((x) => x.statut !== 'identique')
    if (aEnvoyer.length) {
      setLecture(`${pre}Mise à jour des frais…`)
      await api.post('/api/scolarite/frais/appliquer', {
        frais: aEnvoyer.map(({ id, nom, montant, echeance, classes, categorie, obligatoire }) => ({ id, nom, montant, echeance, classes, categorie, obligatoire })),
      })
    }
    return r
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
      <input ref={champ} type="file" hidden multiple accept=".pdf,.xlsx,.xls,.csv,.docx,image/*" onChange={choisirDocument} />
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
                <span className={`etiquette ${x.statut === 'identique' ? 'neutre' : 'ok'}`}>{(STATUT_LU[x.statut] || STATUT_LU.identique)[0]}</span>
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
        <div className="frais-grille">
          {frais.data.map((x) => {
            const passe = x.echeance && new Date(x.echeance) < new Date()
            return (
              <article key={x.id} className="frais-carte">
                <div className="frais-ligne">
                  <h3>{x.nom}</h3>
                  <b className="frais-montant">{fcfa(x.montant)}</b>
                </div>
                <div className="frais-ligne">
                  <div className="frais-infos">
                    <span className="frais-badge">{CATEGORIES[x.categorie] || 'Scolarité'}</span>
                    {!x.obligatoire && <span className="frais-badge discret">Facultatif</span>}
                    <span>{x.classes?.length ? x.classes.join(', ') : 'Toutes les classes'}</span>
                    <span className={passe ? 'passe' : ''}>
                      <IcCalendrier size={13} />
                      {x.echeance ? jour(x.echeance) : 'Sans échéance'}
                    </span>
                  </div>
                  <span className="frais-outils">
                    <button type="button" aria-label={`Modifier ${x.nom}`} title="Modifier" onClick={() => modifier(x)}>
                      <IcCrayon size={15} />
                    </button>
                    <button type="button" className="danger" aria-label={`Supprimer ${x.nom}`} title="Supprimer" onClick={() => supprimer(x.id)}>
                      <IcPoubelle size={15} />
                    </button>
                  </span>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <p className="niveau-titre" style={{ marginTop: 22 }}>Où les parents paient</p>
      <Reglages />
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
      <label className="moyen-champ">
        <img className="moyen-logo" src="/paiement/orange-money.png" alt="Orange Money" />
        <span className="moyen-texte">
          <span>Orange Money</span>
          <input className="input" type="tel" inputMode="tel" placeholder="6 9X XX XX XX" value={v.orange} onChange={maj('orange')} />
        </span>
      </label>
      <label className="moyen-champ">
        <img className="moyen-logo" src="/paiement/mtn-momo.png" alt="MTN Mobile Money" />
        <span className="moyen-texte">
          <span>MTN Mobile Money</span>
          <input className="input" type="tel" inputMode="tel" placeholder="6 7X XX XX XX" value={v.mtn} onChange={maj('mtn')} />
        </span>
      </label>
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
  // Onglet demande dans l'adresse (#/scolarite?onglet=frais). L'encaissement a sa propre page (#/encaisser).
  const [onglet, setOnglet] = useState(() => {
    const o = new URLSearchParams(window.location.hash.split('?')[1] || '').get('onglet')
    return ['suivi', 'confirmer', 'frais'].includes(o) ? o : 'suivi'
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
      {onglet === 'confirmer' && <AConfirmer />}
      {onglet === 'frais' && <Frais />}
    </>
  )
}
