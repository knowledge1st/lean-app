/* global Buffer, URL */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const payload = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(payload));
  return Buffer.concat([length, payload, checksum]);
}

// Preserve the favicon's rounded teal tile and white L on an opaque light background.
for (const [name, size] of [
  ['apple-touch-icon', 180],
  ['icon-192', 192],
  ['icon-512', 512],
]) {
  const pixels = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const channels = [0, 0, 0];
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const px = ((x + (sx + 0.5) / 4) * 64) / size;
          const py = ((y + (sy + 0.5) / 4) * 64) / size;
          const dx = Math.max(16 - px, 0, px - 48);
          const dy = Math.max(16 - py, 0, py - 48);
          const inTile = dx * dx + dy * dy <= 16 * 16;
          const inLetter = px >= 22 && py >= 16 && py < 48 && (px < 30 || (px < 46 && py >= 40));
          const color = inLetter ? [255, 255, 255] : inTile ? [8, 127, 112] : [247, 248, 250];
          color.forEach((channel, index) => {
            channels[index] += channel;
          });
        }
      }
      const offset = y * (1 + size * 3) + 1 + x * 3;
      channels.forEach((channel, index) => {
        pixels[offset + index] = Math.round(channel / 16);
      });
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  writeFileSync(
    new URL(`../public/${name}.png`, import.meta.url),
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(pixels)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
