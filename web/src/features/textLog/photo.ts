import { PHOTO_LOG_MAX_DATA_URL } from '@lean/shared';

export const PHOTO_MAX_SIDE = 1024;
export function fitWithin(width: number, height: number, max = PHOTO_MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function decodePhoto(
  file: File,
): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      /* Try the browser's image decoder next. */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('decode'));
      image.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => {},
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function preparePhoto(file: File): Promise<string> {
  let decoded: Awaited<ReturnType<typeof decodePhoto>>;
  try {
    decoded = await decodePhoto(file);
    if (!decoded.width || !decoded.height) {
      decoded.release();
      throw new Error('decode');
    }
  } catch {
    throw new Error('No pude leer la foto. Probá con otra.');
  }
  try {
    // Re-encoding pixels strips EXIF metadata, including location and device details.
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No pude leer la foto. Probá con otra.');
    for (const max of [PHOTO_MAX_SIDE, 768]) {
      const dimensions = fitWithin(decoded.width, decoded.height, max);
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.8, 0.65, 0.5]) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (
          dataUrl.startsWith('data:image/jpeg;base64,') &&
          dataUrl.length <= PHOTO_LOG_MAX_DATA_URL
        )
          return dataUrl;
      }
    }
    throw new Error('La foto es demasiado grande. Probá con otra.');
  } finally {
    decoded.release();
  }
}
