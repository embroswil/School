import { useRef, useState } from 'react'
import { Note, annoncer } from '../ui.jsx'
import { IcImport } from '../icones.jsx'
import { ROLES, analyser, fichiersDuChoix, installer } from '../dossier.js'

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

// Import du dossier complet d'un etablissement : chaque fichier est reconnu puis installe au bon endroit
export default function ImportDossier() {
  const champDossier = useRef(null)
  const champFichiers = useRef(null)
  const [analyse, setAnalyse] = useState(null)
  const [choisis, setChoisis] = useState([])
  const [etat, setEtat] = useState('')
  const [error, setError] = useState('')
  const [suivi, setSuivi] = useState(null)
  const [fini, setFini] = useState(false)
  const [survol, setSurvol] = useState(false)

  async function prendre(liste) {
    setError('')
    setFini(false)
    setSuivi(null)
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
    setSuivi({})
    await installer(analyse, choisis, (role, info) => setSuivi((s) => ({ ...s, [role]: info })))
    setFini(true)
    annoncer('Dossier installé')
  }

  const changerRole = (id, role) => {
    setAnalyse((l) => l.map((x) => (x.id === id ? { ...x, role, categorie: x.categorie || 'administration' } : x)))
    if (role !== 'ignore') setChoisis((c) => (c.includes(role) ? c : [...c, role]))
  }

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
                : 'Élèves, enseignants, emplois du temps, cahiers d’appel, frais, paiements, comptabilité, discipline, communiqués…'}
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

  // ---------- verification, puis installation
  const groupes = ORDRE.map((r) => ({ role: r, items: analyse.filter((x) => x.role === r) })).filter((g) => g.items.length && !(suivi && g.role === 'ignore'))
  const utiles = analyse.filter((x) => x.role !== 'ignore').length
  const enCours = suivi && !fini
  return (
    <>
      <div className="page-tete">
        <div>
          <h1 className="page-title">{fini ? 'Dossier installé' : suivi ? 'Installation…' : 'Vérifier avant d’installer'}</h1>
          <p className="muted">{`${analyse.length} fichiers · ${utiles} reconnus`}</p>
        </div>
      </div>
      <Note>{error}</Note>

      <ul className="dos-liste">
        {groupes.map(({ role, items }) => {
          const s = suivi?.[role]
          const coche = choisis.includes(role)
          const ignore = role === 'ignore'
          return (
            <li key={role} className={`${ignore ? 'dos-ignore' : ''} ${s ? `dos-${s.etat}` : ''}`}>
              <div className="dos-ligne">
                {!suivi && !ignore ? (
                  <input
                    type="checkbox"
                    checked={coche}
                    onChange={(e) => setChoisis((c) => (e.target.checked ? [...c, role] : c.filter((x) => x !== role)))}
                    aria-label={ROLES[role].titre}
                  />
                ) : (
                  <span className="dos-etat" aria-hidden="true">
                    {s?.etat === 'fait' ? '✓' : s?.etat === 'erreur' ? '!' : s?.etat === 'en_cours' ? '' : coche && !ignore ? '' : '–'}
                  </span>
                )}
                <span className="ls-texte">
                  <b>
                    {ROLES[role].titre}
                    <span className="dos-nb">{items.length}</span>
                  </b>
                  <small>
                    {s?.etat === 'en_cours'
                      ? s.pas || 'En cours…'
                      : s?.etat === 'fait'
                        ? s.resume
                        : s?.etat === 'erreur'
                          ? s.erreur
                          : suivi && !coche
                            ? 'Non installé'
                            : ROLES[role].action}
                  </small>
                  {s?.alertes?.map((a) => (
                    <small key={a} className="dos-alerte">
                      {a}
                    </small>
                  ))}
                </span>
              </div>
              {!suivi && (
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
              )}
            </li>
          )
        })}
      </ul>

      {!suivi && (
        <div className="dos-barre">
          <button type="button" className="btn" disabled={!choisis.length} onClick={lancer}>
            Installer
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setAnalyse(null)}>
            Annuler
          </button>
        </div>
      )}
      {!suivi && <p className="muted dos-note">Rien n’est enregistré avant « Installer ». Vous pouvez relancer le même dossier plus tard : ce qui existe déjà n’est pas ajouté deux fois.</p>}
      {enCours && <p className="muted dos-note">Gardez cette page ouverte jusqu’à la fin de l’installation.</p>}
      {fini && (
        <div className="dos-barre">
          <a className="btn" href="#/">
            Terminer
          </a>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              setAnalyse(null)
              setSuivi(null)
              setFini(false)
            }}
          >
            Autre dossier
          </button>
        </div>
      )}
    </>
  )
}
