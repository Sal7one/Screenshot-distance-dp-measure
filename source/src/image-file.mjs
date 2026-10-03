export const MAX_BYTES = 32 * 1024 * 1024;
export const MAX_PIXELS = 20_000_000;

// Header check before decode to reject oversized or unsupported raster inputs.
export function imageDimensions(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (at, n) => String.fromCharCode(...bytes.slice(at, at + n));
  if (bytes.length >= 24 && v.getUint32(0) === 0x89504e47 && v.getUint32(4) === 0x0d0a1a0a && ascii(12, 4) === 'IHDR') return { width: v.getUint32(16), height: v.getUint32(20) };
  if (bytes.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const tag = ascii(12, 4);
    if (tag === 'VP8X') return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) };
    if (tag === 'VP8L' && bytes[20] === 0x2f) return { width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8), height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0xf) << 10) };
    if (tag === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) return { width: v.getUint16(26, true) & 0x3fff, height: v.getUint16(28, true) & 0x3fff };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 4 <= bytes.length) {
      if (bytes[at] !== 0xff) break;
      while (bytes[at] === 0xff) at++;
      const marker = bytes[at++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd8) continue;
      if (at + 2 > bytes.length) break;
      const length = v.getUint16(at);
      if (length < 2 || at + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 8) return { height: v.getUint16(at + 3), width: v.getUint16(at + 5) };
      at += length;
    }
  }
  throw new Error('Use a valid PNG, JPEG or WebP screenshot. SVG, HEIF and video are not supported.');
}

export async function loadScreenshot(file) {
  if (!file.size || file.size > MAX_BYTES) throw new Error('Choose an image under 32MB. The current screenshot has been kept.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const size = imageDimensions(bytes);
  if (!size.width || !size.height || size.width * size.height > MAX_PIXELS || Math.max(size.width, size.height) > 20000) throw new Error('Screenshot exceeds the 20MP / 20,000px limit. The current screenshot has been kept.');
  const url = URL.createObjectURL(file), image = new Image();
  try {
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('This image could not be decoded. The current screenshot has been kept.')); image.src = url; });
    if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > MAX_PIXELS) throw new Error('Decoded screenshot is too large.');
    return { image, url, width: image.naturalWidth, height: image.naturalHeight, name: file.name };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
}

export function edgeScores(slot, axis) {
  const length = axis === 'y' ? slot.height : slot.width;
  const canvas = document.createElement('canvas');
  // Preserve the measured axis 1:1, average 32 samples across the middle third.
  canvas.width = axis === 'y' ? 32 : length; canvas.height = axis === 'y' ? length : 32;
  const c = canvas.getContext('2d', { willReadFrequently: true });
  if (axis === 'y') c.drawImage(slot.image, slot.width / 3, 0, slot.width / 3, slot.height, 0, 0, 32, length);
  else c.drawImage(slot.image, 0, slot.height / 3, slot.width, slot.height / 3, 0, 0, length, 32);
  const data = c.getImageData(0, 0, canvas.width, canvas.height).data;
  const scores = new Float64Array(length + 1);
  for (let n = 1; n < length; n++) {
    let sum = 0;
    for (let p = 0; p < 32; p++) {
      const here = (axis === 'y' ? n * 32 + p : p * length + n) * 4;
      const prev = here - (axis === 'y' ? 32 : 1) * 4;
      for (let channel = 0; channel < 3; channel++) sum += Math.abs(data[here + channel] - data[prev + channel]);
    }
    scores[n] = sum / 96;
  }
  canvas.width = 0; canvas.height = 0;
  return scores;
}
