// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { ScannerView } from './ScannerView';
const { detect } = vi.hoisted(() => ({ detect: vi.fn() }));
vi.mock('./detector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./detector')>()),
  createBarcodeDetector: vi.fn().mockResolvedValue({ detect }),
}));
const track = { stop: vi.fn() };
const getUserMedia = vi.fn();
beforeEach(() => {
  detect.mockReset().mockResolvedValue([]);
  track.stop.mockClear();
  getUserMedia.mockReset().mockResolvedValue({ getTracks: () => [track] });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  Object.defineProperty(HTMLVideoElement.prototype, 'readyState', { configurable: true, value: 2 });
  vi.spyOn(HTMLVideoElement.prototype, 'play').mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('inicia la cámara dentro del portal y cerrar libera los tracks', async () => {
  const onClose = vi.fn();
  const view = render(<ScannerView onDetected={vi.fn()} onClose={onClose} />);
  expect(screen.getByRole('dialog', { name: 'Escanear código' })).toBeTruthy();
  await screen.findByText('Apuntá al código de barras');
  expect(getUserMedia).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(screen.getByLabelText('Cerrar escáner'));
  fireEvent.click(screen.getByLabelText('Cerrar escáner'));
  expect(onClose).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(track.stop).toHaveBeenCalledTimes(1);
});
it('enfoca el ingreso manual cuando se deniega la cámara', async () => {
  getUserMedia.mockRejectedValue(new DOMException('', 'NotAllowedError'));
  render(<ScannerView onDetected={vi.fn()} onClose={vi.fn()} />);
  await screen.findByText(/No hay permiso para usar la cámara/);
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByLabelText('Código de barras')),
  );
});
it('detiene durante búsqueda y permite una nueva sesión al fallar', async () => {
  detect.mockResolvedValue([{ rawValue: '12345678' }]);
  const onDetected = vi.fn();
  function Harness() {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    return (
      <>
        <button
          onClick={() => {
            setBusy(false);
            setError('Sin conexión');
          }}
        >
          Fallar búsqueda
        </button>
        <ScannerView
          busy={busy}
          error={error}
          onClose={vi.fn()}
          onDetected={(code) => {
            onDetected(code);
            setBusy(true);
          }}
        />
      </>
    );
  }
  render(<Harness />);
  await screen.findByText('Buscando…');
  expect(onDetected).toHaveBeenCalledExactlyOnceWith('12345678');
  expect(track.stop).toHaveBeenCalledTimes(1);
  expect((screen.getByLabelText('Código de barras') as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByText('Fallar búsqueda'));
  expect(screen.getByRole('alert').textContent).toBe('Sin conexión');
  expect(getUserMedia).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('Escanear de nuevo'));
  await waitFor(() => expect(onDetected).toHaveBeenCalledTimes(2));
  expect(getUserMedia).toHaveBeenCalledTimes(2);
});
