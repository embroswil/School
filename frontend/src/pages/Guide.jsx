import { useState } from 'react'
import { useAuth } from '../auth.jsx'

// Guide de demarrage, adapte a chaque profil
const GUIDES = {
  principal: [
    ['Importer les élèves', 'Bouton + › Élèves › choisissez le fichier Excel ou PDF de vos listes. Les classes sont créées automatiquement.'],
    ['Inviter les enseignants', 'Ils créent leur compte (profil Enseignant) et choisissent leurs classes ; vous les validez dans + › Enseignants.'],
    ['Désigner les professeurs principaux', 'Élèves › Classes › une classe › Professeur principal.'],
    ['Régler la scolarité', 'Scolarité › Frais (montants, échéances) puis Réglages (numéros Orange Money et MTN, téléphone).'],
    ['Encaisser au guichet', 'Bouton + › Encaisser : le reçu est émis et le statut « Scolarité réglée » se met à jour.'],
    ['Confirmer les paiements des parents', 'Scolarité › À confirmer : vérifiez votre compte Mobile Money, puis « Confirmer la réception ».'],
    ['Informer les familles', 'Bouton + › Publier (photo, vidéo) ou Annonce (événement, conseil de discipline).'],
  ],
  teacher: [
    ['Choisir mes classes', 'Accueil › Modifier : vos matières et vos classes.'],
    ['Faire l’appel', 'Sur la carte de la classe › Faire l’appel, heure par heure. Les parents des absents sont prévenus.'],
    ['Saisir les notes', 'Notes › Nouvelle évaluation (séquence), saisissez puis publiez : les parents les voient aussitôt.'],
    ['Donner un devoir', 'Sur la carte de la classe › Devoirs.'],
    ['Professeur principal', 'Résultats, coefficients, bulletins trimestriels et conseil de fin d’année.'],
    ['Publier', 'Onglet Publier : photos et vidéos de la vie de la classe.'],
  ],
  parent: [
    ['Retrouver mon enfant', 'Accueil › + Mon enfant › l’établissement › sa classe › « Mon enfant », puis confirmez avec sa date de naissance.'],
    ['Suivre sa scolarité', 'Touchez la carte de l’enfant : notes, rang, absences, devoirs, emploi du temps, discipline.'],
    ['Payer la scolarité', 'Scolarité › Payer : envoyez le montant au numéro indiqué avec le code en motif, puis « J’ai payé ». Ou payez au guichet.'],
    ['Payer pour un autre élève', 'Accueil › Payer une scolarité : un proche, un filleul, un don.'],
    ['Écrire à l’établissement', 'Onglet Messages.'],
    ['Installer l’application', 'Sur iPhone : Safari › Partager › Sur l’écran d’accueil. Sur Android : menu ⋮ › Installer l’application.'],
  ],
}
GUIDES.student = [
  ['Mes notes et mon rang', 'Touchez votre carte sur l’accueil.'],
  ['Mes devoirs et mon emploi du temps', 'Dans votre fiche de suivi.'],
  ['Les actualités de l’établissement', 'Sur l’accueil.'],
]

export default function Guide() {
  const { user } = useAuth()
  const [profil, setProfil] = useState(GUIDES[user.role] ? user.role : 'parent')
  return (
    <>
      <h1 className="page-title">Guide de démarrage</h1>
      {user.role === 'admin' || user.role === 'principal' ? (
        <div className="chips">
          {[
            ['principal', 'Établissement'],
            ['teacher', 'Enseignant'],
            ['parent', 'Parent'],
          ].map(([k, v]) => (
            <button key={k} type="button" className="chip" aria-pressed={profil === k} onClick={() => setProfil(k)}>
              {v}
            </button>
          ))}
        </div>
      ) : null}
      <ol className="guide">
        {GUIDES[profil].map(([t, d], i) => (
          <li key={t}>
            <span className="guide-num">{i + 1}</span>
            <div>
              <b>{t}</b>
              <p className="muted">{d}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="muted" style={{ fontSize: 14, marginTop: 16 }}>
        <a href="#/confidentialite">Politique de confidentialité</a> · <a href="#/conditions">Conditions d’utilisation</a>
      </p>
    </>
  )
}
