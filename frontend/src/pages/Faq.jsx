import { useState } from 'react'
import { useAuth } from '../auth.jsx'
import { PageAuth } from '../ui.jsx'
import { IcChevron } from '../icones.jsx'

// Questions frequentes : une liste depliable, question par question.
// Accessible sans compte (accueil, inscription) et depuis le Profil.
const QUESTIONS = [
  [
    'Faut-il du matériel particulier ?',
    'Non. Un téléphone (Android ou iPhone) ou un ordinateur connecté à Internet suffit. Sùkûl s’installe sur l’écran d’accueil comme une application, sans passer par un magasin d’applications. Pour imprimer les reçus au guichet, n’importe quelle imprimante fonctionne.',
  ],
  [
    'Mes enseignants vont-ils savoir l’utiliser ?',
    'Oui. Chaque écran est pensé pour être compris sans formation, et un guide accompagne chaque nouvel utilisateur page après page lors de ses premiers pas. Importez simplement la liste de vos enseignants : ils sont reconnus dès qu’ils créent leur compte et retrouvent leurs classes.',
  ],
  [
    'Mes données sont-elles en sécurité ?',
    'Oui. Les échanges sont chiffrés, chaque établissement ne voit que ses propres données, et chaque nouveau compte est confirmé par un code envoyé par e-mail. Les reçus portent un QR code qui permet de vérifier qu’ils sont authentiques. Vos données ne sont jamais vendues.',
  ],
  [
    'Puis-je essayer avant de m’engager ?',
    'Oui. L’inscription de votre établissement est gratuite et votre espace est prêt immédiatement : importez vos élèves, testez le guichet et l’appel avant de décider.',
  ],
  [
    'Comment les parents paient-ils la scolarité ?',
    'Au guichet de l’établissement, avec un reçu imprimé aussitôt, ou depuis leur téléphone par Mobile Money (Orange Money, MTN Mobile Money). Le reçu est émis automatiquement et le paiement apparaît dans la caisse de l’établissement.',
  ],
  [
    'Les parents doivent-ils créer un compte ?',
    'Ce n’est pas obligatoire pour payer au guichet. Avec un compte gratuit, ils suivent les notes, les absences, les devoirs et les paiements de leurs enfants, et reçoivent les informations de l’établissement.',
  ],
  [
    'Un enseignant peut-il travailler dans plusieurs établissements ?',
    'Oui. Avec un seul compte, il ajoute tous ses établissements et passe de l’un à l’autre d’un geste. Ses établissements qui ne sont pas encore sur Sùkûl peuvent être invités à le rejoindre.',
  ],
  [
    'Sùkûl fonctionne-t-il en anglais ?',
    'Oui. Chaque utilisateur choisit le français ou l’anglais, à tout moment, avec le bouton de langue en haut de l’écran.',
  ],
  [
    'Faut-il une bonne connexion Internet ?',
    'Sùkûl est conçu pour les réseaux mobiles : l’application s’ouvre rapidement même avec un réseau faible. Une connexion reste nécessaire pour enregistrer et consulter les informations.',
  ],
  [
    'Comment vérifier qu’un reçu est authentique ?',
    'Scannez le QR code du reçu avec l’appareil photo du téléphone, ou utilisez « Vérifier un reçu » sur l’accueil de l’établissement : Sùkûl confirme s’il a bien été émis et qu’il n’a pas été modifié.',
  ],
]

function Liste() {
  const [ouverte, setOuverte] = useState(null)
  return (
    <div className="faq">
      {QUESTIONS.map(([q, r], i) => (
        <div key={q} className={`faq-item ${ouverte === i ? 'ouverte' : ''}`}>
          <button type="button" className="faq-question" aria-expanded={ouverte === i} onClick={() => setOuverte(ouverte === i ? null : i)}>
            <span>{q}</span>
            <IcChevron size={18} className="faq-fleche" />
          </button>
          {ouverte === i && <p className="faq-reponse">{r}</p>}
        </div>
      ))}
    </div>
  )
}

export default function Faq() {
  const { user } = useAuth()
  const pied = (
    <>
      {user ? (
        <>
          Une autre question ? <a href="#/messages">Écrivez-nous</a>
        </>
      ) : (
        <>
          Vous dirigez un établissement ? <a href="#/inscrire-etablissement">Inscrivez-le</a>
        </>
      )}
    </>
  )
  if (!user) {
    return (
      <PageAuth titre="Questions fréquentes" pied={pied}>
        <Liste />
      </PageAuth>
    )
  }
  return (
    <>
      <h1 className="page-title">Questions fréquentes</h1>
      <Liste />
      <p className="ea-pied">{pied}</p>
    </>
  )
}
