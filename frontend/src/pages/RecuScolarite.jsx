import { useApi } from '../hooks.js'
import { Note, annoncer } from '../ui.jsx'
import { useAuth } from '../auth.jsx'
import { qrSvg } from '../qr.js'
import { code128Svg } from '../code128.js'
import { pdfRecu } from '../pdf-recu.js'
import { useState } from 'react'
import { enLettres, fcfa, inWords, lienVerification, MODES_PAIEMENT } from '../recus.js'
import { langue, traduire } from '../i18n.jsx'

const API = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '')
const date = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—')
const heure = (d) => (d ? new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '')

/** En-tete commun des recus et releves : logo (photo de l'etablissement) et nom. */
export function EnteteRecu({ ecoleId, aPhoto, ecole, ville, titre, numero, sous }) {
  return (
    <header className="recu-tete">
      <div className="recu-ecole">
        {aPhoto ? <img src={`${API}/api/actualites/ecoles/${ecoleId}/photo`} alt="" /> : <span className="recu-logo">{String(ecole || '?').charAt(0)}</span>}
        <div>
          <b data-brut>{ecole}</b>
          {ville && <small>{ville}</small>}
        </div>
      </div>
      <div className="recu-titre">
        <b>{titre}</b>
        {numero && <small>{`N° ${numero}`}</small>}
        {sous && <small>{sous}</small>}
      </div>
    </header>
  )
}

// Recu virtuel d'un paiement de scolarite : verifiable par QR code, imprimable et partageable.
export default function RecuScolarite({ id }) {
  const { user } = useAuth()
  const d = useApi(`/api/scolarite/recus/${id}`)
  const [busy, setBusy] = useState(false)
  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Chargement…</p>
  const r = d.data
  const lien = lienVerification(r.numero_recu, r.code)
  const quand = r.confirme_le || r.created_at
  const lignes = [
    ['Élève', `${r.last_name} ${r.first_name}`],
    ['Classe', r.classe || '—'],
    ...(r.matricule ? [['Matricule', r.matricule]] : []),
    ['Objet', r.frais],
    ['Moyen de paiement', MODES_PAIEMENT[r.mode] || r.mode],
    ...(r.recu_externe ? [['Reçu papier / bordereau', r.recu_externe]] : []),
    ...(r.reference && !/^(GUI|SCH)-/.test(r.reference) ? [['Référence', r.reference]] : []),
    ['Payé par', r.payeur_nom ? `${r.payeur_prenom} ${r.payeur_nom}` : 'Au guichet de l’établissement'],
    ['Date', `${date(quand)} · ${heure(quand)}`],
    ...(r.frais_service ? [['Frais de transaction', fcfa(r.frais_service)]] : []),
  ]
  const nomFichier = `Recu-${r.numero_recu}.pdf`
  // photo de l'etablissement convertie en petit JPEG pour le PDF (sinon initiale)
  async function logoJpeg() {
    if (!r.a_photo) return null
    try {
      const rep = await fetch(`${API}/api/actualites/ecoles/${r.school_id}/photo`)
      if (!rep.ok) return null
      const url = URL.createObjectURL(await rep.blob())
      const img = await new Promise((ok, ko) => {
        const i = new Image()
        i.onload = () => ok(i)
        i.onerror = ko
        i.src = url
      })
      const cote = Math.min(img.width, img.height)
      const cv = document.createElement('canvas')
      cv.width = 160
      cv.height = 160
      const ctx = cv.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, 160, 160)
      ctx.drawImage(img, (img.width - cote) / 2, (img.height - cote) / 2, cote, cote, 0, 0, 160, 160)
      URL.revokeObjectURL(url)
      const blob = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.85))
      return blob ? new Uint8Array(await blob.arrayBuffer()) : null
    } catch {
      return null
    }
  }
  async function fabriquerPdf() {
    const fr = langue !== 'en'
    return pdfRecu({
      ecole: r.ecole,
      ville: r.city,
      numero: r.numero_recu,
      montant: fcfa(r.montant),
      montantLettres: fr ? `Arrêté à la somme de ${enLettres(r.montant)} francs CFA` : `Received the sum of ${inWords(r.montant)} CFA francs`,
      lignes: lignes.map(([k, v]) => [traduire(k), String(v).startsWith('Au guichet') ? traduire(v) : v]),
      situation: [[traduire('Reste sur ce frais'), fcfa(r.resteApres)], ...(r.annee ? [[traduire('Payé sur l’année'), fcfa(r.annee.paye)], [traduire('Reste sur l’année'), fcfa(r.annee.reste)]] : [])],
      lien,
      code: r.code,
      barres: r.numero_recu,
      logo: await logoJpeg(),
      libelles: { titre: traduire('Reçu Sùkûl').toUpperCase(), montant: traduire('Montant reçu').toUpperCase(), paye: traduire('Payé').toUpperCase(), verifiable: traduire('Reçu Sùkûl unique'), code: traduire('Code :') },
      mentions: {
        verifier: traduire('Vérification par l’administration de l’établissement : scan du code QR ou du code-barres dans Sùkûl.'),
        emis: traduire('Ce reçu atteste que le paiement est enregistré dans Sùkûl. Il ne remplace pas le reçu papier ou le bordereau remis par l’établissement ou la banque.'),
      },
    })
  }
  async function telecharger() {
    setBusy(true)
    try {
      const blob = await fabriquerPdf()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nomFichier
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch {
      annoncer('Le PDF n’a pas pu être créé')
    }
    setBusy(false)
  }
  async function partager() {
    const texte = `Reçu ${r.numero_recu} · ${r.ecole} · ${r.first_name} ${r.last_name} · ${fcfa(r.montant)} (${r.frais})`
    setBusy(true)
    try {
      const fichier = new File([await fabriquerPdf()], nomFichier, { type: 'application/pdf' })
      if (navigator.canShare?.({ files: [fichier] })) await navigator.share({ files: [fichier], title: `Reçu ${r.numero_recu}`, text: texte })
      else if (navigator.share) await navigator.share({ title: `Reçu ${r.numero_recu}`, text: texte, url: lien })
      else {
        await navigator.clipboard.writeText(`${texte}\n${lien}`)
        annoncer('Lien du reçu copié')
      }
    } catch {
      /* partage annule */
    }
    setBusy(false)
  }
  return (
    <>
      <div className="recu-actions sans-impression">
        <button type="button" className="btn" disabled={busy} onClick={telecharger}>
          Télécharger
        </button>
        <button type="button" className="btn btn-quiet" disabled={busy} onClick={partager}>
          Partager
        </button>
        {user.role !== 'teacher' && (
          <a className="btn btn-quiet" href={`#/releve/${r.student_id}`}>
            Relevé
          </a>
        )}
      </div>

      <article className="bulletin recu">
        <EnteteRecu ecoleId={r.school_id} aPhoto={r.a_photo} ecole={r.ecole} ville={r.city} titre="Reçu Sùkûl" numero={r.numero_recu} />

        <div className="recu-montant">
          <span>Montant reçu</span>
          <b>{fcfa(r.montant)}</b>
          <small data-brut>{langue === 'en' ? `Received the sum of ${inWords(r.montant)} CFA francs` : `Arrêté à la somme de ${enLettres(r.montant)} francs CFA`}</small>
          <span className="recu-tampon" aria-hidden="true">
            Payé
          </span>
        </div>

        <dl className="recu-lignes">
          {lignes.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd data-brut={['Élève', 'Référence', 'Matricule', 'Reçu papier / bordereau'].includes(k) ? '' : undefined}>{v}</dd>
            </div>
          ))}
        </dl>

        <div className="recu-situation">
          <div>
            <span>Reste sur ce frais</span>
            <b>{fcfa(r.resteApres)}</b>
          </div>
          {r.annee && (
            <>
              <div>
                <span>Payé sur l’année</span>
                <b>{fcfa(r.annee.paye)}</b>
              </div>
              <div>
                <span>Reste sur l’année</span>
                <b>{fcfa(r.annee.reste)}</b>
              </div>
            </>
          )}
        </div>

        <footer className="recu-pied">
          <div className="recu-qr" dangerouslySetInnerHTML={{ __html: qrSvg(lien, 112) }} />
          <div>
            <b>Reçu Sùkûl unique</b>
            <p>Vérification par l’administration de l’établissement : scan du code QR ou du code-barres dans Sùkûl.</p>
            <p className="recu-code">
              Code : <b data-brut>{r.code}</b>
            </p>
            <p>Ce reçu atteste que le paiement est enregistré dans Sùkûl. Il ne remplace pas le reçu papier ou le bordereau remis par l’établissement ou la banque.</p>
          </div>
        </footer>
        <div className="recu-barres">
          <div dangerouslySetInnerHTML={{ __html: code128Svg(r.numero_recu) }} />
          <span data-brut>{r.numero_recu}</span>
        </div>
      </article>
      {['principal', 'admin'].includes(user.role) && (
        <p className="recu-verifier sans-impression">
          <a href={`#/verifier/${encodeURIComponent(r.numero_recu)}?c=${r.code}`}>Vérifier ce reçu</a>
        </p>
      )}
    </>
  )
}
