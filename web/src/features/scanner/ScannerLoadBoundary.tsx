import { Component } from 'react';
import type { ReactNode } from 'react';

export const loadScannerView = () => import('./ScannerView');

type Props = {
  children: ReactNode;
  onClose: () => void;
  onRetry: () => void;
};

export class ScannerLoadBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black p-5 text-center text-white">
        <p role="alert">No se pudo abrir el escáner. Revisá la conexión e intentá de nuevo.</p>
        <button type="button" onClick={this.props.onRetry}>
          Reintentar
        </button>
        <button type="button" aria-label="Cerrar escáner" onClick={this.props.onClose}>
          Cerrar escáner
        </button>
      </div>
    );
  }
}
