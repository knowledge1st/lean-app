import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { barcodeSchema } from '@lean/shared';
import { createBarcodeDetector, SCAN_FORMATS, type DetectorLike } from './detector';

export type ScannerStatus =
  'starting' | 'scanning' | 'denied' | 'unavailable' | 'error' | 'stopped';
const MAX_CONSECUTIVE_FAILURES = 10;
const defaultGetUserMedia = (constraints: MediaStreamConstraints) =>
  navigator.mediaDevices.getUserMedia(constraints);

export function useBarcodeScanner({
  videoRef,
  onDetect,
  active,
  createDetector = createBarcodeDetector,
  getUserMedia = defaultGetUserMedia,
  intervalMs = 200,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  onDetect: (code: string) => void;
  active: boolean;
  createDetector?: () => Promise<DetectorLike>;
  getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>;
  intervalMs?: number;
}): { status: ScannerStatus; stop: () => void } {
  const [status, setStatus] = useState<ScannerStatus>('stopped');
  const callback = useRef(onDetect);
  const detector = useRef<Promise<DetectorLike> | undefined>(undefined);
  const detecting = useRef(false);
  const stopRef = useRef(() => {});
  useEffect(() => {
    callback.current = onDetect;
  }, [onDetect]);
  const stop = useCallback(() => stopRef.current(), []);

  useEffect(() => {
    let generation = 0;
    let ended = false;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const video = videoRef.current;
    const release = () => {
      generation += 1;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      stream = undefined;
      if (video) video.srcObject = null;
    };
    stopRef.current = () => {
      ended = true;
      release();
      setStatus('stopped');
    };
    const start = async () => {
      if (!active || ended || document.visibilityState === 'hidden') return;
      release();
      const attempt = generation;
      const current = () => attempt === generation && !ended;
      setStatus('starting');
      if (!video || (getUserMedia === defaultGetUserMedia && !navigator.mediaDevices)) {
        setStatus('unavailable');
        return;
      }
      let acquired: MediaStream;
      try {
        acquired = await getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      } catch (failure) {
        if (!current()) return;
        const name =
          failure instanceof Error || failure instanceof DOMException ? failure.name : '';
        setStatus(
          ['NotAllowedError', 'SecurityError'].includes(name)
            ? 'denied'
            : ['NotFoundError', 'OverconstrainedError', 'NotReadableError'].includes(name)
              ? 'unavailable'
              : 'error',
        );
        return;
      }
      if (!current()) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = acquired;
      video.srcObject = acquired;
      try {
        await video.play();
      } catch {
        if (current()) {
          release();
          setStatus('error');
        }
        return;
      }
      if (!current()) return;
      let reader: DetectorLike;
      try {
        detector.current ??= createDetector().catch((failure: unknown) => {
          detector.current = undefined;
          throw failure;
        });
        reader = await detector.current;
      } catch {
        if (current()) {
          release();
          setStatus('error');
        }
        return;
      }
      if (!current()) return;
      setStatus('scanning');
      let consecutiveFailures = 0;
      const scan = async () => {
        if (!current()) return;
        if (video.readyState >= 2 && !detecting.current) {
          detecting.current = true;
          try {
            const results = await reader.detect(video);
            consecutiveFailures = 0;
            if (!current()) return;
            for (const result of results) {
              const code = result.rawValue.replace(/\s/g, '');
              if (
                barcodeSchema.safeParse(code).success &&
                (!result.format || SCAN_FORMATS.some((format) => format === result.format))
              ) {
                stopRef.current();
                try {
                  navigator.vibrate?.(60);
                } catch {
                  // Vibration is optional on this device.
                }
                callback.current(code);
                return;
              }
            }
          } catch {
            if (current() && ++consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
              release();
              setStatus('error');
            }
          } finally {
            detecting.current = false;
          }
        }
        if (current()) timer = setTimeout(() => void scan(), intervalMs);
      };
      timer = setTimeout(() => void scan(), intervalMs);
    };
    const visibilityChanged = () => {
      if (document.visibilityState === 'hidden') {
        release();
        setStatus('stopped');
      } else void start();
    };
    document.addEventListener('visibilitychange', visibilityChanged);
    if (active) void start();
    else setStatus('stopped');
    return () => {
      ended = true;
      release();
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, [active, videoRef, createDetector, getUserMedia, intervalMs]);
  return { status, stop };
}
