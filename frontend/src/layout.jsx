import { useEffect, useState } from 'react'
import { api } from './api.js'
import { useAuth } from './auth.jsx'
import { BandeauInstallation } from './installation.jsx'
import { EncartPush, SynchroPush } from './push.jsx'
import { DrapeauLangue, langue, traduire } from './i18n.jsx'
import { DepotGlobal } from './depot.jsx'
import TravauxEnCours from './TravauxEnCours.jsx'
import { precharger } from './prechargement.js'
import { envoisEnAttente, envoyerAttente } from './horsligne.js'
import { IcAccueil, IcActus, IcAppel, IcBillets, IcCarte, IcCasquette, IcCloche, IcCoche, IcDocument, IcEcole, IcEleves, IcFichier, IcImport, IcMegaphone, IcMessages, IcPlus, IcProfil, IcRetour, IcBouclier, IcCalendrier, IcInfo, IcTrombone, IcHorlogePlus, IcTableauNoir, IcAppelListe } from './icones.jsx'

// Appels et notes gardes sur le telephone faute de reseau : rappel discret, envoi a la demande
function EnvoisEnAttente() {
  const [n, setN] = useState(() => envoisEnAttente().length)
  const [horsLigne, setHorsLigne] = useState(() => navigator.onLine === false)
  const [envoi, setEnvoi] = useState(false)
  useEffect(() => {
    const maj = () => {
      setN(envoisEnAttente().length)
      setHorsLigne(navigator.onLine === false)
    }
    window.addEventListener('sukul-envois', maj)
    window.addEventListener('online', maj)
    window.addEventListener('offline', maj)
    return () => {
      window.removeEventListener('sukul-envois', maj)
      window.removeEventListener('online', maj)
      window.removeEventListener('offline', maj)
    }
  }, [])
  if (!n && !horsLigne) return null
  if (!n)
    return (
      <div className="hors-connexion" role="status">
        <b>Hors connexion</b>
        <span>Vous voyez les données gardées sur l’appareil. Ce que vous faites est envoyé dès le retour du réseau.</span>
      </div>
    )
  return (
    <div className="envois-attente" role="status">
      <span>
        <b>{n > 1 ? `${n} envois en attente` : '1 envoi en attente'}</b>
        <small>Gardé sur le téléphone, envoyé dès le retour du réseau</small>
      </span>
      <button
        type="button"
        className="btn btn-quiet"
        disabled={envoi}
        onClick={async () => {
          setEnvoi(true)
          await envoyerAttente()
          setEnvoi(false)
        }}
      >
        {envoi ? 'Envoi…' : 'Envoyer'}
      </button>
    </div>
  )
}

// Barre du bas selon le role. « + » ouvre les actions rapides de l'etablissement.
const NAV = {
  admin: [
    ['/', IcAccueil, 'Accueil'],
    ['/etablissements', IcEcole, 'Écoles'],
    ['/utilisateurs', IcEleves, 'Comptes'],
    ['/compte', IcProfil, 'Profil'],
  ],
  principal: [
    ['/', IcAccueil, 'Accueil'],
    ['/encaisser', IcBillets, 'Encaisser'],
    ['+', IcPlus, 'Ajouter'],
    ['/messages', IcMessages, 'Messages'],
    ['/compte', IcProfil, 'Profil'],
  ],
  // enseignant : Messages flotte en bas a droite (bulle), voir BulleMessages
  teacher: [
    ['/', IcAccueil, 'Accueil'],
    ['+', IcPlus, 'Actions'],
    ['/compte', IcProfil, 'Profil'],
  ],
  parent: [
    ['/', IcAccueil, 'Accueil'],
    ['/scolarite', IcCarte, 'Scolarité'],
    ['/messages', IcMessages, 'Messages'],
    ['/compte', IcProfil, 'Profil'],
  ],
  student: [
    ['/', IcAccueil, 'Accueil'],
    ['/scolarite', IcCarte, 'Scolarité'],
    ['/messages', IcMessages, 'Messages'],
    ['/compte', IcProfil, 'Profil'],
  ],
}

// Sur ordinateur, la barre laterale montre aussi ces raccourcis
const NAV_ORDI = {
  principal: [
    ['/eleves', IcEleves, 'Élèves'],
    ['/scolarite', IcCarte, 'Scolarité'],
    ['/presence-enseignants', IcEcole, 'Enseignants'],
    ['/absences', IcEleves, 'Absences du jour'],
    ['/document', IcActus, 'Documents'],
    ['/abonnement', IcCarte, 'Abonnement'],
  ],
  teacher: [
    ['/mes-cours', IcCoche, 'Mes cours'],
    ['/mes-classes', IcEleves, 'Mes classes'],
    ['/emploi', IcCalendrier, 'Emploi du temps'],
    ['/messages', IcMessages, 'Messages'],
    ['/info', IcMegaphone, 'Informer'],
    ['/document', IcFichier, 'Documents'],
    ['/mes-etablissements', IcEcole, 'Mes établissements'],
  ],
  parent: [['/trouver-eleve', IcEleves, 'Trouver un élève']],
  admin: [
    ['/abonnements', IcCarte, 'Abonnements'],
    ['/litiges', IcActus, 'Litiges'],
  ],
}

// Titre affiche en haut selon la page
const TITRES = {
  '/eleves': 'Élèves',
  '/enseignants': 'Enseignants',
  '/classes': 'Classes',
  '/messages': 'Messages',
  '/compte': 'Mon profil',
  '/notifications': 'Notifications',
  '/actualites': 'Actualités',
  '/publier': 'Documents',
  '/document': 'Documents',
  '/info': 'Information',
  '/presence-enseignants': 'Enseignants',
  '/mon-absence': 'Mon absence',
  '/mes-cours': 'Mes cours',
  '/mes-etablissements': 'Mes établissements',
  '/import-absences-enseignants': 'Absences des enseignants',
  '/infos': 'Information',
  '/guide': 'Guide',
  '/faq': 'Questions fréquentes',
  '/installer': 'Installer Sùkûl',
  '/absences': 'Absences du jour',
  '/confidentialite': 'Confidentialité',
  '/conditions': 'Conditions',
  '/scolarite': 'Scolarité',
  '/encaisser': 'Encaisser',
  '/import-eleves': 'Importer des élèves',
  '/import-enseignants': 'Liste des enseignants',
  '/administrateurs': 'Administrateurs',
  '/import-emplois': 'Emplois du temps',
  '/emplois': 'Emplois du temps',
  '/import-absences': 'Cahier d’appel',
  '/etablissements': 'Établissements',
  '/utilisateurs': 'Comptes',
  '/evaluations': 'Saisie des notes',
  '/suivi': 'Suivi scolaire',
  '/bulletins': 'Bulletins',
  '/devoirs': 'Devoirs',
  '/emploi': 'Emploi du temps',
  '/discipline': 'Discipline',
  '/abonnement': 'Abonnement',
  '/abonnements': 'Abonnements',
  '/quotas-ia': 'Lectures IA',
  '/recus': 'Reçu',
  '/releve': 'Relevé de scolarité',
  '/comptabilite': 'Comptabilité',
  '/dossier': 'Dossier de l’établissement',
  '/verifier': 'Vérifier un paiement',
  '/ordres': 'Paiement',
  '/trouver-eleve': 'Trouver un élève',
  '/payer': 'Payer la scolarité',
  '/rattachements': 'Demandes des parents',
  '/litiges': 'Litiges',
  '/annuel': 'Fin d’année',
  '/notes': 'Notes',
  '/mes-classes': 'Mes classes',
}

const ACTIONS = [
  ['/info', IcMegaphone, 'Informer', 'Info, cours, photos'],
  ['/document', IcFichier, 'Document', 'PDF, photo, Excel…'],
  ['/absences', IcAppel, 'Absences', 'Élèves du jour'],
  ['/discipline', IcBouclier, 'Discipline', 'Procès-verbal, sanctions'],
]

// Bouton + de l'enseignant : le cours du moment, puis 4 actions en petites tuiles (icones propres a l'enseignant)
const ACTIONS_ENS = [
  ['/info', IcInfo, 'Informer', 'Info, événement, photos'],
  ['/document', IcTrombone, 'Document', 'PDF, photo, Excel…'],
  ['/info?genre=cours', IcHorlogePlus, 'Cours en plus', 'Hors emploi du temps'],
  ['/mes-classes', IcTableauNoir, 'Mes classes', 'Notes, devoirs, appel'],
]
function ActionsEnseignant() {
  const [v, setV] = useState(null)
  useEffect(() => {
    api
      .get('/api/presence-enseignants/mes-cours')
      .then((r) => setV(r.data))
      .catch(() => {})
  }, [])
  const t = v?.maintenant || ''
  const cours = (v?.cours || []).find((c) => c.debut <= t && t < c.fin)
  return (
    <>
      {cours && (
        <div className="act-cours">
          <small>En cours · {`${cours.debut} – ${cours.fin}`}</small>
          <b data-brut>{`${cours.classe} · ${cours.matiere || ''}`}</b>
          <div>
            <a className="btn" href={`#/classes/${cours.class_id}/appel`}>
              <IcAppelListe size={17} /> {cours.appel ? 'Appel fait' : 'Faire l’appel'}
            </a>
            <a className="btn btn-quiet" href="#/mes-cours">
              <IcCoche size={17} /> Cahier de textes
            </a>
          </div>
        </div>
      )}
      <div className="act-tuiles">
        {ACTIONS_ENS.map(([to, Icone, t2, st]) => (
          <a key={to} href={`#${to}`}>
            <span className="act-ico">
              <Icone size={19} />
            </span>
            <b>{t2}</b>
            <small>{st}</small>
          </a>
        ))}
      </div>
    </>
  )
}

export default function Shell({ path, children }) {
  const { user } = useAuth()
  const items = NAV[user.role] || NAV.parent
  const [compteurs, setCompteurs] = useState({ notifications: 0, messages: 0 })
  const [actions, setActions] = useState(false)
  // espace enseignant : sa propre couleur (voir index.css)
  useEffect(() => {
    document.documentElement.classList.toggle('espace-enseignant', user.role === 'teacher')
    return () => document.documentElement.classList.remove('espace-enseignant')
  }, [user.role])
  // travail sans reseau : pages utiles gardees sur l'appareil des l'ouverture
  useEffect(() => {
    const t = setTimeout(precharger, 5000)
    const enLigne = () => setTimeout(precharger, 3000)
    window.addEventListener('online', enLigne)
    return () => {
      clearTimeout(t)
      window.removeEventListener('online', enLigne)
    }
  }, [user.id, user.schoolId])
  useEffect(() => {
    setActions(false)
    api
      .get('/api/boite/compteurs')
      .then((r) => setCompteurs(r.data || { notifications: 0, messages: 0 }))
      .catch(() => {})
  }, [path])

  const accueil = path === '/'
  const chemin = path.split('?')[0]
  const titre = (user.role === 'teacher' && chemin.startsWith('/classes') ? 'Mes classes' : '') || TITRES[chemin] || TITRES[`/${chemin.split('/')[1]}`] || ''
  const isCurrent = (to) => (to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`))
  // Sur ordinateur, la barre laterale est rangee par ordre alphabetique (dans la langue affichee)
  const libelles = [...items.filter(([to]) => to !== '+'), ...(NAV_ORDI[user.role] || [])].map(([to, , label]) => [to, traduire(label)])
  libelles.sort((a, b) => a[1].localeCompare(b[1], langue, { sensitivity: 'base' }))
  const rang = (to) => ({ '--rang': 2 + libelles.findIndex(([t]) => t === to) })

  return (
    <div className="app">
      <header className="topbar">
        {accueil ? (
          <span className="brand">
            Sùkûl<span>.</span>
          </span>
        ) : (
          <div className="topbar-titre">
            <button type="button" className="icon-btn" aria-label="Retour" onClick={() => (window.history.length > 1 ? window.history.back() : (window.location.hash = '/'))}>
              <IcRetour />
            </button>
            <span>{titre}</span>
          </div>
        )}
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <DrapeauLangue />
        <a href="#/notifications" className="icon-btn" aria-label="Notifications">
          <IcCloche />
          {compteurs.notifications > 0 && <span className="pastille">{compteurs.notifications}</span>}
        </a>
        </span>
      </header>

      <nav className="nav" aria-label="Navigation principale">
        <a href="#/" className="nav-marque">
          Sùkûl<span>.</span>
        </a>
        {items.map(([to, Icone, label]) =>
          to === '+' ? (
            <button key="+" type="button" className="nav-plus" aria-label="Actions rapides" onClick={() => setActions(true)}>
              <Icone size={26} />
              <span className="nav-plus-texte">Actions rapides</span>
            </button>
          ) : (
            <a key={to} href={`#${to}`} style={rang(to)} aria-current={isCurrent(to) ? 'page' : undefined}>
              <span className="ico" style={{ position: 'relative' }}>
                <Icone size={23} />
                {to === '/messages' && compteurs.messages > 0 && <span className="pastille">{compteurs.messages}</span>}
              </span>
              <span>{label}</span>
            </a>
          ),
        )}
        {(NAV_ORDI[user.role] || []).map(([to, Icone, label]) => (
          <a key={`o${to}`} href={`#${to}`} className="nav-ordi" style={rang(to)} aria-current={isCurrent(to) ? 'page' : undefined}>
            <span className="ico">
              <Icone size={21} />
            </span>
            <span>{label}</span>
          </a>
        ))}
      </nav>

      {actions && (
        <div className="voile" onClick={() => setActions(false)}>
          <div className="feuille" onClick={(e) => e.stopPropagation()}>
            <div className="feuille-poignee" />
            <p className="feuille-titre">{user.role === 'teacher' ? 'Que voulez-vous faire ?' : 'Actions rapides'}</p>
            {user.role === 'teacher' ? (
              <ActionsEnseignant />
            ) : (
            <div className="tuiles tuiles-actions">
              {ACTIONS.map(([to, Icone, t, st]) => (
                <a key={to} className="tuile" href={`#${to}`}>
                  <span className="tuile-ico">
                    <Icone size={22} />
                  </span>
                  <b>{t}</b>
                  <span>{st}</span>
                </a>
              ))}
            </div>
            )}
          </div>
        </div>
      )}

      {user.role === 'teacher' && chemin === '/' && (
        <a href="#/messages" className="bulle-messages" aria-label="Messages">
          <IcMessages size={24} />
          {compteurs.messages > 0 && <span className="pastille">{compteurs.messages}</span>}
        </a>
      )}

      <div className="sheet-wrap">
        <main className="sheet">
          <EnvoisEnAttente />
          {path === '/' && <BandeauInstallation />}
          {path === '/' && <EncartPush />}
          <SynchroPush />
          <DepotGlobal role={user.role} />
          {['principal', 'admin'].includes(user.role) && <TravauxEnCours path={path} />}
          {children}
        </main>
      </div>
    </div>
  )
}
