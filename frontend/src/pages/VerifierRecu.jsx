import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { fcfa, MODES_PAIEMENT } from '../recus.js'
import { lireCode128 } from '../code128.js'

const date = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—')
const camera = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

// Lecture du code-barres (ou du QR code) par la camera, directement dans l'application.
// Le detecteur du navigateur est utilise s'il existe ; sinon (iPhone) le code-barres est lu image par image.
function Scanner({ onLu, onErreur }) {
  const video = useRef(null)
  const rappels = useRef({ onLu, onErreur })
  rappels.current = { onLu, onErreur }
  useEffect(() => {
    let flux = null
    let fini = false
    const toile = document.createElement('canvas')
    const ctx = toile.getContext('2d', { willReadFrequently: true })
    const natif = 'BarcodeDetector' in window ? new window.BarcodeDetector({ formats: ['qr_code', 'code_128'] }) : null
    ;(async () => {
      try {
        flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
        if (fini) return
        video.current.srcObject = flux
        await video.current.play()
        while (!fini) {
          const v = video.current
          let texte = null
          if (v && v.videoWidth) {
            if (natif) texte = (await natif.detect(v).catch(() => []))[0]?.rawValue || null
            if (!texte) {
              // bande centrale de l'image (la ou se trouve le cadre)
              const w = Math.min(v.videoWidth, 1600)
              const ech = w / v.videoWidth
              const h = Math.round(v.videoHeight * ech * 0.4)
              toile.width = w
              toile.height = h
              ctx.drawImage(v, 0, v.videoHeight * 0.3, v.videoWidth, v.videoHeight * 0.4, 0, 0, w, h)
              const px = ctx.getImageData(0, 0, w, h).data
              const gris = new Uint8Array(w * h)
              for (let k = 0, p = 0; k < gris.length; k++, p += 4) gris[k] = (px[p] * 77 + px[p + 1] * 150 + px[p + 2] * 29) >> 8
              texte = lireCode128(gris, w, h)
            }
          }
          if (texte) {
            fini = true
            navigator.vibrate?.(60)
            rappels.current.onLu(texte)
            break
          }
          await new Promise((r) => setTimeout(r, 120))
        }
      } catch {
        rappels.current.onErreur()
      }
    })()
    return () => {
      fini = true
      flux?.getTracks().forEach((t) => t.stop())
    }
  }, [])
  return (
    <div className="verif-camera">
      <video ref={video} playsInline muted autoPlay />
      <span className="verif-cadre" aria-hidden="true" />
      <p>Placez le code-barres du reçu dans le cadre</p>
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
  const [saisie, setSaisie] = useState('')
  const [etat, setEtat] = useState(null)
  const [busy, setBusy] = useState(false)
  const [scan, setScan] = useState(camera && !numeroLien)
  const [refus, setRefus] = useState(false)

  async function verifier(numero, code) {
    if (!numero) return
    setScan(false)
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
  }
  useEffect(() => {
    if (numeroLien) verifier(numeroLien.toUpperCase(), codeLien.toUpperCase())
  }, [numeroLien, codeLien])

  const r = etat?.recu
  const relancer = () => {
    setEtat(null)
    setScan(camera)
  }
  return (
    <div className="verif">
      {scan && (
        <Scanner
          onLu={(t) => {
            const l = lireScan(t)
            verifier(l.numero, l.code)
          }}
          onErreur={() => {
            setScan(false)
            setRefus(true)
          }}
        />
      )}
      {refus && !etat && <p className="muted verif-astuce">La caméra n’est pas disponible. Autorisez l’accès à la caméra pour Sùkûl dans les réglages du téléphone, ou tapez le numéro du reçu.</p>}
      {!scan && !etat && camera && !busy && (
        <button type="button" className="btn btn-block verif-scanner" onClick={relancer}>
          Scanner un reçu
        </button>
      )}

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
      {etat && (
        <button type="button" className="btn btn-block verif-scanner" onClick={relancer}>
          Scanner un autre reçu
        </button>
      )}
      <form
        className="verif-saisie"
        onSubmit={(e) => {
          e.preventDefault()
          const l = lireScan(saisie)
          verifier(l.numero, l.code)
        }}
      >
        <input className="input" value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="Ou tapez le n° du reçu" autoComplete="off" autoCapitalize="characters" aria-label="Numéro du reçu" />
        <button type="submit" className="btn btn-quiet" disabled={busy || !saisie.trim()}>
          Vérifier
        </button>
      </form>
    </div>
  )
}
