import { useEffect, useRef, useState } from 'react'

// Recadrage d'une photo avant envoi : on deplace l'image avec le doigt (ou la souris) et on zoome avec le curseur.
// ratio = largeur / hauteur du cadre ; sortie = largeur de l'image produite (JPEG).
export default function Recadreur({ fichier, ratio = 1, sortie = 800, rond = false, onValider, onAnnuler }) {
  const [img, setImg] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [off, setOff] = useState({ x: 0, y: 0 })
  const glisse = useRef(null)
  const largeur = Math.min(360, (typeof window !== 'undefined' ? window.innerWidth : 360) - 40)
  const hauteur = Math.round(largeur / ratio)

  useEffect(() => {
    const url = URL.createObjectURL(fichier)
    const i = new Image()
    i.onload = () => setImg(i)
    i.src = url
    return () => URL.revokeObjectURL(url)
  }, [fichier])

  const base = img ? Math.max(largeur / img.width, hauteur / img.height) : 1
  const echelle = base * zoom
  // l'image doit toujours couvrir le cadre
  const borne = (o, e) => {
    const mx = Math.max(0, (img.width * e - largeur) / 2)
    const my = Math.max(0, (img.height * e - hauteur) / 2)
    return { x: Math.max(-mx, Math.min(mx, o.x)), y: Math.max(-my, Math.min(my, o.y)) }
  }
  const o = img ? borne(off, echelle) : off

  function debut(e) {
    glisse.current = { x: e.clientX - o.x, y: e.clientY - o.y }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  function deplace(e) {
    if (!glisse.current || !img) return
    setOff(borne({ x: e.clientX - glisse.current.x, y: e.clientY - glisse.current.y }, echelle))
  }
  const fin = () => {
    glisse.current = null
  }

  function valider() {
    const c = document.createElement('canvas')
    c.width = sortie
    c.height = Math.round(sortie / ratio)
    const gauche = largeur / 2 - (img.width * echelle) / 2 + o.x
    const haut = hauteur / 2 - (img.height * echelle) / 2 + o.y
    const sx = -gauche / echelle
    const sy = -haut / echelle
    c.getContext('2d').drawImage(img, sx, sy, largeur / echelle, hauteur / echelle, 0, 0, c.width, c.height)
    onValider(c.toDataURL('image/jpeg', 0.82))
  }

  return (
    <div className="voile" onClick={onAnnuler}>
      <div className="feuille" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
        <p className="feuille-titre">Recadrer la photo</p>
        <p className="muted" style={{ fontSize: 13, margin: '-4px 0 10px' }}>
          Faites glisser l’image pour la placer, puis zoomez si besoin.
        </p>
        {!img ? (
          <p className="muted">Chargement…</p>
        ) : (
          <div
            className="recadre-cadre"
            style={{ width: largeur, height: hauteur, borderRadius: rond ? '50%' : 14 }}
            onPointerDown={debut}
            onPointerMove={deplace}
            onPointerUp={fin}
            onPointerCancel={fin}
          >
            <img
              src={img.src}
              alt=""
              draggable={false}
              style={{ width: img.width * echelle, height: img.height * echelle, transform: `translate(${largeur / 2 - (img.width * echelle) / 2 + o.x}px, ${hauteur / 2 - (img.height * echelle) / 2 + o.y}px)` }}
            />
          </div>
        )}
        <input type="range" min="1" max="3" step="0.02" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="recadre-zoom" aria-label="Zoom" />
        <div className="actions" style={{ justifyContent: 'center', marginTop: 10 }}>
          <button type="button" className="btn" onClick={valider} disabled={!img}>
            Utiliser cette photo
          </button>
          <button type="button" className="btn btn-quiet" onClick={onAnnuler}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}
