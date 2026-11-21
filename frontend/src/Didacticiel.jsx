import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { useAuth } from './auth.jsx'
import { themeAChoisir } from './theme.js'

// Didacticiel, a la maniere des jeux mobiles : un guide accompagne le nouvel utilisateur page apres page.
// - A la premiere ouverture de chaque page, une courte visite met en lumiere ses elements, un par un.
// - Une main animee montre ou toucher ; aux etapes « Touchez… », c'est l'element lui-meme qu'il faut toucher
//   pour continuer (la page suivante prend alors le relais avec sa propre visite).
// - Un parcours different pour chaque type de compte (etablissement, enseignant, parent, eleve).
// - Seuls les comptes crees a partir du 19 novembre 2026 sont accompagnes automatiquement ; chacun peut
//   relancer le didacticiel depuis le Profil (ou le Guide).

// Comptes accompagnes automatiquement (les anciens comptes connaissent deja l'application)
const DEBUT = '2026-11-19T22:45:00Z'

const nav = (route) => `.nav a[href="#${route}"]`
const tuile = (route) => `.grille-tuiles a[href="#${route}"]`

const MESSAGES = [{ titre: 'Vos messages', texte: 'Écrivez directement à l’établissement, aux parents ou aux enseignants. Les réponses arrivent ici.' }]
const PROFIL = [
  { titre: 'Votre profil', texte: 'Vos informations, votre mot de passe, le thème clair ou sombre et les notifications.' },
  { titre: 'Besoin d’aide ?', texte: 'Dans « Aide », retrouvez ce didacticiel, le guide de démarrage et les questions fréquentes.' },
]
const NOTIFICATIONS = [{ titre: 'Vos notifications', texte: 'Absences, notes, paiements, messages : tout ce qui vous concerne arrive ici.' }]

const PARCOURS = {
  principal: {
    '/': [
      { titre: 'Bienvenue sur Sùkûl !', texte: 'Je vais vous accompagner pendant vos premiers pas. Suivez-moi : cela ne prend que quelques secondes à chaque page.' },
      { cible: tuile('/eleves'), titre: 'Vos élèves', texte: 'Toutes vos classes et la fiche de chaque élève. Vous pourrez importer vos listes en un geste.' },
      { cible: tuile('/presence-enseignants'), titre: 'Vos enseignants', texte: 'Qui est en cours, qui est absent, et la liste complète de votre équipe.' },
      { cible: tuile('/scolarite'), titre: 'La scolarité', texte: 'Les frais, les paiements des familles et ce qui reste à encaisser.' },
      { cible: nav('/encaisser'), action: true, titre: 'Encaisser', texte: 'Le guichet de votre intendance. Touchez « Encaisser » pour le découvrir.' },
    ],
    '/encaisser': [
      { cible: '.gu-form', titre: 'Choisissez l’élève', texte: 'Sa classe puis son nom, ou recherchez-le. Ses frais à payer s’affichent aussitôt.' },
      { cible: '.gu-caisse', titre: 'La caisse du jour', texte: 'Le total encaissé, le détail par mode de paiement et le brouillard de caisse à imprimer.' },
      { cible: '[aria-label="Réglages d’impression"]', titre: 'Vos reçus', texte: 'Choisissez le format : A4 avec souche à détacher, A5 ou ticket de caisse.' },
      { cible: '.nav .nav-plus', action: true, titre: 'Actions rapides', texte: 'Informer les familles, ajouter un document, saisir des absences… Touchez « + ».' },
    ],
    '/eleves': [
      { cible: '.eleves-tete .bouton-icone', titre: 'Importer vos listes', texte: 'Excel, PDF ou simple photo de la liste : les élèves et les classes sont créés automatiquement.' },
      { cible: '.eleves-recherche', titre: 'Retrouver un élève', texte: 'Tapez son nom ou son prénom.' },
      { cible: '.eleves-classes', titre: 'Vos classes', texte: 'Touchez une classe pour voir ses élèves, ses parents et son emploi du temps.' },
    ],
    '/presence-enseignants': [
      { cible: '.segments', titre: 'La journée et l’équipe', texte: '« Journée » : les cours, les appels et les absences du jour. « Liste des enseignants » : toute votre équipe.' },
      { cible: '.page-tete .bouton-icone', titre: 'Importer vos enseignants', texte: 'Leur liste (matières, classes) : ils sont reconnus dès qu’ils créent leur compte.' },
    ],
    '/scolarite': [
      { cible: '.segments', titre: 'Suivi, confirmations et frais', texte: '« Suivi » : qui a payé. « À confirmer » : les paiements Mobile Money des parents. « Frais » : vos montants et échéances.' },
    ],
    '/absences': [{ titre: 'Les absences du jour', texte: 'Classe par classe, les élèves absents aujourd’hui. Vous pouvez aussi importer une liste d’absences.' }],
  },
  teacher: {
    '/': [
      { titre: 'Bienvenue sur Sùkûl !', texte: 'Je vais vous accompagner pendant vos premiers pas. Suivez-moi : cela ne prend que quelques secondes à chaque page.' },
      { cible: '.ens-agenda', titre: 'Votre journée', texte: 'Le cours du moment : confirmez d’un geste que vous êtes en cours et faites l’appel.' },
      { cible: '.ens-espaces', titre: 'Établissements et espace parent', texte: 'Passez d’un établissement à l’autre, ou ouvrez votre espace parent pour suivre vos enfants.' },
      { cible: '.nav-plus', titre: 'Le bouton +', texte: 'Faire l’appel, écrire aux parents, informer, programmer un cours en plus ou signaler une absence.' },
    ],
    '/emploi': [{ titre: 'Votre emploi du temps', texte: 'Tous vos cours de la semaine, jour par jour. Il est saisi par l’établissement.' }],
    '/mes-cours': [
      { cible: '.jour-nav', titre: 'Changer de jour', texte: 'Revenez sur les jours précédents pour compléter le cahier de textes.' },
      { cible: '.mc-liste', titre: 'Vos cours', texte: 'Pour chaque cours : « Je suis en cours », le cahier de textes et l’appel.' },
    ],
    '/info': [{ titre: 'Informer', texte: 'Écrivez votre message, ajoutez des photos si besoin : vos élèves et leurs parents sont prévenus.' }],
    '/mes-etablissements': [{ titre: 'Vos établissements', texte: 'Vous enseignez dans plusieurs établissements ? Ajoutez-les tous et passez de l’un à l’autre d’un geste.' }],
    '/mon-absence': [{ titre: 'Prévenir d’une absence', texte: 'Indiquez vos jours d’absence : l’établissement est prévenu et vos cours sont signalés.' }],
  },
  parent: {
    '/': [
      { titre: 'Bienvenue sur Sùkûl !', texte: 'Je vais vous accompagner pendant vos premiers pas. Suivez-moi : cela ne prend que quelques secondes à chaque page.' },
      { cible: 'a.enfant-carte[href="#/trouver-eleve"]', action: true, titre: 'Votre enfant', texte: 'Commençons par retrouver votre enfant. Touchez « Mon enfant ».' },
    ],
    '/trouver-eleve': [{ titre: 'Retrouver votre enfant', texte: 'Choisissez son établissement, puis sa classe, et confirmez avec sa date de naissance. Ses notes, absences et devoirs arriveront sur votre accueil.' }],
    '/scolarite': [{ titre: 'La scolarité', texte: 'Les frais de votre enfant, ce qui est payé et ce qui reste. Payez par Mobile Money : le reçu est émis automatiquement.' }],
  },
  student: {
    '/': [
      { titre: 'Bienvenue sur Sùkûl !', texte: 'Je vais vous accompagner pendant vos premiers pas. Suivez-moi : cela ne prend que quelques secondes à chaque page.' },
      { cible: nav('/scolarite'), action: true, titre: 'Votre scolarité', texte: 'Touchez « Scolarité » pour voir vos frais et ce qui est déjà payé.' },
    ],
    '/scolarite': [{ titre: 'Votre scolarité', texte: 'Les frais de l’année, les paiements déjà faits et les reçus.' }],
  },
}
for (const role of Object.keys(PARCOURS)) {
  PARCOURS[role]['/messages'] = MESSAGES
  PARCOURS[role]['/compte'] = PROFIL
  PARCOURS[role]['/notifications'] = NOTIFICATIONS
}

// Pages deja visitees avec le guide (par compte, sur cet appareil)
const cle = (u) => `sukul-tuto-${u.id}-${u.role}`
const lireVues = (u) => {
  try {
    return JSON.parse(localStorage.getItem(cle(u)) || '[]')
  } catch (_) {
    return ['*']
  }
}
const noterVue = (u, route) => {
  try {
    localStorage.setItem(cle(u), JSON.stringify([...new Set([...lireVues(u), route])]))
  } catch (_) {
    /* stockage indisponible */
  }
}
const toutRevoir = (u) => {
  try {
    localStorage.removeItem(cle(u))
  } catch (_) {
    /* stockage indisponible */
  }
}

// Relance du didacticiel (Profil, Guide) : toutes les pages seront de nouveau accompagnees
export const lancerDidacticiel = () => window.dispatchEvent(new Event('sukul-didacticiel'))

const routeActuelle = () => (window.location.hash.replace(/^#/, '') || '/').split('?')[0]
const visible = (el) => {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}
const trouver = (selecteur) => (selecteur ? [...document.querySelectorAll(selecteur)].find(visible) || null : null)
const pretPourGuide = () => !document.getElementById('demarrage') && !themeAChoisir() && !document.querySelector('.premier-theme, .voile, .tuto')

export default function Didacticiel() {
  const { user } = useAuth()
  const parcours = user ? PARCOURS[user.role] : null
  const nouveau = Boolean(user?.createdAt && new Date(user.createdAt) >= new Date(DEBUT))
  const [force, setForce] = useState(false) // relance manuelle (anciens comptes compris)
  const [route, setRoute] = useState(routeActuelle)
  const [visite, setVisite] = useState(null) // { route, etapes }
  const [n, setN] = useState(0)
  const [cadre, setCadre] = useState(null)

  useEffect(() => {
    const maj = () => setRoute(routeActuelle())
    window.addEventListener('hashchange', maj)
    return () => window.removeEventListener('hashchange', maj)
  }, [])

  const relancer = useCallback(() => {
    if (!user) return
    toutRevoir(user)
    setForce(true)
    setVisite(null)
    if (routeActuelle() !== '/') window.location.hash = '/'
    else setRoute('/ ') // force le recalcul de la page d'accueil
  }, [user])
  useEffect(() => {
    window.addEventListener('sukul-didacticiel', relancer)
    return () => window.removeEventListener('sukul-didacticiel', relancer)
  }, [relancer])

  // A chaque page : visite de la page si elle n'a pas encore ete faite
  useEffect(() => {
    const r = route.trim()
    if (!user || !parcours || !(nouveau || force) || visite) return undefined
    if (user.role === 'teacher' && !user.schoolId) return undefined
    const etapes = parcours[r]
    if (!etapes || lireVues(user).includes(r) || lireVues(user).includes('*')) return undefined
    let essais = 0
    const t = setInterval(() => {
      essais += 1
      if (routeActuelle() !== r) return clearInterval(t)
      // la page est affichee (au moins un element a montrer) et rien ne la recouvre
      const presentes = etapes.filter((e) => !e.cible || trouver(e.cible))
      const pageChargee = etapes.every((e) => !e.cible) ? essais >= 2 : presentes.some((e) => e.cible)
      if (pretPourGuide() && pageChargee) {
        clearInterval(t)
        setN(0)
        setVisite({ route: r, etapes: presentes })
      } else if (essais > 40) clearInterval(t)
    }, 500)
    return () => clearInterval(t)
  }, [route, user, parcours, nouveau, force, visite])

  // Element a mettre en lumiere : amene a l'ecran, puis mesure (et suivi si la page bouge)
  const etape = visite ? visite.etapes[n] : null
  useLayoutEffect(() => {
    if (!etape?.cible) {
      setCadre(null)
      return undefined
    }
    const el = trouver(etape.cible)
    if (!el) {
      setCadre(null)
      return undefined
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const mesurer = () => {
      const r = el.getBoundingClientRect()
      setCadre({ x: r.left, y: r.top, l: r.width, h: r.height, el })
    }
    mesurer()
    const t = setTimeout(mesurer, 450)
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
    noterVue(user, visite.route)
    setVisite(null)
    setCadre(null)
  }
  const toutPasser = () => {
    for (const r of Object.keys(parcours)) noterVue(user, r)
    setForce(false)
    setVisite(null)
    setCadre(null)
  }
  const derniere = n === visite.etapes.length - 1
  const suivant = () => (derniere ? finir() : setN(n + 1))
  // Etape « Touchez… » : c'est l'element lui-meme qui fait avancer
  const toucher = () => {
    const el = cadre?.el
    finir()
    el?.click()
  }

  const marge = 6
  const H = window.innerHeight
  const W = window.innerWidth
  const largeur = Math.min(W - 24, 360)
  let style = { width: largeur, left: (W - largeur) / 2, top: '50%', transform: 'translateY(-50%)' }
  if (cadre) {
    const gauche = Math.min(Math.max(12, cadre.x + cadre.l / 2 - largeur / 2), W - largeur - 12)
    const dessous = cadre.y + cadre.h + marge + (etape.action ? 64 : 16)
    style = H - dessous > 200 ? { width: largeur, left: gauche, top: dessous } : { width: largeur, left: gauche, bottom: H - cadre.y + marge + (etape.action ? 60 : 16) }
  }
  const mainEnHaut = cadre && !(H - (cadre.y + cadre.h) > 200)

  return (
    <div className="tuto" role="dialog" aria-modal="true" aria-label="Didacticiel">
      <div className="tuto-voile" />
      {cadre ? (
        <div className={`tuto-spot ${etape.action ? 'action' : ''}`} style={{ left: cadre.x - marge, top: cadre.y - marge, width: cadre.l + marge * 2, height: cadre.h + marge * 2 }} />
      ) : (
        <div className="tuto-fond" />
      )}
      {cadre && etape.action && (
        <>
          <button type="button" className="tuto-cible" aria-label={etape.titre} style={{ left: cadre.x - marge, top: cadre.y - marge, width: cadre.l + marge * 2, height: cadre.h + marge * 2 }} onClick={toucher} />
          <span className={`tuto-main ${mainEnHaut ? 'haut' : ''}`} aria-hidden="true" style={{ left: cadre.x + cadre.l / 2 - 18, top: mainEnHaut ? cadre.y - 52 : cadre.y + cadre.h + 4 }}>
            <svg width="36" height="40" viewBox="0 0 36 40" fill="none">
              <path d="M14 4.5a3 3 0 0 1 6 0V18l1.2-.4a3 3 0 0 1 3.6 1.6l.3.6 1.3-.3a3 3 0 0 1 3.4 1.9l.2.6.9-.1a3 3 0 0 1 3.3 3v6.3c0 4.8-3.9 8.8-8.8 8.8h-4.6a8.8 8.8 0 0 1-7.1-3.6l-6.6-9a2.9 2.9 0 0 1 4.3-3.9L14 25V4.5z" fill="#fff" stroke="#0d1424" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          </span>
        </>
      )}
      <div className="tuto-bulle" style={style}>
        <div className="tuto-tete">
          <span className="tuto-guide" aria-hidden="true">
            S<i>.</i>
          </span>
          <span className="tuto-titre">
            <b>{etape.titre}</b>
            {visite.etapes.length > 1 && <small>{`${n + 1} / ${visite.etapes.length}`}</small>}
          </span>
        </div>
        <p>{etape.texte}</p>
        <div className="tuto-boutons">
          <button type="button" className="tuto-passer" onClick={toutPasser}>
            Passer le didacticiel
          </button>
          <span className="tuto-espace" />
          {!(etape.action && cadre) && (
            <button type="button" className="btn" onClick={suivant}>
              {derniere ? 'Compris' : 'Suivant'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
