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
    const { BarcodeDetector, prepareZXingModule, purgeZXingModule } =
      await import('barcode-detector/ponyfill');
    try {
      const { default: wasmUrl } = await import('zxing-wasm/reader/zxing_reader.wasm?url');
      await prepareZXingModule({
        fireImmediately: true,
        overrides: {
          locateFile: (path: string, prefix: string) =>
            path.endsWith('.wasm') ? wasmUrl : prefix + path,
        },
      });
    } catch (failure) {
      purgeZXingModule();
      throw failure;
    }
    return BarcodeDetector;
  })().catch((failure: unknown) => {
    ponyfillPromise = undefined;
    throw failure;
  });
  const Detector = await ponyfillPromise;
  return new Detector({ formats: [...SCAN_FORMATS] });
}
