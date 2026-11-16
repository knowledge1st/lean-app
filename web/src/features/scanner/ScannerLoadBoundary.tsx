import { Component } from 'react';
import type { ReactNode } from 'react';
import { Button } from '../../components/ui/Button';

export const loadScannerCamera = () => import('./ScannerCamera');

type Props = {
  children: ReactNode;
  onUnavailable: () => void;
  onRetry: () => void;
};

export class ScannerLoadBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch() {
    this.props.onUnavailable();
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-black p-5 text-center text-white">
        <p role="alert">No se pudo abrir el escáner. Revisá la conexión e intentá de nuevo.</p>
        <Button variant="secondary" onClick={this.props.onRetry}>
          Reintentar
        </Button>
      </div>
    );
  }
}
