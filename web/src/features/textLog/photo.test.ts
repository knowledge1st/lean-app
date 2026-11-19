// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { PHOTO_LOG_MAX_DATA_URL } from '@lean/shared';
import { fitWithin, preparePhoto } from './photo';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each([
  [2048, 1024, 1024, 512],
  [1024, 2048, 512, 1024],
  [320, 240, 320, 240],
  [2000, 2000, 1024, 1024],
  [10000, 1, 1024, 1],
])('fits %i × %i without enlarging', (width, height, expectedWidth, expectedHeight) => {
  expect(fitWithin(width, height)).toEqual({ width: expectedWidth, height: expectedHeight });
});
function mockCanvas() {
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL');
  const close = vi.fn();
  const bitmap = vi.fn().mockResolvedValue({ width: 2048, height: 1024, close });
  vi.stubGlobal('createImageBitmap', bitmap);
  return { drawImage, encode, close, bitmap };
}
const jpeg = 'data:image/jpeg;base64,small';
const large = 'data:image/jpeg;base64,' + 'x'.repeat(PHOTO_LOG_MAX_DATA_URL);
it('tries descending JPEG qualities and closes the oriented bitmap', async () => {
  const { encode, bitmap, close, drawImage } = mockCanvas();
  encode.mockReturnValueOnce(large).mockReturnValueOnce(large).mockReturnValueOnce(jpeg);
  const file = new File(['photo'], 'photo.jpg');
  expect(await preparePhoto(file)).toBe(jpeg);
  expect(bitmap).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' });
  expect(encode.mock.calls).toEqual([
    ['image/jpeg', 0.8],
    ['image/jpeg', 0.65],
    ['image/jpeg', 0.5],
  ]);
  expect(drawImage.mock.calls[0]?.slice(1)).toEqual([0, 0, 1024, 512]);
  expect(close).toHaveBeenCalledOnce();
});
it('shrinks to 768 after exhausting qualities and reports oversized photos', async () => {
  const { encode, drawImage, close } = mockCanvas();
  encode.mockReturnValue(large);
  await expect(preparePhoto(new File([''], 'large.jpg'))).rejects.toThrow(
    'La foto es demasiado grande. Probá con otra.',
  );
  expect(encode).toHaveBeenCalledTimes(6);
  expect(drawImage.mock.calls[1]?.slice(1)).toEqual([0, 0, 768, 384]);
  expect(close).toHaveBeenCalledOnce();
});
it.each([true, false])(
  'reports decoding failure with bitmap available: %s and revokes the fallback URL',
  async (available) => {
    vi.stubGlobal(
      'createImageBitmap',
      available ? vi.fn().mockRejectedValue(new Error('HEIC')) : undefined,
    );
    const revoke = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:decode-only'),
      revokeObjectURL: revoke,
    });
    vi.stubGlobal(
      'Image',
      class {
        onerror?: () => void;
        set src(_value: string) {
          queueMicrotask(() => this.onerror?.());
        }
      },
    );
    await expect(preparePhoto(new File([''], 'photo.heic'))).rejects.toThrow(
      'No pude leer la foto. Probá con otra.',
    );
    expect(revoke).toHaveBeenCalledWith('blob:decode-only');
  },
);
it('uses the image fallback when bitmap decoding fails', async () => {
  const { encode } = mockCanvas();
  encode.mockReturnValue(jpeg);
  vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('unsupported')));
  const revoke = vi.fn();
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:decode-only'),
    revokeObjectURL: revoke,
  });
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 800;
      naturalHeight = 600;
      onload?: () => void;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
  expect(await preparePhoto(new File([''], 'photo.jpg'))).toBe(jpeg);
  expect(revoke).toHaveBeenCalledOnce();
});
