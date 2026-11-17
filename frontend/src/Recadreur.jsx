import { useEffect, useRef, useState } from 'react'

// Recadrage d'une photo avant envoi : on deplace l'image avec le doigt (ou la souris) et on zoome avec le curseur.
// ratio = largeur / hauteur du cadre ; sortie = largeur de l'image produite (JPEG).
export default function Recadreur({ fichier, ratio = 1, sortie = 800, rond = false, onValider, onAnnuler }) {
  const [img, setImg] = useState(null)
  const [erreur, setErreur] = useState(false)

  useEffect(() => {
    setImg(null)
    setErreur(false)
    if (!fichier) return undefined
    let vivant = true
    const url = URL.createObjectURL(fichier)
    const i = new Image()
    i.onload = () => {
      if (vivant && i.naturalWidth && i.naturalHeight) setImg({ src: url, width: i.naturalWidth, height: i.naturalHeight, el: i })
      else if (vivant) setErreur(true)
    }
    i.onerror = () => vivant && setErreur(true)
    i.src = url
    return () => {
      vivant = false
      URL.revokeObjectURL(url)
    }
  }, [fichier])

  return (
    <div className="voile" onClick={onAnnuler}>
      <div className="feuille" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
        <p className="feuille-titre">Recadrer la photo</p>
        {img ? (
          <Cadre img={img} ratio={ratio} sortie={sortie} rond={rond} onValider={onValider} onAnnuler={onAnnuler} />
        ) : (
          <>
            <p className="muted">{erreur ? 'Image illisible (essayez une photo JPEG ou PNG)' : 'Chargement…'}</p>
            <div className="actions" style={{ justifyContent: 'center', marginTop: 10 }}>
              <button type="button" className="btn btn-quiet" onClick={onAnnuler}>
                Annuler
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Le cadre ne s'affiche qu'une fois l'image chargee : img n'est jamais vide ici.
function Cadre({ img, ratio, sortie, rond, onValider, onAnnuler }) {
  const [zoom, setZoom] = useState(1)
  const [off, setOff] = useState({ x: 0, y: 0 })
  const glisse = useRef(null)
  const largeur = Math.min(360, (typeof window !== 'undefined' ? window.innerWidth : 360) - 40)
  const hauteur = Math.round(largeur / ratio)
  const echelle = Math.max(largeur / img.width, hauteur / img.height) * zoom
  // l'image doit toujours couvrir le cadre
  const borne = (p) => {
    const mx = Math.max(0, (img.width * echelle - largeur) / 2)
    const my = Math.max(0, (img.height * echelle - hauteur) / 2)
    return { x: Math.max(-mx, Math.min(mx, p.x)), y: Math.max(-my, Math.min(my, p.y)) }
  }
  const o = borne(off)
  const gauche = largeur / 2 - (img.width * echelle) / 2 + o.x
  const haut = hauteur / 2 - (img.height * echelle) / 2 + o.y

  function debut(e) {
    glisse.current = { x: e.clientX - o.x, y: e.clientY - o.y }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  function deplace(e) {
    if (!glisse.current) return
    setOff(borne({ x: e.clientX - glisse.current.x, y: e.clientY - glisse.current.y }))
  }
  const fin = () => {
    glisse.current = null
  }

  function valider() {
    const c = document.createElement('canvas')
    c.width = sortie
    c.height = Math.round(sortie / ratio)
    c.getContext('2d').drawImage(img.el, -gauche / echelle, -haut / echelle, largeur / echelle, hauteur / echelle, 0, 0, c.width, c.height)
    onValider(c.toDataURL('image/jpeg', 0.82))
  }

  return (
    <>
      <p className="muted" style={{ fontSize: 13, margin: '-4px 0 10px' }}>
        Faites glisser l’image pour la placer, puis zoomez si besoin.
      </p>
      <div
        className="recadre-cadre"
        style={{ width: largeur, height: hauteur, borderRadius: rond ? '50%' : 14 }}
        onPointerDown={debut}
        onPointerMove={deplace}
        onPointerUp={fin}
        onPointerCancel={fin}
      >
        <img src={img.src} alt="" draggable={false} style={{ width: img.width * echelle, height: img.height * echelle, transform: `translate(${gauche}px, ${haut}px)` }} />
      </div>
      <input type="range" min="1" max="3" step="0.02" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="recadre-zoom" aria-label="Zoom" />
      <div className="actions" style={{ justifyContent: 'center', marginTop: 10 }}>
        <button type="button" className="btn" onClick={valider}>
          Utiliser cette photo
        </button>
        <button type="button" className="btn btn-quiet" onClick={onAnnuler}>
          Annuler
        </button>
      </div>
    </>
  )
}
