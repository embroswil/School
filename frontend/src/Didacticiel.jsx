import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { useAuth } from './auth.jsx'
import { themeAChoisir } from './theme.js'

// Didacticiel : visite guidee de l'application, etape par etape, adaptee au profil.
// Chaque etape met en lumiere un element de l'ecran (tuile, bouton de navigation…) avec une courte explication.
// Il se lance seul a la premiere connexion (une fois par compte et par appareil) et se relance depuis le Profil
// ou le Guide. Les memes reperes existent sur telephone (barre du bas) et sur ordinateur (barre laterale).
const BIENVENUE = { titre: 'Bienvenue sur Sùkûl', texte: 'Voici l’essentiel pour bien démarrer. Cela prend moins d’une minute.' }
const MESSAGES = { cible: '.nav a[href="#/messages"]', titre: 'Messages', texte: 'Échangez directement avec l’établissement, les parents et les enseignants.' }
const PROFIL = (texte) => ({ cible: '.nav a[href="#/compte"]', titre: 'Votre profil', texte })

const ETAPES = {
  principal: [
    BIENVENUE,
    { cible: '.grille-tuiles a[href="#/eleves"]', titre: 'Vos élèves', texte: 'Importez vos listes (Excel, PDF ou photo) : les classes se créent toutes seules. Chaque élève a sa fiche.' },
    { cible: '.grille-tuiles a[href="#/presence-enseignants"]', titre: 'Vos enseignants', texte: 'Importez la liste de vos enseignants et suivez chaque jour qui est en cours et qui est absent.' },
    { cible: '.grille-tuiles a[href="#/scolarite"]', titre: 'La scolarité', texte: 'Fixez les frais et leurs échéances, suivez les paiements des familles et ce qui reste à encaisser.' },
    { cible: '.nav a[href="#/encaisser"]', titre: 'Encaisser', texte: 'Au guichet : choisissez l’élève et les frais payés, puis imprimez le reçu en un geste.' },
    { cible: '.nav .nav-plus', titre: 'Actions rapides', texte: 'Informer les familles, ajouter un document, saisir des absences ou une sanction.' },
    MESSAGES,
    PROFIL('Thème, administrateurs, abonnement… Vous pourrez revoir ce didacticiel ici à tout moment.'),
  ],
  teacher: [
    BIENVENUE,
    { cible: '.cours-moment', titre: 'Votre cours du moment', texte: 'Confirmez d’un geste que vous êtes en cours, faites l’appel et remplissez le cahier de textes.' },
    { cible: '.grille-tuiles a[href="#/emploi"]', titre: 'Emploi du temps', texte: 'Tous vos cours de la semaine, classe par classe.' },
    { cible: '.grille-tuiles a[href="#/info"]', titre: 'Informer', texte: 'Prévenez vos élèves et leurs parents : information, cours supplémentaire, photos.' },
    MESSAGES,
    PROFIL('Vos établissements, le thème… Vous pourrez revoir ce didacticiel ici à tout moment.'),
  ],
  parent: [
    BIENVENUE,
    { cible: 'a.enfant-carte[href="#/trouver-eleve"]', titre: 'Votre enfant', texte: 'Retrouvez-le dans son établissement : ses notes, absences et devoirs arrivent ici.' },
    { cible: '.nav a[href="#/scolarite"]', titre: 'Scolarité', texte: 'Consultez les frais et payez par Mobile Money : le reçu est émis automatiquement.' },
    MESSAGES,
    PROFIL('Thème, notifications… Vous pourrez revoir ce didacticiel ici à tout moment.'),
  ],
  student: [
    BIENVENUE,
    { cible: '.nav a[href="#/scolarite"]', titre: 'Scolarité', texte: 'Les frais de scolarité et ce qui a déjà été payé.' },
    MESSAGES,
    PROFIL('Thème, notifications… Vous pourrez revoir ce didacticiel ici à tout moment.'),
  ],
}

const cleVu = (u) => `sukul-didacticiel-${u.id}-${u.role}`
const dejaVu = (u) => {
  try {
    return localStorage.getItem(cleVu(u)) === '1'
  } catch (_) {
    return true
  }
}
const noterVu = (u) => {
  try {
    localStorage.setItem(cleVu(u), '1')
  } catch (_) {
    /* stockage indisponible */
  }
}

// Relance du didacticiel (Profil, Guide)
export const lancerDidacticiel = () => window.dispatchEvent(new Event('sukul-didacticiel'))

// Premier element visible correspondant a l'etape
const trouver = (selecteur) => {
  if (!selecteur) return null
  for (const el of document.querySelectorAll(selecteur)) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}

export default function Didacticiel() {
  const { user } = useAuth()
  const etapes = user ? ETAPES[user.role] : null
  const [actif, setActif] = useState(false)
  const [n, setN] = useState(0)
  const [cadre, setCadre] = useState(null)

  const demarrer = useCallback(() => {
    if (!etapes) return
    if (window.location.hash !== '#/' && window.location.hash !== '') window.location.hash = '/'
    setN(0)
    setActif(true)
  }, [etapes])

  // Relance demandee depuis le Profil ou le Guide
  useEffect(() => {
    window.addEventListener('sukul-didacticiel', demarrer)
    return () => window.removeEventListener('sukul-didacticiel', demarrer)
  }, [demarrer])

  // Premiere connexion : une fois l'ecran de demarrage et le choix du theme passes, sur l'accueil
  useEffect(() => {
    // (enseignant pas encore rattache a un etablissement : d'abord rejoindre son etablissement)
    if (!user || !etapes || dejaVu(user) || (user.role === 'teacher' && !user.schoolId)) return undefined
    let essais = 0
    const t = setInterval(() => {
      essais += 1
      const pret = !document.getElementById('demarrage') && !themeAChoisir() && !document.querySelector('.premier-theme') && (window.location.hash === '#/' || window.location.hash === '')
      if (pret) {
        clearInterval(t)
        setN(0)
        setActif(true)
      } else if (essais > 60) clearInterval(t)
    }, 1000)
    return () => clearInterval(t)
  }, [user, etapes])

  // Element a mettre en lumiere : amene a l'ecran, puis mesure (et suivi si la page bouge)
  const etape = actif && etapes ? etapes[n] : null
  useLayoutEffect(() => {
    if (!etape) return undefined
    const el = trouver(etape.cible)
    if (!el) {
      setCadre(null)
      return undefined
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const mesurer = () => {
      const r = el.getBoundingClientRect()
      setCadre({ x: r.left, y: r.top, l: r.width, h: r.height })
    }
    mesurer()
    const t = setTimeout(mesurer, 400)
    window.addEventListener('resize', mesurer)
    window.addEventListener('scroll', mesurer, true)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', mesurer)
      window.removeEventListener('scroll', mesurer, true)
    }
  }, [etape])

  if (!etape) return null
  const finir = () => {
    noterVu(user)
    setActif(false)
    setCadre(null)
  }
  const derniere = n === etapes.length - 1
  const marge = 6
  // Bulle sous l'element s'il y a la place, sinon au-dessus ; au centre pour l'accueil
  const H = window.innerHeight
  const W = window.innerWidth
  const largeur = Math.min(W - 24, 340)
  let style = { width: largeur, left: (W - largeur) / 2, top: '50%', transform: 'translateY(-50%)' }
  if (cadre) {
    const gauche = Math.min(Math.max(12, cadre.x + cadre.l / 2 - largeur / 2), W - largeur - 12)
    const dessous = cadre.y + cadre.h + marge + 14
    style = H - dessous > 190 ? { width: largeur, left: gauche, top: dessous } : { width: largeur, left: gauche, bottom: H - cadre.y + marge + 14 }
  }

  return (
    <div className="tuto" role="dialog" aria-modal="true" aria-label="Didacticiel">
      <div className="tuto-voile" onClick={(e) => e.stopPropagation()} />
      {cadre ? (
        <div className="tuto-spot" style={{ left: cadre.x - marge, top: cadre.y - marge, width: cadre.l + marge * 2, height: cadre.h + marge * 2 }} />
      ) : (
        <div className="tuto-fond" />
      )}
      <div className="tuto-bulle" style={style}>
        <span className="tuto-etape">{`${n + 1} / ${etapes.length}`}</span>
        <b>{etape.titre}</b>
        <p>{etape.texte}</p>
        <div className="tuto-boutons">
          {!derniere && (
            <button type="button" className="tuto-passer" onClick={finir}>
              Passer
            </button>
          )}
          <span className="tuto-espace" />
          {n > 0 && (
            <button type="button" className="btn btn-quiet" onClick={() => setN(n - 1)}>
              Précédent
            </button>
          )}
          <button type="button" className="btn" onClick={() => (derniere ? finir() : setN(n + 1))}>
            {derniere ? 'Terminer' : n === 0 ? 'Commencer' : 'Suivant'}
          </button>
        </div>
      </div>
    </div>
  )
}
