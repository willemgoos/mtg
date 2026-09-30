import { Component, type ReactNode } from 'react';

/**
 * Catches a crash in the game screen and offers to reload the saved game or
 * go back to the menu, instead of leaving a blank page.
 */
export class ErrorBoundary extends Component<
  { onRetry: () => void; onMenu: () => void; children: ReactNode; menuLabel?: string },
  { error: unknown }
> {
  override state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  override componentDidCatch(error: unknown) {
    console.error(error);
  }

  private reset(then: () => void) {
    this.setState({ error: null });
    then();
  }

  override render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    const message = error instanceof Error ? error.message : String(error);
    return (
      <div className="start crash">
        <div className="start__title">
          <span className="start__eyebrow">Something went wrong</span>
          <h1>The game crashed</h1>
          <p className="crash__message">{message}</p>
        </div>
        <div className="crash__actions">
          <button className="btn btn--primary" onClick={() => this.reset(this.props.onRetry)}>
            Reload game
          </button>
          <button className="btn btn--ghost" onClick={() => this.reset(this.props.onMenu)}>
            {this.props.menuLabel ?? 'Abandon and go to menu'}
          </button>
        </div>
      </div>
    );
  }
}
