import { Component, type ReactNode } from 'react';
import { ErrorState } from '../../components/ui/ErrorState';

export class ChartBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (this.state.failed) {
      return (
        <ErrorState
          message="No se pudo cargar el gráfico"
          onRetry={() => window.location.reload()}
        />
      );
    }
    return this.props.children;
  }
}
