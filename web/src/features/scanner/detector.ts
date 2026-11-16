export type DetectorLike = {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string; format?: string }>>;
};
export const SCAN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;
type DetectorConstructor = {
  new (options: { formats: Array<(typeof SCAN_FORMATS)[number]> }): DetectorLike;
  getSupportedFormats(): Promise<readonly string[]>;
};
let ponyfillPromise: Promise<DetectorConstructor> | undefined;
export async function createBarcodeDetector(): Promise<DetectorLike> {
  const Native = (globalThis as typeof globalThis & { BarcodeDetector?: DetectorConstructor })
    .BarcodeDetector;
  if (Native) {
    const supported = await Native.getSupportedFormats();
    if (SCAN_FORMATS.every((format) => supported.includes(format))) {
      return new Native({ formats: [...SCAN_FORMATS] });
    }
  }
  ponyfillPromise ??= (async () => {
    const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill');
    const { default: wasmUrl } = await import('zxing-wasm/reader/zxing_reader.wasm?url');
    prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) =>
          path.endsWith('.wasm') ? wasmUrl : prefix + path,
      },
    });
    return BarcodeDetector;
  })();
  const Detector = await ponyfillPromise;
  return new Detector({ formats: [...SCAN_FORMATS] });
}
