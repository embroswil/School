import {
  IcActus,
  IcCadenas,
  IcCarte,
  IcCasquette,
  IcChevron,
  IcCoche,
  IcEcole,
  IcFamille,
  IcGraphique,
  IcMessages,
  IcTableau,
  IcTelephone,
} from '../icones.jsx'

const PUBLICS = [
  {
    Icone: IcFamille,
    titre: 'Parents',
    texte: 'Suivez les notes, les absences et les annonces de l’école. Payez la scolarité par Mobile Money.',
  },
  {
    Icone: IcCasquette,
    titre: 'Élèves',
    texte: 'Consultez vos résultats, votre classement et les informations de votre classe.',
  },
  {
    Icone: IcTableau,
    titre: 'Enseignants',
    texte: 'Faites l’appel en classe et publiez les notes de vos contrôles, depuis votre téléphone.',
  },
  {
    Icone: IcEcole,
    titre: 'Établissements',
    texte: 'Élèves, classes, enseignants, scolarité et communication : tout votre établissement au même endroit.',
  },
]

const ATOUTS = [
  [IcGraphique, 'Notes et classements', 'Séquences, moyennes et rangs calculés automatiquement.'],
  [IcCoche, 'Appel numérique', 'Le cahier d’appel ne se perd plus ; les parents sont prévenus des absences.'],
  [IcCarte, 'Scolarité', 'Frais, tranches et paiements suivis en temps réel, versés directement à l’école.'],
  [IcActus, 'Actualités', 'Annonces, événements et conseils de discipline, avec notification.'],
  [IcMessages, 'Messagerie', 'Parents et établissement échangent sans intermédiaire.'],
  [IcCadenas, 'Données protégées', 'Chacun ne voit que ce qui le concerne.'],
]

const ETAPES = [
  ['Créez votre compte', 'Parent, élève ou enseignant : quelques secondes suffisent.'],
  ['Choisissez votre établissement', 'Votre école doit être inscrite sur School.'],
  ['Suivez tout en direct', 'Notes, absences, annonces et paiements arrivent sur votre téléphone.'],
]

// Page d'accueil publique
export default function Landing() {
  return (
    <div className="public accueil">
      <header className="public-top">
        <span className="brand">
          School<span>.</span>
        </span>
        <a className="btn btn-quiet" href="#/connexion" style={{ padding: '10px 16px', fontSize: 15 }}>
          Se connecter
        </a>
      </header>

      <main className="public-main">
        <section className="landing-hero">
          <span className="badge">Pour les établissements du Cameroun</span>
          <h1 style={{ marginTop: 14 }}>La vie scolaire, simplement.</h1>
          <p>Notes, absences, annonces et scolarité : parents, élèves, enseignants et établissements réunis dans une seule application.</p>
          <div className="actions">
            <a className="btn btn-accent" href="#/inscription">
              Créer un compte gratuit
            </a>
            <a className="btn hero-secondaire" href="#/connexion">
              J’ai déjà un compte
            </a>
          </div>
          <div className="hero-points">
            <span>
              <IcCoche size={16} /> Gratuit pour les familles
            </span>
            <span>
              <IcTelephone size={16} /> Sur tous les téléphones
            </span>
          </div>
        </section>

        <p className="surtitre">Pour qui ?</p>
        <h2 className="titre-section">Chacun son espace</h2>
        <div className="publics">
          {PUBLICS.map(({ Icone, titre, texte }) => (
            <article className="public-carte" key={titre}>
              <span className="pastille-ico">
                <Icone size={22} />
              </span>
              <div>
                <h3>{titre}</h3>
                <p>{texte}</p>
              </div>
            </article>
          ))}
        </div>

        <p className="surtitre">Fonctionnalités</p>
        <h2 className="titre-section">Tout le suivi scolaire</h2>
        <div className="atouts">
          {ATOUTS.map(([Icone, titre, texte]) => (
            <div className="atout" key={titre}>
              <Icone size={20} />
              <b>{titre}</b>
              <span>{texte}</span>
            </div>
          ))}
        </div>

        <p className="surtitre">Comment ça marche</p>
        <h2 className="titre-section">Prêt en 3 étapes</h2>
        <ol className="etapes">
          {ETAPES.map(([t, d], i) => (
            <li key={t}>
              <span className="numero">{i + 1}</span>
              <div>
                <b>{t}</b>
                <span>{d}</span>
              </div>
            </li>
          ))}
        </ol>

        <a className="bandeau-ecole" href="#/inscrire-etablissement">
          <span className="pastille-ico clair">
            <IcEcole size={24} />
          </span>
          <span style={{ flex: 1 }}>
            <b>Vous dirigez un établissement ?</b>
            <span>Inscrivez votre école sur School. La mise en place est gratuite et guidée.</span>
          </span>
          <IcChevron size={22} />
        </a>
      </main>

      <footer className="pied">
        <span className="brand" style={{ fontSize: 18 }}>
          School<span>.</span>
        </span>
        <p>Une application Embroswil · © {new Date().getFullYear()}</p>
        <p>
          <a href="#/connexion">Se connecter</a> · <a href="#/inscription">Créer un compte</a> ·{' '}
          <a href="#/inscrire-etablissement">Inscrire un établissement</a>
        </p>
      </footer>
    </div>
  )
}
