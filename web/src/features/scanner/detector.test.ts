import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { Ponyfill, prepare, purge } = vi.hoisted(() => ({
  Ponyfill: vi.fn(function () {
    return { detect: vi.fn() };
  }),
  prepare: vi.fn(),
  purge: vi.fn(),
}));
vi.mock('barcode-detector/ponyfill', () => ({
  BarcodeDetector: Ponyfill,
  prepareZXingModule: prepare,
  purgeZXingModule: purge,
}));
vi.mock('zxing-wasm/reader/zxing_reader.wasm?url', () => ({ default: '/assets/reader.wasm' }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());
it('usa el detector nativo solamente con los cuatro formatos', async () => {
  const { createBarcodeDetector, SCAN_FORMATS } = await import('./detector');
  const Native = Object.assign(
    vi.fn(function () {
      return { detect: vi.fn() };
    }),
    {
      getSupportedFormats: vi.fn().mockResolvedValue([...SCAN_FORMATS, 'qr_code']),
    },
  );
  vi.stubGlobal('BarcodeDetector', Native);
  await createBarcodeDetector();
  expect(Native).toHaveBeenCalledWith({ formats: [...SCAN_FORMATS] });
  expect(Ponyfill).not.toHaveBeenCalled();
  expect(prepare).not.toHaveBeenCalled();
});
it.each([true, false])(
  'carga el ponyfill y configura el WASM local una vez (nativo parcial: %s)',
  async (partial) => {
    vi.stubGlobal(
      'BarcodeDetector',
      partial ? { getSupportedFormats: vi.fn().mockResolvedValue(['ean_13']) } : undefined,
    );
    const { createBarcodeDetector, SCAN_FORMATS } = await import('./detector');
    await Promise.all([createBarcodeDetector(), createBarcodeDetector()]);
    expect(Ponyfill).toHaveBeenCalledTimes(2);
    expect(Ponyfill).toHaveBeenCalledWith({ formats: [...SCAN_FORMATS] });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare.mock.calls[0]![0].fireImmediately).toBe(true);
    const locateFile = prepare.mock.calls[0]![0].overrides.locateFile as (
      path: string,
      prefix: string,
    ) => string;
    expect(locateFile('zxing_reader.wasm', 'https://cdn.invalid/')).toBe('/assets/reader.wasm');
    expect(locateFile('other.js', '/local/')).toBe('/local/other.js');
  },
);

it('espera la inicialización y limpia el caché si prepare falla para reintentar', async () => {
  vi.stubGlobal('BarcodeDetector', undefined);
  let reject!: (error: Error) => void;
  prepare.mockReturnValueOnce(
    new Promise((_, fail) => {
      reject = fail;
    }),
  );
  const { createBarcodeDetector } = await import('./detector');
  const first = createBarcodeDetector();
  const second = createBarcodeDetector();
  const failures = Promise.all([
    expect(first).rejects.toThrow('WASM'),
    expect(second).rejects.toThrow('WASM'),
  ]);
  await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
  expect(Ponyfill).not.toHaveBeenCalled();
  reject(new Error('WASM'));
  await failures;
  expect(purge).toHaveBeenCalledTimes(1);
  await createBarcodeDetector();
  expect(prepare).toHaveBeenCalledTimes(2);
  expect(Ponyfill).toHaveBeenCalledTimes(1);
});
