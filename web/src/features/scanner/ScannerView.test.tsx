// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { ScannerView } from './ScannerView';
import * as scannerLoader from './ScannerLoadBoundary';
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
it.each([
  ['NotAllowedError', /No hay permiso para usar la cámara/],
  ['NotFoundError', /No encontramos una cámara disponible/],
  ['UnknownError', /No se pudo iniciar el escáner/],
])('enfoca el ingreso manual ante %s', async (name, message) => {
  getUserMedia.mockRejectedValue(new DOMException('', name));
  render(<ScannerView onDetected={vi.fn()} onClose={vi.fn()} />);
  await screen.findByText(message);
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

it('mantiene el diálogo y el ingreso manual mientras carga la cámara y Escape cierra', async () => {
  let resolve!: (module: Awaited<ReturnType<typeof scannerLoader.loadScannerCamera>>) => void;
  const pending = new Promise<Awaited<ReturnType<typeof scannerLoader.loadScannerCamera>>>(
    (done) => {
      resolve = done;
    },
  );
  vi.spyOn(scannerLoader, 'loadScannerCamera').mockReturnValueOnce(pending);
  const onClose = vi.fn();
  const onDetected = vi.fn();
  render(<ScannerView onDetected={onDetected} onClose={onClose} />);
  const dialog = within(screen.getByRole('dialog', { name: 'Escanear código' }));
  expect(dialog.getByRole('status').textContent).toBe('Abriendo cámara…');
  expect(dialog.getByRole('button', { name: 'Cerrar escáner' })).toBeTruthy();
  fireEvent.change(dialog.getByLabelText('Código de barras'), { target: { value: '12345678' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Buscar' }));
  expect(onDetected).toHaveBeenCalledExactlyOnceWith('12345678');
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
  await act(async () => resolve(await import('./ScannerCamera')));
  expect(getUserMedia).not.toHaveBeenCalled();
});

it('mantiene el ingreso manual enfocado si falla la carga y reintenta con un lazy nuevo', async () => {
  const load = vi
    .spyOn(scannerLoader, 'loadScannerCamera')
    .mockRejectedValueOnce(new Error('offline'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const onDetected = vi.fn();
  render(<ScannerView onDetected={onDetected} onClose={vi.fn()} />);
  const dialog = within(screen.getByRole('dialog', { name: 'Escanear código' }));
  expect((await dialog.findByRole('alert')).textContent).toBe(
    'No se pudo abrir el escáner. Revisá la conexión e intentá de nuevo.',
  );
  expect(dialog.getByRole('button', { name: 'Cerrar escáner' })).toBeTruthy();
  await waitFor(() =>
    expect(document.activeElement).toBe(dialog.getByLabelText('Código de barras')),
  );
  fireEvent.click(dialog.getByRole('button', { name: 'Reintentar' }));
  await dialog.findByText('Apuntá al código de barras');
  expect(load).toHaveBeenCalledTimes(2);
  expect(dialog.queryByRole('alert')).toBeNull();
});

it('enviar a mano libera la cámara y la mantiene pausada hasta escanear de nuevo', async () => {
  const onDetected = vi.fn();
  render(<ScannerView onDetected={onDetected} onClose={vi.fn()} error="Sin conexión" />);
  await screen.findByText('Apuntá al código de barras');
  fireEvent.change(screen.getByLabelText('Código de barras'), { target: { value: '12345678' } });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
  expect(onDetected).toHaveBeenCalledExactlyOnceWith('12345678');
  expect(track.stop).toHaveBeenCalledTimes(1);
  expect(getUserMedia).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('Escanear de nuevo'));
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
});

it('reintenta una cámara fallida y conserva el ingreso manual', async () => {
  getUserMedia.mockRejectedValueOnce(new Error('camera'));
  render(<ScannerView onDetected={vi.fn()} onClose={vi.fn()} />);
  await screen.findByText(/No se pudo iniciar el escáner/);
  expect(screen.getByLabelText('Código de barras')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await screen.findByText('Apuntá al código de barras');
  expect(getUserMedia).toHaveBeenCalledTimes(2);
});

it.each(['close', 'escape'] as const)(
  'devuelve el foco a Escanear al volver a búsqueda con %s',
  async (mode) => {
    function Search() {
      const [open, setOpen] = useState(false);
      return open ? (
        <ScannerView onDetected={vi.fn()} onClose={() => setOpen(false)} />
      ) : (
        <button aria-label="Escanear código de barras" onClick={() => setOpen(true)}>
          Escanear
        </button>
      );
    }
    render(<Search />);
    fireEvent.click(screen.getByRole('button', { name: 'Escanear código de barras' }));
    await screen.findByText('Apuntá al código de barras');
    if (mode === 'close') fireEvent.click(screen.getByLabelText('Cerrar escáner'));
    else fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Escanear código de barras' }),
      ),
    );
  },
);
