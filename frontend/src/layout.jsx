import { useEffect, useState } from 'react'
import { api } from './api.js'
import { useAuth } from './auth.jsx'
import { BandeauInstallation } from './installation.jsx'
import { EncartPush, SynchroPush } from './push.jsx'
import { DrapeauLangue } from './i18n.jsx'
import { DepotGlobal } from './depot.jsx'
import { IcAccueil, IcActus, IcCarte, IcCloche, IcEcole, IcEleves, IcImport, IcMessages, IcPhoto, IcPlus, IcProfil, IcRetour } from './icones.jsx'

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
    ['/eleves', IcEleves, 'Élèves'],
    ['+', IcPlus, 'Ajouter'],
    ['/messages', IcMessages, 'Messages'],
    ['/compte', IcProfil, 'Profil'],
  ],
  teacher: [
    ['/', IcAccueil, 'Accueil'],
    ['/info', IcPlus, 'Informer'],
    ['/messages', IcMessages, 'Messages'],
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
    ['/scolarite', IcCarte, 'Scolarité'],
    ['/presence-enseignants', IcEcole, 'Enseignants'],
    ['/absences', IcEleves, 'Absences du jour'],
    ['/document', IcActus, 'Documents'],
    ['/abonnement', IcCarte, 'Abonnement'],
  ],
  teacher: [
    ['/emploi', IcEcole, 'Emploi du temps'],
    ['/document', IcActus, 'Documents'],
    ['/mon-absence', IcProfil, 'Mon absence'],
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
  '/infos': 'Information',
  '/guide': 'Guide',
  '/installer': 'Installer School',
  '/absences': 'Absences du jour',
  '/confidentialite': 'Confidentialité',
  '/conditions': 'Conditions',
  '/scolarite': 'Scolarité',
  '/import-eleves': 'Importer des élèves',
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
  '/recus': 'Reçu',
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
  ['/info', IcActus, 'Informer', 'Info, cours, photos'],
  ['/document', IcImport, 'Document', 'PDF ou photo'],
  ['/scolarite', IcCarte, 'Encaisser', 'Paiement au guichet'],
  ['/absences', IcEleves, 'Absences', 'Élèves du jour'],
  ['/presence-enseignants', IcPhoto, 'Enseignants', 'Cours assurés'],
  ['/import-eleves', IcPlus, 'Élèves', 'Importer une liste'],
]

export default function Shell({ path, children }) {
  const { user } = useAuth()
  const items = NAV[user.role] || NAV.parent
  const [compteurs, setCompteurs] = useState({ notifications: 0, messages: 0 })
  const [actions, setActions] = useState(false)
  useEffect(() => {
    setActions(false)
    api
      .get('/api/boite/compteurs')
      .then((r) => setCompteurs(r.data || { notifications: 0, messages: 0 }))
      .catch(() => {})
  }, [path])

  const accueil = path === '/'
  const titre = TITRES[path] || TITRES[`/${path.split('/')[1]}`] || ''
  const isCurrent = (to) => (to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`))

  return (
    <div className="app">
      <header className="topbar">
        {accueil ? (
          <span className="brand">
            School<span>.</span>
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
          School<span>.</span>
        </a>
        {items.map(([to, Icone, label]) =>
          to === '+' ? (
            <button key="+" type="button" className="nav-plus" aria-label="Actions rapides" onClick={() => setActions(true)}>
              <Icone size={26} />
              <span className="nav-plus-texte">Actions rapides</span>
            </button>
          ) : (
            <a key={to} href={`#${to}`} aria-current={isCurrent(to) ? 'page' : undefined}>
              <span className="ico" style={{ position: 'relative' }}>
                <Icone size={23} />
                {to === '/messages' && compteurs.messages > 0 && <span className="pastille">{compteurs.messages}</span>}
              </span>
              <span>{label}</span>
            </a>
          ),
        )}
        {(NAV_ORDI[user.role] || []).map(([to, Icone, label]) => (
          <a key={`o${to}`} href={`#${to}`} className="nav-ordi" aria-current={isCurrent(to) ? 'page' : undefined}>
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
            <p className="feuille-titre">Actions rapides</p>
            <div className="tuiles">
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
          </div>
        </div>
      )}

      <div className="sheet-wrap">
        <main className="sheet">
          {path === '/' && <BandeauInstallation />}
          {path === '/' && <EncartPush />}
          <SynchroPush />
          <DepotGlobal role={user.role} />
          {children}
        </main>
      </div>
    </div>
  )
}
