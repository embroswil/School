import { Component } from 'react'

// Filet de securite : si une page plante, on affiche un message clair (avec la cause) au lieu d'un
// ecran noir, et le reste de l'application (en-tete, barre du bas) continue de fonctionner.
export default class Secours extends Component {
  constructor(props) {
    super(props)
    this.state = { erreur: null }
  }
  static getDerivedStateFromError(erreur) {
    return { erreur }
  }
  componentDidCatch(erreur, info) {
    console.error('Page en erreur :', erreur, info?.componentStack)
  }
  render() {
    const e = this.state.erreur
    if (!e) return this.props.children
    // Fichier de l'application introuvable apres une mise a jour : on recharge une seule fois
    const versionPerimee = /dynamically imported module|Importing a module script failed|Failed to fetch|Load failed/i.test(String(e?.message || ''))
    if (versionPerimee) {
      try {
        if (!sessionStorage.getItem('sukul-recharge')) {
          sessionStorage.setItem('sukul-recharge', '1')
          window.location.reload()
          return null
        }
      } catch (_) {
        /* stockage indisponible */
      }
    }
    return (
      <div className="secours">
        <b>Cette page n’a pas pu s’afficher</b>
        <small>Réessayez. Si le problème continue, envoyez une capture de cet écran à l’équipe Sùkûl.</small>
        <code data-brut>{String(e?.message || e).slice(0, 300)}</code>
        <div className="actions">
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            Réessayer
          </button>
          <a className="btn btn-quiet" href="#/" onClick={() => this.setState({ erreur: null })}>
            Accueil
          </a>
        </div>
      </div>
    )
  }
}
