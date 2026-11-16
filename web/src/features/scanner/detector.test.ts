import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { Ponyfill, prepare } = vi.hoisted(() => ({
  Ponyfill: vi.fn(function () {
    return { detect: vi.fn() };
  }),
  prepare: vi.fn(),
}));
vi.mock('barcode-detector/ponyfill', () => ({
  BarcodeDetector: Ponyfill,
  prepareZXingModule: prepare,
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
    const locateFile = prepare.mock.calls[0]![0].overrides.locateFile as (
      path: string,
      prefix: string,
    ) => string;
    expect(locateFile('zxing_reader.wasm', 'https://cdn.invalid/')).toBe('/assets/reader.wasm');
    expect(locateFile('other.js', '/local/')).toBe('/local/other.js');
  },
);
