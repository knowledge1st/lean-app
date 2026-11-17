// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { useBarcodeScanner } from './useBarcodeScanner';
import type { DetectorLike } from './detector';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
const tick = (ms = 200) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
function setup() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const detect = vi.fn<DetectorLike['detect']>().mockResolvedValue([]);
  const createDetector = vi.fn().mockResolvedValue({ detect });
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  const onDetect = vi.fn();
  const vibrate = vi.fn();
  vi.stubGlobal('navigator', { vibrate });
  let stop!: () => void;
  function Harness({
    active = true,
    callback = onDetect,
  }: {
    active?: boolean;
    callback?: (code: string) => void;
  }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const scanner = useBarcodeScanner({
      videoRef,
      onDetect: callback,
      active,
      createDetector,
      getUserMedia,
    });
    stop = scanner.stop;
    return (
      <>
        <video ref={videoRef} data-testid="video" />
        <span>{scanner.status}</span>
      </>
    );
  }
  const view = render(<Harness />);
  return {
    ...view,
    Harness,
    track,
    stream,
    detect,
    createDetector,
    getUserMedia,
    onDetect,
    vibrate,
    stop: () => stop(),
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(HTMLVideoElement.prototype, 'readyState', { configurable: true, value: 2 });
  vi.spyOn(HTMLVideoElement.prototype, 'play').mockResolvedValue(undefined);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('detecta una vez, normaliza espacios, libera la cámara y vibra', async () => {
  const s = setup();
  s.detect.mockResolvedValue([{ rawValue: '779 0001000012', format: 'ean_13' }]);
  await flush();
  expect(screen.getByText('scanning')).toBeTruthy();
  expect(s.getUserMedia).toHaveBeenCalledWith({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  await tick();
  expect(s.onDetect).toHaveBeenCalledExactlyOnceWith('7790001000012');
  expect(s.track.stop).toHaveBeenCalledTimes(1);
  expect((screen.getByTestId('video') as HTMLVideoElement).srcObject).toBeNull();
  expect(s.vibrate).toHaveBeenCalledWith(60);
});
it('descarta lecturas repetidas y otros códigos, sin detectar más frames', async () => {
  const s = setup();
  s.detect.mockResolvedValue([
    { rawValue: '12345678' },
    { rawValue: '12345678' },
    { rawValue: '87654321' },
  ]);
  await flush();
  await tick(2000);
  expect(s.onDetect).toHaveBeenCalledExactlyOnceWith('12345678');
  expect(s.detect).toHaveBeenCalledTimes(1);
});
it('ignora valores inválidos, formatos ajenos y errores de un frame', async () => {
  const s = setup();
  s.detect
    .mockResolvedValueOnce([
      { rawValue: 'abc' },
      { rawValue: '1234567' },
      { rawValue: '12345678', format: 'qr_code' },
    ])
    .mockRejectedValueOnce(new Error('frame'))
    .mockResolvedValueOnce([{ rawValue: '12345678', format: 'ean_8' }]);
  await flush();
  await tick(400);
  expect(s.onDetect).not.toHaveBeenCalled();
  await tick();
  expect(s.onDetect).toHaveBeenCalledExactlyOnceWith('12345678');
});
it('desmontar detiene tracks y cancela el bucle', async () => {
  const s = setup();
  await flush();
  await tick();
  s.unmount();
  await tick(1000);
  expect(s.track.stop).toHaveBeenCalledTimes(1);
  expect(s.detect).toHaveBeenCalledTimes(1);
});
it.each(['unmount', 'inactive'] as const)(
  'libera getUserMedia pendiente al cancelar con %s',
  async (mode) => {
    const s = setup();
    await flush();
    s.rerender(<s.Harness active={false} />);
    const pending = deferred<MediaStream>();
    s.getUserMedia.mockReturnValue(pending.promise);
    s.track.stop.mockClear();
    s.rerender(<s.Harness />);
    if (mode === 'unmount') s.unmount();
    else s.rerender(<s.Harness active={false} />);
    await act(async () => {
      pending.resolve(s.stream);
    });
    expect(s.track.stop).toHaveBeenCalledTimes(1);
    expect(s.createDetector).toHaveBeenCalledTimes(1);
  },
);
it.each([
  ['NotAllowedError', 'denied'],
  ['SecurityError', 'denied'],
  ['NotFoundError', 'unavailable'],
  ['NotReadableError', 'unavailable'],
  ['OverconstrainedError', 'unavailable'],
  ['OtherError', 'error'],
])('clasifica %s como %s', async (name, status) => {
  const s = setup();
  await flush();
  s.rerender(<s.Harness active={false} />);
  s.getUserMedia.mockRejectedValue(new DOMException('', name));
  s.rerender(<s.Harness />);
  await flush();
  expect(screen.getByText(status!)).toBeTruthy();
});
it('apaga al ocultar, reinicia al volver visible y reutiliza el detector', async () => {
  const s = setup();
  await flush();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(s.track.stop).toHaveBeenCalledTimes(1);
  await tick(1000);
  expect(s.detect).not.toHaveBeenCalled();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  await flush();
  expect(s.getUserMedia).toHaveBeenCalledTimes(2);
  expect(s.createDetector).toHaveBeenCalledTimes(1);
  await tick();
  expect(s.detect).toHaveBeenCalledTimes(1);
});
it('active false libera la cámara y cancela frames', async () => {
  const s = setup();
  await flush();
  s.rerender(<s.Harness active={false} />);
  expect(s.track.stop).toHaveBeenCalledTimes(1);
  await tick(1000);
  expect(s.detect).not.toHaveBeenCalled();
});
it('detecta al volver visible aunque una detección anterior siga pendiente', async () => {
  const s = setup();
  const pending = deferred<Array<{ rawValue: string }>>();
  s.detect.mockReturnValueOnce(pending.promise).mockResolvedValueOnce([{ rawValue: '12345678' }]);
  await flush();
  await tick();
  expect(s.detect).toHaveBeenCalledTimes(1);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(s.track.stop).toHaveBeenCalledTimes(1);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  await flush();
  expect(s.getUserMedia).toHaveBeenCalledTimes(2);
  expect(screen.getByText('scanning')).toBeTruthy();
  await tick();
  expect(s.detect).toHaveBeenCalledTimes(2);
  expect(s.onDetect).toHaveBeenCalledExactlyOnceWith('12345678');
  await act(async () => {
    pending.resolve([{ rawValue: '87654321' }]);
  });
  await tick(1000);
  expect(s.onDetect).toHaveBeenCalledExactlyOnceWith('12345678');
  expect(s.detect).toHaveBeenCalledTimes(2);
});
it('no superpone detect y descarta resultados pendientes después de stop', async () => {
  const s = setup();
  const pending = deferred<Array<{ rawValue: string }>>();
  s.detect.mockReturnValue(pending.promise);
  await flush();
  await tick(1000);
  expect(s.detect).toHaveBeenCalledTimes(1);
  act(() => s.stop());
  await act(async () => {
    pending.resolve([{ rawValue: '12345678' }]);
  });
  await tick(1000);
  expect(s.onDetect).not.toHaveBeenCalled();
  expect(s.track.stop).toHaveBeenCalledTimes(1);
});
it('usa el callback nuevo sin reiniciar la cámara y espera readyState', async () => {
  const s = setup();
  Object.defineProperty(HTMLVideoElement.prototype, 'readyState', { configurable: true, value: 1 });
  await flush();
  await tick();
  expect(s.detect).not.toHaveBeenCalled();
  const callback = vi.fn();
  s.rerender(<s.Harness callback={callback} />);
  Object.defineProperty(HTMLVideoElement.prototype, 'readyState', { configurable: true, value: 2 });
  s.detect.mockResolvedValue([{ rawValue: '12345678' }]);
  await tick();
  expect(s.getUserMedia).toHaveBeenCalledTimes(1);
  expect(callback).toHaveBeenCalledWith('12345678');
  expect(s.onDetect).not.toHaveBeenCalled();
});
it('libera la cámara si cargar el detector falla', async () => {
  const s = setup();
  s.createDetector.mockRejectedValue(new Error('WASM'));
  await flush();
  expect(screen.getByText('error')).toBeTruthy();
  expect(s.track.stop).toHaveBeenCalledTimes(1);
});
it('sin mediaDevices ofrece el ingreso manual con estado unavailable', async () => {
  function Harness() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const { status } = useBarcodeScanner({ videoRef, active: true, onDetect: vi.fn() });
    return (
      <>
        <video ref={videoRef} />
        <span>{status}</span>
      </>
    );
  }
  vi.stubGlobal('navigator', {});
  render(<Harness />);
  await flush();
  expect(screen.getByText('unavailable')).toBeTruthy();
});

it('reintenta crear el detector después de una carga fallida', async () => {
  const s = setup();
  s.createDetector.mockRejectedValueOnce(new Error('WASM'));
  await flush();
  expect(screen.getByText('error')).toBeTruthy();
  expect(s.track.stop).toHaveBeenCalledTimes(1);
  s.rerender(<s.Harness active={false} />);
  s.rerender(<s.Harness />);
  await flush();
  expect(screen.getByText('scanning')).toBeTruthy();
  expect(s.createDetector).toHaveBeenCalledTimes(2);
});
it('diez fallos consecutivos de detect liberan la cámara y terminan en error', async () => {
  const s = setup();
  s.detect.mockRejectedValue(new Error('frame'));
  await flush();
  await tick(1800);
  expect(screen.getByText('scanning')).toBeTruthy();
  expect(s.track.stop).not.toHaveBeenCalled();
  await tick();
  expect(screen.getByText('error')).toBeTruthy();
  expect(s.track.stop).toHaveBeenCalledTimes(1);
  await tick(1000);
  expect(s.detect).toHaveBeenCalledTimes(10);
});
it('un frame exitoso reinicia la cuenta de errores consecutivos', async () => {
  const s = setup();
  s.detect.mockRejectedValue(new Error('frame'));
  await flush();
  await tick(1800);
  s.detect.mockResolvedValueOnce([]);
  await tick(2000);
  expect(screen.getByText('scanning')).toBeTruthy();
  expect(s.track.stop).not.toHaveBeenCalled();
  await tick();
  expect(screen.getByText('error')).toBeTruthy();
});
it('un rechazo vigente de play libera la cámara y termina en error', async () => {
  vi.mocked(HTMLVideoElement.prototype.play).mockRejectedValue(new Error('play'));
  const s = setup();
  await flush();
  expect(screen.getByText('error')).toBeTruthy();
  expect(s.track.stop).toHaveBeenCalledTimes(1);
  expect(s.createDetector).not.toHaveBeenCalled();
  await tick(1000);
  expect(s.detect).not.toHaveBeenCalled();
});
it('ignora el rechazo de play después de desmontar', async () => {
  const pending = deferred<void>();
  vi.mocked(HTMLVideoElement.prototype.play).mockReturnValue(pending.promise);
  const s = setup();
  await flush();
  expect(screen.getByText('starting')).toBeTruthy();
  s.unmount();
  await act(async () => pending.reject(new DOMException('cancelado', 'AbortError')));
  await tick(1000);
  expect(s.track.stop).toHaveBeenCalledTimes(1);
  expect(s.createDetector).not.toHaveBeenCalled();
  expect(s.onDetect).not.toHaveBeenCalled();
  expect(s.container.textContent).toBe('');
});
it('continúa si play no devuelve una promesa', async () => {
  vi.mocked(HTMLVideoElement.prototype.play).mockReturnValue(undefined as unknown as Promise<void>);
  setup();
  await flush();
  expect(screen.getByText('scanning')).toBeTruthy();
});

it.each(['camera', 'play', 'detector'] as const)(
  'limita el inicio a 15 segundos en %s y libera recursos tardíos',
  async (stage) => {
    const s = setup();
    await flush();
    s.rerender(<s.Harness active={false} />);
    s.track.stop.mockClear();
    const camera = deferred<MediaStream>();
    const playback = deferred<void>();
    const detector = deferred<DetectorLike>();
    if (stage === 'camera') s.getUserMedia.mockReturnValue(camera.promise);
    if (stage === 'play')
      vi.mocked(HTMLVideoElement.prototype.play).mockReturnValue(playback.promise);
    if (stage === 'detector') s.createDetector.mockReturnValue(detector.promise);
    // A fresh hook also creates a fresh detector session.
    s.unmount();
    function SlowCamera() {
      const videoRef = useRef<HTMLVideoElement>(null);
      const { status } = useBarcodeScanner({
        videoRef,
        active: true,
        onDetect: s.onDetect,
        getUserMedia: s.getUserMedia,
        createDetector: s.createDetector,
      });
      return (
        <>
          <video ref={videoRef} data-testid="slow-video" />
          <span>{status}</span>
        </>
      );
    }
    render(<SlowCamera />);
    await tick(14999);
    expect(screen.getByText('starting')).toBeTruthy();
    await tick(1);
    expect(screen.getByText('error')).toBeTruthy();
    expect(s.track.stop).toHaveBeenCalledTimes(stage === 'camera' ? 0 : 1);
    await act(async () => {
      camera.resolve(s.stream);
      playback.resolve();
      detector.resolve({ detect: s.detect });
    });
    expect(s.track.stop).toHaveBeenCalledTimes(1);
    expect((screen.getByTestId('slow-video') as HTMLVideoElement).srcObject).toBeNull();
    expect(screen.getByText('error')).toBeTruthy();
    expect(s.onDetect).not.toHaveBeenCalled();
  },
);
