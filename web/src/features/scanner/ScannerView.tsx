import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ManualBarcodeInput } from './ManualBarcodeInput';
import { useBarcodeScanner } from './useBarcodeScanner';

type ScannerViewProps = {
  onDetected: (code: string) => void;
  onClose: () => void;
  busy?: boolean | undefined;
  error?: string | undefined;
  onCreate?: (() => void) | undefined;
};
const messages = {
  starting: 'Abriendo cámara…',
  denied:
    'No hay permiso para usar la cámara. Habilitalo en los ajustes del navegador o ingresá el código a mano.',
  unavailable: 'No encontramos una cámara disponible. Ingresá el código a mano.',
  error: 'No se pudo iniciar el escáner. Ingresá el código a mano.',
  scanning: 'Apuntá al código de barras',
  stopped: '',
};
function ScannerContent({ onDetected, busy = false, error, onCreate }: ScannerViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const submit = (code: string) => {
    setPaused(true);
    stop();
    onDetected(code);
  };
  const { status, stop } = useBarcodeScanner({
    videoRef,
    active: !busy && !paused,
    onDetect: submit,
  });
  const unavailable = ['denied', 'unavailable', 'error'].includes(status);
  return (
    <>
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="pointer-events-none relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-5 text-white">
        {!unavailable && !paused && !busy && (
          <div className="aspect-[3/2] w-4/5 max-w-lg rounded-2xl border-2 border-white shadow-[0_0_0_100vmax_rgba(0,0,0,0.55)]" />
        )}
        <p role="status" className="relative mt-4 rounded-xl bg-black/70 p-3 text-center">
          {busy ? 'Buscando…' : messages[status]}
        </p>
      </div>
      <div className="relative max-h-[60%] shrink-0 space-y-3 overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-text">
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        {error && !busy && (
          <Button variant="secondary" onClick={() => setPaused(false)}>
            Escanear de nuevo
          </Button>
        )}
        {onCreate && (
          <Button variant="secondary" disabled={busy} onClick={onCreate}>
            Crear alimento con este código
          </Button>
        )}
        <ManualBarcodeInput onSubmit={submit} busy={busy} autoFocus={unavailable} />
      </div>
    </>
  );
}
export function ScannerView(props: ScannerViewProps) {
  const [viewport, setViewport] = useState<{ height: number; top: number }>();
  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;
    const resize = () =>
      setViewport({ height: visualViewport.height, top: visualViewport.offsetTop });
    resize();
    visualViewport.addEventListener('resize', resize);
    visualViewport.addEventListener('scroll', resize);
    return () => {
      visualViewport.removeEventListener('resize', resize);
      visualViewport.removeEventListener('scroll', resize);
    };
  }, []);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black" />
        <Dialog.Content
          aria-describedby={undefined}
          style={viewport ? { height: viewport.height, top: viewport.top } : undefined}
          className="fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden bg-black pt-[calc(3.5rem+env(safe-area-inset-top))] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
        >
          <Dialog.Title className="sr-only">Escanear código</Dialog.Title>
          <Dialog.Close asChild>
            <Button
              aria-label="Cerrar escáner"
              className="absolute z-10 right-[calc(0.75rem+env(safe-area-inset-right))] top-[calc(0.5rem+env(safe-area-inset-top))] bg-black/70 text-white"
            >
              ✕
            </Button>
          </Dialog.Close>
          <ScannerContent {...props} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export default ScannerView;
