import { Component } from 'react'

/**
 * Filet de sécurité global : si un composant plante au rendu, on affiche un
 * message lisible avec un bouton pour recharger, plutôt qu'une page blanche.
 * (Ne couvre pas les erreurs dans les gestionnaires d'événements ou le code
 * async hors rendu — c'est pour ça que les points sensibles comme Realtime
 * ont en plus leur propre try/catch.)
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Erreur applicative interceptée :', error, info?.componentStack)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.error) {
      return (
        <div className="login-screen">
          <div className="login-card">
            <h1>😕 Oups</h1>
            <p className="muted">
              Une erreur inattendue est survenue
              {this.state.error?.message ? ` : ${this.state.error.message}` : '.'}
            </p>
            <button type="button" className="btn-primary" onClick={this.handleReload}>
              Recharger l'application
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
