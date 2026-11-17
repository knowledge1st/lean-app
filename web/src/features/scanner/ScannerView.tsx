import * as Dialog from '@radix-ui/react-dialog';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ManualBarcodeInput } from './ManualBarcodeInput';
import { loadScannerCamera, ScannerLoadBoundary } from './ScannerLoadBoundary';

const createCamera = () => lazy(() => loadScannerCamera());

type ScannerViewProps = {
  onDetected: (code: string) => void;
  onClose: () => void;
  busy?: boolean | undefined;
  error?: string | undefined;
  onCreate?: (() => void) | undefined;
};
function ScannerContent({ onDetected, busy = false, error, onCreate }: ScannerViewProps) {
  const [paused, setPaused] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [camera, setCamera] = useState(() => ({ View: createCamera(), attempt: 0 }));
  const Camera = camera.View;
  const submit = (code: string) => {
    setPaused(true);
    onDetected(code);
  };
  return (
    <>
      <ScannerLoadBoundary
        key={camera.attempt}
        onUnavailable={() => setUnavailable(true)}
        onRetry={() => {
          setUnavailable(false);
          setCamera(({ attempt }) => ({ View: createCamera(), attempt: attempt + 1 }));
        }}
      >
        <Suspense
          fallback={
            <div className="flex min-h-0 flex-1 items-center justify-center p-5 text-white">
              <p role="status">Abriendo cámara…</p>
            </div>
          }
        >
          <Camera
            active={!busy && !paused}
            onDetect={submit}
            onUnavailableChange={setUnavailable}
          />
        </Suspense>
      </ScannerLoadBoundary>
      {busy && (
        <p role="status" className="relative p-3 text-center text-white">
          Buscando…
        </p>
      )}
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
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            requestAnimationFrame(() => {
              document
                .querySelector<HTMLButtonElement>('button[aria-label="Escanear código de barras"]')
                ?.focus();
            });
          }}
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
