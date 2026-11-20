import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { Note, annoncer } from '../ui.jsx'
import { IcImport } from '../icones.jsx'
import { ROLES, analyser, fichiersDuChoix, lancerInstallation, resumeRole } from '../dossier.js'

const ORDRE = Object.keys(ROLES)
const iPhone = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)

// Fichiers d'un dossier glisse sur la page (ordinateur)
async function fichiersGlisses(dt) {
  const entrees = [...(dt.items || [])].map((i) => i.webkitGetAsEntry?.()).filter(Boolean)
  if (!entrees.length) return [...(dt.files || [])]
  const res = []
  const lireDossier = (d) =>
    new Promise((ok) => {
      const lecteur = d.createReader()
      const tout = []
      const suite = () =>
        lecteur.readEntries((l) => {
          if (!l.length) return ok(tout)
          tout.push(...l)
          suite()
        }, () => ok(tout))
      suite()
    })
  const parcourir = async (e) => {
    if (e.isFile) {
      const f = await new Promise((ok, ko) => e.file(ok, ko))
      res.push(Object.assign(f, { chemin: e.fullPath.replace(/^\//, '') }))
    } else if (e.isDirectory) for (const x of await lireDossier(e)) await parcourir(x)
  }
  for (const e of entrees) await parcourir(e)
  return res
}

// Suivi d'une installation faite par le serveur (l'application peut etre fermee entre-temps)
function SuiviTravail({ id, onNouveau }) {
  const [t, setT] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let fini = false
    let minuteur = null
    const lire = async () => {
      try {
        const r = (await api.get(`/api/travaux/${id}`)).data
        if (fini) return
        setT(r)
        if (r.statut === 'en_cours') minuteur = setTimeout(lire, 3000)
        else if (r.statut === 'termine') api.post(`/api/travaux/${id}/vu`).catch(() => {})
      } catch (err) {
        if (!fini) setError(err.message)
      }
    }
    lire()
    return () => {
      fini = true
      clearTimeout(minuteur)
    }
  }, [id])
  if (error) return <Note>{error}</Note>
  if (!t) return <p className="muted">Chargement…</p>
  const enCours = t.statut === 'en_cours'
  const pct = t.total ? Math.round((t.traites / t.total) * 100) : 0
  const roles = ORDRE.filter((r) => t.roles[r])
  const actuel = roles.find((r) => t.roles[r].faits + t.roles[r].erreurs < t.roles[r].total)
  async function annuler() {
    if (!window.confirm('Arrêter l’installation ? Ce qui est déjà installé est conservé.')) return
    await api.post(`/api/travaux/${id}/annuler`).catch(() => {})
    setT((x) => ({ ...x, statut: 'annule' }))
  }
  return (
    <>
      <div className="page-tete">
        <div>
          <h1 className="page-title">{enCours ? 'Installation en cours' : t.statut === 'annule' ? 'Installation arrêtée' : 'Dossier installé'}</h1>
          <p className="muted">{enCours ? `${pct} % · ${t.traites} / ${t.total} étapes` : `${t.total} étapes`}</p>
        </div>
      </div>
      {enCours && (
        <div className="dos-serveur">
          <span className="suivi-barre" aria-hidden="true">
            <i style={{ width: `${pct}%` }} />
          </span>
          <p>L’installation continue sur le serveur : vous pouvez quitter cette page ou fermer l’application. Une notification vous préviendra à la fin.</p>
        </div>
      )}
      <ul className="dos-liste">
        {roles.map((role) => {
          const r = t.roles[role]
          const fait = r.faits + r.erreurs >= r.total
          const etat = fait ? (r.erreurs ? 'erreur' : 'fait') : enCours && role === actuel ? 'en_cours' : 'attente'
          return (
            <li key={role} className={`dos-${etat === 'attente' ? 'file' : etat}`}>
              <div className="dos-ligne">
                <span className="dos-etat" aria-hidden="true">
                  {etat === 'fait' ? '✓' : etat === 'erreur' ? '!' : etat === 'attente' ? '' : ''}
                </span>
                <span className="ls-texte">
                  <b>
                    {ROLES[role].titre}
                    <span className="dos-nb">{r.total > 1 ? `${r.faits + r.erreurs} / ${r.total}` : r.total}</span>
                  </b>
                  <small>{etat === 'attente' ? (t.statut === 'annule' ? 'Non installé' : 'En attente') : etat === 'en_cours' && !r.faits ? 'En cours…' : resumeRole(role, r)}</small>
                  {[...r.alertes, ...r.messages].map((a) => (
                    <small key={a} className="dos-alerte">
                      {a}
                    </small>
                  ))}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
      <div className="dos-barre">
        {enCours ? (
          <button type="button" className="btn btn-quiet" onClick={annuler}>
            Arrêter l’installation
          </button>
        ) : (
          <>
            <a className="btn" href="#/">
              Terminer
            </a>
            <button type="button" className="btn btn-quiet" onClick={onNouveau}>
              Autre dossier
            </button>
          </>
        )}
      </div>
    </>
  )
}

// Import du dossier complet d'un etablissement : chaque fichier est reconnu sur l'appareil,
// puis le serveur installe tout en arriere-plan.
export default function ImportDossier() {
  const champDossier = useRef(null)
  const champFichiers = useRef(null)
  const [analyse, setAnalyse] = useState(null)
  const [choisis, setChoisis] = useState([])
  const [etat, setEtat] = useState('')
  const [error, setError] = useState('')
  const [survol, setSurvol] = useState(false)
  const [prep, setPrep] = useState('')
  const [travail, setTravail] = useState(() => Number(new URLSearchParams(window.location.hash.split('?')[1] || '').get('travail')) || null)

  async function prendre(liste) {
    setError('')
    try {
      setEtat('Ouverture du dossier…')
      const fichiers = await fichiersDuChoix(liste)
      if (!fichiers.length) throw new Error('Aucun fichier trouvé dans ce dossier.')
      const a = await analyser(fichiers, (n, total) => setEtat(`Analyse des fichiers · ${n} / ${total}`))
      setAnalyse(a)
      setChoisis(ORDRE.filter((r) => r !== 'ignore' && a.some((x) => x.role === r)))
    } catch (err) {
      setError(err.message)
    }
    setEtat('')
  }
  const choisir = (e) => {
    const l = [...(e.target.files || [])]
    e.target.value = ''
    if (l.length) prendre(l)
  }

  async function lancer() {
    setError('')
    setPrep('Préparation…')
    try {
      const id = await lancerInstallation(analyse, choisis, setPrep)
      window.history.replaceState(null, '', `#/dossier?travail=${id}`)
      setTravail(id)
      setAnalyse(null)
      annoncer('Installation lancée sur le serveur')
    } catch (err) {
      setError(err.message)
    }
    setPrep('')
  }

  const changerRole = (id, role) => {
    setAnalyse((l) => l.map((x) => (x.id === id ? { ...x, role, categorie: x.categorie || 'administration' } : x)))
    if (role !== 'ignore') setChoisis((c) => (c.includes(role) ? c : [...c, role]))
  }

  if (travail)
    return (
      <SuiviTravail
        key={travail}
        id={travail}
        onNouveau={() => {
          window.history.replaceState(null, '', '#/dossier')
          setTravail(null)
        }}
      />
    )

  if (prep)
    return (
      <>
        <div className="page-tete">
          <div>
            <h1 className="page-title">Préparation</h1>
            <p className="muted">Les fichiers sont préparés sur cet appareil, puis confiés au serveur.</p>
          </div>
        </div>
        <div className="dos-attente">
          <span className="dos-roue" aria-hidden="true" />
          <b>{prep}</b>
          <small>Gardez la page ouverte quelques instants : ensuite, vous pourrez fermer l’application.</small>
        </div>
      </>
    )

  // ---------- choix du dossier
  if (!analyse) {
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setSurvol(true)
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={async (e) => {
          e.preventDefault()
          setSurvol(false)
          prendre(await fichiersGlisses(e.dataTransfer))
        }}
      >
        <div className="page-tete">
          <div>
            <h1 className="page-title">Dossier de l’établissement</h1>
            <p className="muted">Ajoutez tout votre dossier : chaque fichier est reconnu et rangé au bon endroit.</p>
          </div>
        </div>
        <Note>{error}</Note>
        {etat ? (
          <div className="dos-attente">
            <span className="dos-roue" aria-hidden="true" />
            <b>{etat}</b>
            <small>Les fichiers sont lus sur cet appareil.</small>
          </div>
        ) : (
          <div className={`dos-depot ${survol ? 'survol' : ''}`}>
            <IcImport size={28} />
            <b>{iPhone ? 'Choisissez le dossier compressé (.zip)' : 'Glissez le dossier ici'}</b>
            <small>
              {iPhone
                ? 'Dans l’app Fichiers : appui long sur le dossier › Compresser, puis choisissez le fichier .zip.'
                : 'Élèves, enseignants, emplois du temps, cahiers d’appel, frais, paiements, discipline, communiqués…'}
            </small>
            {!iPhone && (
              <button type="button" className="btn btn-block" onClick={() => champDossier.current?.click()}>
                Choisir un dossier
              </button>
            )}
            <button type="button" className={`btn btn-block ${iPhone ? '' : 'btn-quiet'}`} onClick={() => champFichiers.current?.click()}>
              {iPhone ? 'Choisir le fichier .zip' : 'Choisir un .zip ou des fichiers'}
            </button>
          </div>
        )}
        <input ref={champDossier} type="file" hidden webkitdirectory="" directory="" multiple onChange={choisir} />
        <input ref={champFichiers} type="file" hidden multiple onChange={choisir} />
      </div>
    )
  }

  // ---------- verification avant l'installation
  const groupes = ORDRE.map((r) => ({ role: r, items: analyse.filter((x) => x.role === r) })).filter((g) => g.items.length)
  const utiles = analyse.filter((x) => x.role !== 'ignore').length
  return (
    <>
      <div className="page-tete">
        <div>
          <h1 className="page-title">Vérifier avant d’installer</h1>
          <p className="muted">{`${analyse.length} fichiers · ${utiles} reconnus`}</p>
        </div>
      </div>
      <Note>{error}</Note>

      <ul className="dos-liste">
        {groupes.map(({ role, items }) => {
          const ignore = role === 'ignore'
          return (
            <li key={role} className={ignore ? 'dos-ignore' : ''}>
              <div className="dos-ligne">
                {ignore ? (
                  <span className="dos-etat" aria-hidden="true">
                    –
                  </span>
                ) : (
                  <input
                    type="checkbox"
                    checked={choisis.includes(role)}
                    onChange={(e) => setChoisis((c) => (e.target.checked ? [...c, role] : c.filter((x) => x !== role)))}
                    aria-label={ROLES[role].titre}
                  />
                )}
                <span className="ls-texte">
                  <b>
                    {ROLES[role].titre}
                    <span className="dos-nb">{items.length}</span>
                  </b>
                  <small>{ROLES[role].action}</small>
                </span>
              </div>
              <details className="dos-fichiers">
                <summary>Voir les fichiers</summary>
                <ul>
                  {items.map((x) => (
                    <li key={x.id}>
                      <span data-brut>{x.chemin}</span>
                      <select className="input" value={x.role} onChange={(e) => changerRole(x.id, e.target.value)} aria-label="Rôle du fichier">
                        {ORDRE.map((r) => (
                          <option key={r} value={r}>
                            {ROLES[r].titre}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          )
        })}
      </ul>

      <div className="dos-barre">
        <button type="button" className="btn" disabled={!choisis.length} onClick={lancer}>
          Installer
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => setAnalyse(null)}>
          Annuler
        </button>
      </div>
      <p className="muted dos-note">Rien n’est enregistré avant « Installer ». L’installation se fait ensuite sur le serveur : vous pourrez fermer l’application. Un même dossier peut être relancé sans créer de doublons.</p>
    </>
  )
}
