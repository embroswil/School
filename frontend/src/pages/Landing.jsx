// Page d'accueil publique
export default function Landing() {
  return (
    <div className="public">
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
          <span className="badge">🇨🇲 Pour les écoles du Cameroun</span>
          <h1 style={{ marginTop: 14 }}>L’école de votre enfant, dans votre poche.</h1>
          <p>Notes, présences, frais de scolarité : suivez tout en temps réel, où que vous soyez.</p>
          <div className="actions">
            <a className="btn btn-accent" href="#/inscription">
              Créer un compte gratuit
            </a>
          </div>
        </section>

        <div className="card">
          <div className="feature">
            <span className="ico">👨‍👩‍👧</span>
            <div>
              <b>Parents</b>
              <span className="muted">Suivez les notes, les présences et payez la scolarité par Mobile Money.</span>
            </div>
          </div>
          <div className="feature">
            <span className="ico">🎒</span>
            <div>
              <b>Élèves</b>
              <span className="muted">Retrouvez vos résultats, votre emploi du temps et les informations de votre classe.</span>
            </div>
          </div>
          <div className="feature">
            <span className="ico">👩‍🏫</span>
            <div>
              <b>Enseignants</b>
              <span className="muted">Publiez les notes de vos contrôles et faites l’appel, depuis votre téléphone.</span>
            </div>
          </div>
          <div className="feature">
            <span className="ico">🏫</span>
            <div>
              <b>Établissements</b>
              <span className="muted">Maternelles, écoles primaires, collèges et lycées : un espace pour chaque établissement.</span>
            </div>
          </div>
        </div>

        <a className="card" href="#/inscrire-etablissement" style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 14, color: 'inherit' }}>
          <span style={{ fontSize: 30 }}>🏫</span>
          <span style={{ flex: 1 }}>
            <b style={{ font: '700 17px/1.3 var(--font-display)', display: 'block' }}>Vous dirigez un établissement ?</b>
            <span className="muted">Inscrivez votre école sur School, gratuitement.</span>
          </span>
          <span style={{ fontSize: 22, color: 'var(--primary)' }}>›</span>
        </a>

        <p className="muted" style={{ textAlign: 'center', marginTop: 22, fontSize: 14 }}>
          Déjà inscrit ? <a href="#/connexion">Se connecter</a>
        </p>
      </main>
    </div>
  )
}
