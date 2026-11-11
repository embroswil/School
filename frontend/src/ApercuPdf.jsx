import { useEffect, useState } from 'react'

// Apercu d'un PDF dans le fil : la premiere page s'affiche comme une image (pdf.js charge au besoin).
const CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/'
let promesse = null
const chargerPdfjs = () => {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib)
  if (!promesse) {
    promesse = new Promise((ok, ko) => {
      const s = document.createElement('script')
      s.src = `${CDN}pdf.min.js`
      s.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${CDN}pdf.worker.min.js`
        ok(window.pdfjsLib)
      }
      s.onerror = () => {
        promesse = null
        ko(new Error('pdf.js indisponible'))
      }
      document.head.appendChild(s)
    })
  }
  return promesse
}
const cache = new Map()

export const estPdf = (m) => /\.pdf($|\?)/i.test(m?.nom || '') || /\.pdf($|\?)/i.test(m?.url || '')

export default function ApercuPdf({ media, complet = false }) {
  const pages = complet ? 6 : 1
  const cle = `${media.url}#${pages}`
  const [etat, setEtat] = useState(() => cache.get(cle) || null)
  useEffect(() => {
    if (cache.has(cle)) return undefined
    let vivant = true
    ;(async () => {
      try {
        const lib = await chargerPdfjs()
        const pdf = await lib.getDocument({ url: media.url }).promise
        const images = []
        for (let n = 1; n <= Math.min(pdf.numPages, pages); n += 1) {
          const page = await pdf.getPage(n)
          const v0 = page.getViewport({ scale: 1 })
          const v = page.getViewport({ scale: Math.min(2, 760 / v0.width) })
          const c = document.createElement('canvas')
          c.width = Math.round(v.width)
          c.height = Math.round(v.height)
          await page.render({ canvasContext: c.getContext('2d'), viewport: v }).promise
          images.push(c.toDataURL('image/jpeg', 0.82))
        }
        const r = { images, total: pdf.numPages }
        cache.set(cle, r)
        if (vivant) setEtat(r)
      } catch (_) {
        if (vivant) setEtat({ erreur: true })
      }
    })()
    return () => {
      vivant = false
    }
  }, [cle, media.url, pages])

  const lien = (contenu) => (
    <a className="apercu-pdf" href={media.url} target="_blank" rel="noreferrer">
      {contenu}
    </a>
  )
  if (etat?.images?.length) {
    return lien(
      <>
        <span className="apercu-pdf-pages">
          {etat.images.map((src, i) => (
            <img key={i} src={src} alt={`${media.nom || 'Document'} — page ${i + 1}`} />
          ))}
        </span>
        <span className="apercu-pdf-pied">
          <span className="doc-badge">PDF</span>
          <span className="apercu-pdf-nom">
            <b>{media.nom || 'Document'}</b>
            <small>
              {etat.total} page{etat.total > 1 ? 's' : ''} · Toucher pour ouvrir
            </small>
          </span>
        </span>
      </>
    )
  }
  // Chargement ou echec : la carte simple
  return (
    <a className="info-doc" href={media.url} target="_blank" rel="noreferrer">
      <span className="info-doc-ico">PDF</span>
      <span style={{ minWidth: 0 }}>
        <b>{media.nom || 'Document'}</b>
        <small>{etat?.erreur ? 'Toucher pour ouvrir' : 'Aperçu en cours…'}</small>
      </span>
    </a>
  )
}
