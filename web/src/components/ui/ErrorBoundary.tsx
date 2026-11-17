import { Component } from 'react';
import type { ReactNode } from 'react';
import { Button } from './Button';
import { ErrorState } from './ErrorState';

type ErrorBoundaryProps = { children: ReactNode; resetKey?: string };

export class ErrorBoundary extends Component<ErrorBoundaryProps, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidUpdate(previousProps: ErrorBoundaryProps) {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const isModuleError =
      /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script|module script failed/i.test(
        `${error.name} ${error.message}`,
      );
    return (
      <div className="space-y-4 p-4">
        <ErrorState message="Algo salió mal." onRetry={() => this.setState({ error: null })} />
        {isModuleError && <Button onClick={() => window.location.reload()}>Recargar la app</Button>}
      </div>
    );
  }
}
