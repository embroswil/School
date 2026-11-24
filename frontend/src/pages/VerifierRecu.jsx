import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { fcfa, MODES_PAIEMENT } from '../recus.js'
import { lireCode128 } from '../code128.js'
import { paquetScolarite, parMatricule, recuLocal } from '../paquet.js'

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
      <p>Placez le code du reçu dans le cadre</p>
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

// Situation de scolarite d'un eleve retrouve par son matricule : a-t-il paye ? que reste-t-il ?
function Situation({ s }) {
  const statut =
    s.statut === 'regle'
      ? ['ok', '✓', 'Scolarité réglée', 'Tous les frais obligatoires sont payés.']
      : s.statut === 'aucun'
        ? ['neutre', 'i', 'Aucun frais', 'Aucun frais obligatoire ne concerne cet élève.']
        : [s.statut === 'non_paye' || s.enRetard ? 'ko' : 'attention', '!', `Reste à payer : ${fcfa(s.resteObligatoire)}`, s.statut === 'non_paye' ? 'Aucun frais obligatoire n’a été payé.' : s.enRetard ? 'Des frais ne sont pas payés à leur échéance.' : 'Paiement partiel, sans retard.']
  return (
    <div className={`verif-resultat ${statut[0]}`}>
      <span className="verif-sceau" aria-hidden="true">
        {statut[1]}
      </span>
      <b>{statut[2]}</b>
      <small>{statut[3]}</small>
      <dl className="recu-lignes">
        {[
          ['Élève', `${s.eleve.nom} ${s.eleve.prenom}`],
          ['Classe', s.eleve.classe || '—'],
          ['Matricule', s.matricule || '—'],
          ['Payé', `${fcfa(s.paye)} sur ${fcfa(s.total)}`],
        ].map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd data-brut={['Élève', 'Matricule'].includes(k) ? '' : undefined}>{v}</dd>
          </div>
        ))}
      </dl>
      {s.frais.length > 0 && (
        <table className="verif-frais">
          <thead>
            <tr>
              <th>Frais</th>
              <th>Payé</th>
              <th>Reste</th>
            </tr>
          </thead>
          <tbody>
            {s.frais.map((f) => {
              const retard = f.reste > 0 && f.echeance && new Date(f.echeance) < new Date()
              return (
                <tr key={f.id}>
                  <td>
                    {f.nom}
                    <small>{f.obligatoire === false ? 'Facultatif' : f.echeance ? `${retard ? 'En retard · ' : ''}avant le ${date(f.echeance)}` : 'Sans échéance'}</small>
                  </td>
                  <td>{fcfa(Math.min(f.paye, f.montant))}</td>
                  <td className={f.reste ? (retard ? 'rouge' : '') : 'vert'}>{f.reste ? fcfa(f.reste) : 'Payé'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <div className="verif-liens">
        <a href={`#/releve/${s.eleve.id}`}>Relevé des paiements</a>
        <a href={`#/eleves/${s.eleve.id}`}>Fiche de l’élève</a>
      </div>
    </div>
  )
}

// Verification par l'administration : par le MATRICULE de l'eleve (a-t-il paye, que reste-t-il ?).
// Le lien du QR code imprime sur un recu Sukul ouvre aussi cette page avec le recu verifie.
export default function VerifierRecu({ numero: numeroLien = '', code: codeLien = '' }) {
  const [saisie, setSaisie] = useState('')
  const [situation, setSituation] = useState(null)
  const [erreur, setErreur] = useState('')
  const [busy, setBusy] = useState(false)
  const [etat, setEtat] = useState(null) // recu verifie depuis son QR code ou son code-barres
  const [scan, setScan] = useState(false)
  const [refus, setRefus] = useState(false)
  // sans reseau : verification sur les donnees gardees sur l'appareil (eleves, frais, recus)
  const [paquet, setPaquet] = useState(null)
  useEffect(() => {
    paquetScolarite().then(setPaquet)
  }, [])

  async function chercher(matricule) {
    const m = matricule.trim()
    if (!m) return
    setBusy(true)
    setErreur('')
    setSituation(null)
    setEtat(null)
    try {
      setSituation((await api.get(`/api/verifier/eleves/${encodeURIComponent(m)}`)).data)
    } catch (err) {
      const local = err.status === 0 ? parMatricule(paquet, m) : null
      if (local) setSituation(local)
      else setErreur(err.status === 0 && !paquet ? 'Pas de réseau, et les données de la scolarité ne sont pas encore sur cet appareil.' : err.message)
    }
    setBusy(false)
  }
  // Recu scanne (QR code ou code-barres) : le recu est verifie, puis la situation de l'eleve s'affiche
  async function verifierRecu(numero, code) {
    setScan(false)
    setBusy(true)
    setErreur('')
    setSituation(null)
    setEtat(null)
    try {
      const r = await api.get(`/api/verifier/recus/${encodeURIComponent(numero)}${code ? `?c=${encodeURIComponent(code)}` : ''}`)
      setEtat({ ok: r.data.codeOk !== false, recu: r.data })
      const m = r.data.eleve?.matricule
      if (m) setSituation((await api.get(`/api/verifier/eleves/${encodeURIComponent(m)}`).catch(() => ({ data: null }))).data)
    } catch (err) {
      const local = err.status === 0 ? recuLocal(paquet, numero, code) : null
      if (local) {
        setEtat({ ok: local.codeOk !== false, recu: local })
        setSituation(parMatricule(paquet, local.eleve.matricule))
      } else setEtat({ ok: false, message: err.status === 0 && !paquet ? 'Pas de réseau, et les reçus ne sont pas encore sur cet appareil.' : err.message })
    }
    setBusy(false)
  }
  // Texte scanne : lien du QR code d'un recu, numero de recu, ou matricule (carte d'eleve)
  async function lu(texte) {
    const l = lireScan(texte)
    if (/verifier\//.test(String(texte)) || /^(SK|SB|REC|LBR)?-?\d{4}-\d+$/i.test(l.numero)) return verifierRecu(l.numero, l.code)
    setScan(false)
    setBusy(true)
    setErreur('')
    setEtat(null)
    try {
      setSituation((await api.get(`/api/verifier/eleves/${encodeURIComponent(l.numero)}`)).data)
      setBusy(false)
    } catch (err) {
      setBusy(false)
      const local = err.status === 0 ? parMatricule(paquet, l.numero) : null
      if (local) setSituation(local)
      else verifierRecu(l.numero, l.code)
    }
  }
  useEffect(() => {
    if (numeroLien) verifierRecu(numeroLien.toUpperCase(), codeLien.toUpperCase())
  }, [numeroLien, codeLien])

  const r = etat?.recu
  return (
    <div className="verif">
      <h1 className="page-title">Vérifier un paiement</h1>
      <p className="lede">Scannez le reçu, ou saisissez le matricule de l’élève : vous voyez aussitôt s’il a payé et ce qu’il reste à payer.</p>
      {scan && <Scanner onLu={lu} onErreur={() => (setScan(false), setRefus(true))} />}
      {refus && !scan && <p className="muted verif-astuce">La caméra n’est pas disponible. Autorisez l’accès à la caméra pour Sùkûl dans les réglages du téléphone, ou saisissez le matricule.</p>}
      {camera && !scan && (
        <button type="button" className="btn btn-block verif-scanner" onClick={() => (setRefus(false), setScan(true))}>
          Scanner un reçu
        </button>
      )}
      <form
        className="verif-saisie"
        onSubmit={(e) => {
          e.preventDefault()
          chercher(saisie)
        }}
      >
        <input className="input" value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="Matricule de l’élève" autoComplete="off" autoCapitalize="characters" aria-label="Matricule de l’élève" />
        <button type="submit" className="btn" disabled={busy || !saisie.trim()}>
          {busy ? '…' : 'Vérifier'}
        </button>
      </form>
      {erreur && (
        <div className="verif-resultat ko">
          <span className="verif-sceau" aria-hidden="true">
            !
          </span>
          <b>Élève introuvable</b>
          <small>{erreur}</small>
        </div>
      )}

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
          <b>{etat.ok ? 'Reçu authentique' : 'Reçu modifié'}</b>
          <small>{etat.ok ? 'Ce paiement est bien enregistré dans Sùkûl.' : 'Le code du reçu ne correspond pas au paiement enregistré : ce document a été modifié. Seules les informations ci-dessous font foi.'}</small>
          <dl className="recu-lignes">
            {[
              ['Élève', r.eleve.nom],
              ['Classe', r.eleve.classe || '—'],
              ...(r.eleve.matricule ? [['Matricule', String(r.eleve.matricule).replace(/^\d+-/, '')]] : []),
              ['Objet', r.frais],
              ['Montant', fcfa(r.montant)],
              ['Date', date(r.date)],
              ['Moyen de paiement', MODES_PAIEMENT[r.mode] || r.mode],
              ['N° Sùkûl', r.numero],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd data-brut={['Élève', 'Matricule', 'N° Sùkûl'].includes(k) ? '' : undefined}>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="verif-situation">
            <span>{r.frais}</span>
            <b className={r.fraisReste ? 'rouge' : 'vert'}>{r.fraisReste ? `Reste ${fcfa(r.fraisReste)}` : 'Soldé'}</b>
            <small>{`${fcfa(r.fraisPaye)} payés sur ${fcfa(r.fraisMontant)}`}</small>
          </div>
          {r.horsLigne && <small className="verif-hl">{`Vérifié sans réseau, sur les données du ${date(r.horsLigne)}.`}</small>}
          {(r.id || r.lien) && (
            <div className="verif-liens">
              <a href={r.lien || `#/recus/${r.id}`}>Voir le reçu</a>
            </div>
          )}
        </div>
      )}
      {situation?.horsLigne && <p className="hors-ligne">{`Pas de réseau : situation calculée sur l’appareil (données du ${date(situation.horsLigne)}).`}</p>}
      {situation && <Situation s={situation} />}
    </div>
  )
}
