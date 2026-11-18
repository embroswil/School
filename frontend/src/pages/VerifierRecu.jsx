import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { fcfa, MODES_PAIEMENT } from '../recus.js'

const date = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—')
const camera = typeof window !== 'undefined' && 'BarcodeDetector' in window && navigator.mediaDevices?.getUserMedia

// Lecture d'un QR code ou d'un code-barres par la camera (navigateurs qui le permettent)
function Scanner({ onLu, onFermer }) {
  const video = useRef(null)
  const rappels = useRef({ onLu, onFermer })
  rappels.current = { onLu, onFermer }
  useEffect(() => {
    let flux = null
    let fini = false
    const detecteur = new window.BarcodeDetector({ formats: ['qr_code', 'code_128'] })
    ;(async () => {
      try {
        flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        video.current.srcObject = flux
        await video.current.play()
        while (!fini) {
          const codes = await detecteur.detect(video.current).catch(() => [])
          if (codes[0]?.rawValue) {
            fini = true
            rappels.current.onLu(codes[0].rawValue)
            break
          }
          await new Promise((r) => setTimeout(r, 250))
        }
      } catch {
        rappels.current.onFermer()
      }
    })()
    return () => {
      fini = true
      flux?.getTracks().forEach((t) => t.stop())
    }
  }, [])
  return (
    <div className="verif-camera">
      <video ref={video} playsInline muted />
      <button type="button" className="btn btn-quiet btn-block" onClick={onFermer}>
        Fermer la caméra
      </button>
    </div>
  )
}

// Numero et code d'un texte scanne : lien du QR code (…/verifier/SK-…?c=CODE) ou numero seul (code-barres)
function lireScan(t) {
  const s = String(t || '').trim()
  const m = s.match(/verifier\/([^?#\s]+)(?:\?c=([A-Za-z0-9]+))?/)
  if (m) return { numero: decodeURIComponent(m[1]).toUpperCase(), code: (m[2] || '').toUpperCase() }
  return { numero: s.toUpperCase(), code: '' }
}

// Verification d'un recu par l'administration de l'etablissement : scan (camera, lecteur de
// code-barres) ou numero tape (recu Sukul ou recu papier / bordereau).
export default function VerifierRecu({ numero: numeroLien = '', code: codeLien = '' }) {
  const [saisie, setSaisie] = useState(numeroLien)
  const [etat, setEtat] = useState(null)
  const [busy, setBusy] = useState(false)
  const [scan, setScan] = useState(false)
  const champ = useRef(null)

  async function verifier(numero, code) {
    if (!numero) return
    setBusy(true)
    setEtat(null)
    try {
      const r = await api.get(`/api/verifier/recus/${encodeURIComponent(numero)}${code ? `?c=${encodeURIComponent(code)}` : ''}`)
      setEtat({ ok: r.data.codeOk !== false, recu: r.data })
    } catch (err) {
      setEtat({ ok: false, message: err.message })
    }
    setBusy(false)
    setSaisie('')
    champ.current?.focus()
  }
  useEffect(() => {
    if (numeroLien) verifier(numeroLien.toUpperCase(), codeLien.toUpperCase())
    else champ.current?.focus()
  }, [numeroLien, codeLien])

  const r = etat?.recu
  return (
    <div className="verif">
      <div className="page-tete">
        <div>
          <h1 className="page-title">Vérifier un reçu</h1>
          <p className="muted">Scannez le code du reçu Sùkûl, ou tapez son numéro ou celui du reçu papier.</p>
        </div>
      </div>

      <form
        className="verif-saisie"
        onSubmit={(e) => {
          e.preventDefault()
          const l = lireScan(saisie)
          verifier(l.numero, l.code)
        }}
      >
        <input ref={champ} className="input" value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="SK-2026-0000123" autoComplete="off" autoCapitalize="characters" aria-label="Numéro du reçu" />
        <button type="submit" className="btn" disabled={busy || !saisie.trim()}>
          Vérifier
        </button>
      </form>
      {camera && !scan && (
        <button type="button" className="btn btn-quiet btn-block verif-scanner" onClick={() => setScan(true)}>
          Scanner avec la caméra
        </button>
      )}
      {scan && (
        <Scanner
          onLu={(t) => {
            setScan(false)
            const l = lireScan(t)
            verifier(l.numero, l.code)
          }}
          onFermer={() => setScan(false)}
        />
      )}
      {!camera && <p className="muted verif-astuce">Avec un téléphone, scannez le QR code du reçu avec l’appareil photo : la vérification s’ouvre ici. Un lecteur de code-barres branché à l’ordinateur fonctionne aussi dans le champ ci-dessus.</p>}

      {busy && <p className="muted">Vérification…</p>}
      {etat && !r && (
        <div className="verif-resultat ko">
          <span className="verif-sceau" aria-hidden="true">
            !
          </span>
          <b>Reçu non reconnu</b>
          <small>{etat.message}</small>
        </div>
      )}
      {r && (
        <div className={`verif-resultat ${etat.ok ? 'ok' : 'ko'}`}>
          <span className="verif-sceau" aria-hidden="true">
            {etat.ok ? '✓' : '!'}
          </span>
          <b>{etat.ok ? 'Paiement confirmé' : 'Reçu modifié'}</b>
          <small>{etat.ok ? 'Ce paiement est bien enregistré dans Sùkûl.' : 'Le code du reçu ne correspond pas au paiement enregistré : ce document a été modifié. Seules les informations ci-dessous font foi.'}</small>
          <dl className="recu-lignes">
            {[
              ['Élève', r.eleve.nom],
              ['Classe', r.eleve.classe || '—'],
              ...(r.eleve.matricule ? [['Matricule', r.eleve.matricule]] : []),
              ['Objet', r.frais],
              ['Montant', fcfa(r.montant)],
              ['Date', date(r.date)],
              ['Moyen de paiement', MODES_PAIEMENT[r.mode] || r.mode],
              ['N° Sùkûl', r.numero],
              ...(r.recuExterne ? [['Reçu papier / bordereau', r.recuExterne]] : []),
              ...(r.enregistrePar ? [['Enregistré par', r.enregistrePar]] : []),
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd data-brut={['Élève', 'Matricule', 'N° Sùkûl', 'Reçu papier / bordereau', 'Enregistré par'].includes(k) ? '' : undefined}>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="verif-situation">
            <span>{r.frais}</span>
            <b className={r.fraisReste ? 'rouge' : 'vert'}>{r.fraisReste ? `Reste ${fcfa(r.fraisReste)}` : 'Soldé'}</b>
            <small>{`${fcfa(r.fraisPaye)} payés sur ${fcfa(r.fraisMontant)}`}</small>
          </div>
          <div className="verif-liens">
            <a href={`#/recus/${r.id}`}>Voir le reçu</a>
            <a href={`#/releve/${r.eleve.id}`}>Relevé de l’élève</a>
          </div>
        </div>
      )}
    </div>
  )
}
