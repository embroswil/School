// Pages legales de School : politique de confidentialite et conditions d'utilisation.
// Version du 4 novembre 2026. A faire relire par un juriste avant le lancement commercial.
const MAJ = '4 novembre 2026'
const CONTACT = 'la messagerie de l’application (onglet Messages)'

function Page({ titre, children }) {
  return (
    <div className="legal">
      <a className="back" href="#/">
        ← Retour
      </a>
      <h1 className="page-title">{titre}</h1>
      <p className="muted" style={{ fontSize: 13 }}>Dernière mise à jour : {MAJ}</p>
      {children}
      <p className="muted" style={{ fontSize: 13, marginTop: 24 }}>School est un service édité par Embroswil.</p>
    </div>
  )
}

export function Confidentialite() {
  return (
    <Page titre="Politique de confidentialité">
      <h2>1. Qui sommes-nous ?</h2>
      <p>
        School est une application de vie scolaire éditée par Embroswil. Elle relie les établissements scolaires, les enseignants, les élèves, les parents
        et les tuteurs. Pour toute question sur vos données : {CONTACT}.
      </p>
      <h2>2. Qui est responsable de vos données ?</h2>
      <p>
        <b>L’établissement scolaire</b> est responsable des données de ses élèves (identité, classe, notes, absences, discipline, scolarité) : c’est lui
        qui les saisit ou les importe. <b>Embroswil</b> héberge et traite ces données pour son compte, uniquement pour faire fonctionner School. Pour les
        comptes que vous créez vous-même (parent, tuteur, donateur, enseignant), Embroswil est responsable de vos données de compte.
      </p>
      <h2>3. Quelles données ?</h2>
      <ul>
        <li>Compte : nom, prénom, adresse email, téléphone, mot de passe (chiffré, illisible même pour nous).</li>
        <li>Élèves : nom, prénom, classe, matricule, date de naissance, notes, absences, sanctions, devoirs, paiements de scolarité.</li>
        <li>Lien parent–enfant : le lien de parenté déclaré (père, mère, tuteur…).</li>
        <li>Publications de l’établissement : textes, photos et vidéos.</li>
        <li>Paiements : montant, date, référence de transaction. Nous ne conservons jamais vos codes Mobile Money ni vos numéros de carte.</li>
      </ul>
      <h2>4. Pourquoi ?</h2>
      <p>
        Uniquement pour le suivi scolaire : informer les familles (notes, absences, devoirs, actualités), gérer la scolarité et ses paiements, permettre
        les échanges entre l’établissement, les enseignants et les familles, et assurer la sécurité des comptes (codes de vérification par email).
        <b> Vos données ne sont jamais vendues ni utilisées pour de la publicité.</b>
      </p>
      <h2>5. Qui peut les voir ?</h2>
      <ul>
        <li>Un parent ou un tuteur ne voit que les enfants qui lui sont rattachés, après vérification (date de naissance ou validation par l’établissement).</li>
        <li>Un élève ne voit que ses propres informations.</li>
        <li>Un enseignant ne voit que ses classes ; l’administration de l’établissement voit son établissement.</li>
        <li>Les listes de classes ne sont consultables que par des comptes dont l’email est confirmé, et n’affichent que le nom et la classe.</li>
        <li>Les conseils de discipline ne sont visibles que des familles de l’établissement concerné.</li>
      </ul>
      <h2>6. Où sont-elles stockées ?</h2>
      <p>
        Chez des prestataires techniques reconnus (base de données en Europe, serveurs d’application, envoi d’emails, paiement en ligne NotchPay pour les
        abonnements des établissements), liés par des engagements de sécurité et de confidentialité. Les échanges sont chiffrés (HTTPS).
      </p>
      <h2>7. Combien de temps ?</h2>
      <p>
        Les données scolaires sont conservées pendant la scolarité de l’élève dans l’établissement, puis supprimées ou archivées selon les instructions de
        l’établissement. Un compte inactif depuis 3 ans peut être supprimé. Les notifications lues sont effacées automatiquement après 30 jours.
      </p>
      <h2>8. Vos droits</h2>
      <p>
        Vous pouvez accéder à vos données, les faire corriger ou supprimer, et retirer un rattachement à un enfant. Pour les données d’un élève, adressez-
        vous d’abord à son établissement (messagerie de l’application). Pour votre compte : {CONTACT}. Ces droits s’exercent conformément à la législation
        camerounaise applicable à la protection des données personnelles.
      </p>
      <h2>9. Mineurs</h2>
      <p>
        Les données des élèves sont des données d’enfants : elles font l’objet d’une protection renforcée (accès limités, vérification des parents, aucun
        usage commercial). Un élève mineur utilise School sous la responsabilité de ses parents et de son établissement.
      </p>
    </Page>
  )
}

export function Conditions() {
  return (
    <Page titre="Conditions d’utilisation">
      <h2>1. Objet</h2>
      <p>
        Les présentes conditions encadrent l’utilisation de School, application de vie scolaire éditée par Embroswil. Créer un compte ou utiliser School
        vaut acceptation de ces conditions et de la politique de confidentialité.
      </p>
      <h2>2. Comptes</h2>
      <ul>
        <li>Chaque compte est personnel. Vous êtes responsable de votre mot de passe et des informations que vous fournissez, qui doivent être exactes.</li>
        <li>Se déclarer parent ou tuteur d’un enfant dont on n’a pas la charge est interdit et entraîne la suppression du compte.</li>
        <li>Les comptes enseignants sont validés par l’établissement.</li>
      </ul>
      <h2>3. Établissements</h2>
      <p>
        L’établissement est responsable des contenus qu’il publie (notes, actualités, sanctions, photos) et de l’exactitude des données de ses élèves. Il
        s’engage à n’y publier que des informations utiles à la vie scolaire, dans le respect des élèves et de leur image. L’usage de School par un
        établissement fait l’objet d’un abonnement annuel ; à défaut de paiement à l’échéance (après rappels), l’établissement passe en lecture seule, ses
        données étant conservées.
      </p>
      <h2>4. Paiements de la scolarité</h2>
      <p>
        Les frais de scolarité sont payés directement à l’établissement (transfert Mobile Money ou guichet). School met en relation, délivre les reçus et
        aide à résoudre les litiges, mais ne détient jamais ces fonds. Le parent s’engage à ne signaler un paiement qu’après l’avoir réellement effectué.
        L’établissement s’engage à confirmer rapidement les paiements reçus. En cas de litige, School peut arbitrer sur la base des éléments fournis.
      </p>
      <h2>5. Comportement</h2>
      <p>
        Sont interdits : les propos injurieux ou discriminatoires, le harcèlement, la diffusion d’informations sur un élève hors du cadre scolaire, toute
        tentative d’accès aux données d’autrui, et toute fraude aux paiements. Tout manquement peut entraîner la suspension du compte.
      </p>
      <h2>6. Disponibilité et responsabilité</h2>
      <p>
        Embroswil s’efforce d’assurer un service disponible et sûr, sans pouvoir garantir l’absence totale d’interruption. Embroswil n’est pas responsable
        des décisions pédagogiques ou financières des établissements, ni des contenus qu’ils publient.
      </p>
      <h2>7. Évolution</h2>
      <p>Ces conditions peuvent évoluer ; la date de mise à jour figure en haut de cette page. Contact : {CONTACT}.</p>
    </Page>
  )
}
