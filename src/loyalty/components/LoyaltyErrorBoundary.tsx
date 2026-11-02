/** Erreur d'affichage imprévue : message clair et rechargement, plutôt qu'une page blanche. */
import { Component, type ReactNode } from "react";
import { LoyaltyLayout, Notice, primaryButton } from "./ui";

export class LoyaltyErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <LoyaltyLayout>
        <Notice
          tone="warning"
          title="La page n'a pas pu s'afficher"
          role="alert"
          actions={
            <button type="button" onClick={() => window.location.reload()} className={primaryButton}>
              Recharger la page
            </button>
          }
        >
          Votre carte et vos points ne sont pas touchés. Rechargez la page pour continuer.
        </Notice>
      </LoyaltyLayout>
    );
  }
}
