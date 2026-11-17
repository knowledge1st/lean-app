import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { useBarcodeScanner } from './useBarcodeScanner';

const messages = {
  starting: 'Abriendo cámara…',
  denied:
    'No hay permiso para usar la cámara. Habilitalo en los ajustes del navegador o ingresá el código a mano.',
  unavailable: 'No encontramos una cámara disponible. Ingresá el código a mano.',
  error: 'No se pudo iniciar el escáner. Ingresá el código a mano.',
  scanning: 'Apuntá al código de barras',
  stopped: '',
};
export default function ScannerCamera({
  active,
  onDetect,
  onUnavailableChange,
}: {
  active: boolean;
  onDetect: (code: string) => void;
  onUnavailableChange: (unavailable: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [session, setSession] = useState(0);
  const { status } = useBarcodeScanner({ videoRef, active, onDetect, session });
  const unavailable = ['denied', 'unavailable', 'error'].includes(status);
  useEffect(() => {
    onUnavailableChange(unavailable);
  }, [unavailable, onUnavailableChange]);
  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="pointer-events-none relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-5 text-white">
        {!unavailable && active && (
          <div className="aspect-[3/2] w-4/5 max-w-lg rounded-2xl border-2 border-white shadow-[0_0_0_100vmax_rgba(0,0,0,0.55)]" />
        )}
        {messages[status] && (
          <p role="status" className="relative mt-4 rounded-xl bg-black/70 p-3 text-center">
            {messages[status]}
          </p>
        )}
        {unavailable && (
          <Button
            className="pointer-events-auto relative mt-3 bg-surface text-text"
            onClick={() => setSession((value) => value + 1)}
          >
            Reintentar
          </Button>
        )}
      </div>
    </div>
  );
}
