import type { FormatId } from '../formats';

/** Raster conversion via the HTML5 Canvas API (runs fully offline in the browser/webview). */

async function loadImage(blob: Blob, isSvg: boolean): Promise<HTMLImageElement> {
  // SVG needs an explicit mime type to render from a blob URL.
  const src = URL.createObjectURL(isSvg && blob.type !== 'image/svg+xml' ? new Blob([blob], { type: 'image/svg+xml' }) : blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    await img.decode();
    return img;
  } catch {
    throw new Error('This image could not be decoded by the browser engine.');
  } finally {
    // Safe to revoke after decode() — pixels are retained by the element.
    setTimeout(() => URL.revokeObjectURL(src), 0);
  }
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.imageSmoothingQuality = 'high';
  return [c, ctx];
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => {
        if (!b) return reject(new Error(`Encoding to ${mime} failed`));
        if (b.type !== mime) return reject(new Error(`This browser cannot encode ${mime.replace('image/', '').toUpperCase()}`));
        resolve(b);
      },
      mime,
      quality,
    ),
  );
}

function encodeBmp(ctx: CanvasRenderingContext2D, w: number, h: number): Blob {
  const { data } = ctx.getImageData(0, 0, w, h);
  const rowSize = Math.ceil((w * 3) / 4) * 4;
  const pixelBytes = rowSize * h;
  const buf = new ArrayBuffer(54 + pixelBytes);
  const v = new DataView(buf);
  v.setUint8(0, 0x42);
  v.setUint8(1, 0x4d);
  v.setUint32(2, 54 + pixelBytes, true);
  v.setUint32(10, 54, true);
  v.setUint32(14, 40, true);
  v.setInt32(18, w, true);
  v.setInt32(22, h, true); // bottom-up
  v.setUint16(26, 1, true);
  v.setUint16(28, 24, true);
  v.setUint32(34, pixelBytes, true);
  v.setUint32(38, 2835, true);
  v.setUint32(42, 2835, true);
  const out = new Uint8Array(buf);
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * w * 4;
    let dst = 54 + y * rowSize;
    for (let x = 0; x < w; x++) {
      const i = src + x * 4;
      out[dst++] = data[i + 2];
      out[dst++] = data[i + 1];
      out[dst++] = data[i];
    }
  }
  return new Blob([buf], { type: 'image/bmp' });
}

async function encodeIco(img: HTMLImageElement, w: number, h: number): Promise<Blob> {
  const largest = Math.max(w, h);
  let sizes = [16, 24, 32, 48, 64, 128, 256].filter((s) => s <= Math.max(largest, 16));
  if (!sizes.length) sizes = [16];
  const pngs: Uint8Array[] = [];
  for (const s of sizes) {
    const [c, ctx] = makeCanvas(s, s);
    const scale = Math.min(s / w, s / h);
    const dw = w * scale;
    const dh = h * scale;
    ctx.drawImage(img, (s - dw) / 2, (s - dh) / 2, dw, dh);
    pngs.push(new Uint8Array(await (await toBlob(c, 'image/png')).arrayBuffer()));
  }
  const headerSize = 6 + 16 * sizes.length;
  const total = headerSize + pngs.reduce((a, p) => a + p.length, 0);
  const buf = new ArrayBuffer(total);
  const v = new DataView(buf);
  v.setUint16(0, 0, true);
  v.setUint16(2, 1, true); // type: icon
  v.setUint16(4, sizes.length, true);
  let offset = headerSize;
  sizes.forEach((s, i) => {
    const e = 6 + i * 16;
    v.setUint8(e, s >= 256 ? 0 : s);
    v.setUint8(e + 1, s >= 256 ? 0 : s);
    v.setUint8(e + 2, 0);
    v.setUint8(e + 3, 0);
    v.setUint16(e + 4, 1, true);
    v.setUint16(e + 6, 32, true);
    v.setUint32(e + 8, pngs[i].length, true);
    v.setUint32(e + 12, offset, true);
    new Uint8Array(buf, offset, pngs[i].length).set(pngs[i]);
    offset += pngs[i].length;
  });
  return new Blob([buf], { type: 'image/x-icon' });
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

export async function convertImage(input: Blob, from: FormatId, to: FormatId, quality = 0.92): Promise<Blob> {
  const img = await loadImage(input, from === 'svg');
  const w = img.naturalWidth || 1024;
  const h = img.naturalHeight || 1024;
  const [canvas, ctx] = makeCanvas(w, h);

  // Formats without alpha get a white matte.
  if (to === 'jpg' || to === 'bmp') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(img, 0, 0, w, h);

  switch (to) {
    case 'png':
      return toBlob(canvas, 'image/png');
    case 'jpg':
      return toBlob(canvas, 'image/jpeg', quality);
    case 'webp':
      return toBlob(canvas, 'image/webp', quality);
    case 'bmp':
      return encodeBmp(ctx, w, h);
    case 'ico':
      return encodeIco(img, w, h);
    case 'svg': {
      const png = new Uint8Array(await (await toBlob(canvas, 'image/png')).arrayBuffer());
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
        `<image width="${w}" height="${h}" href="data:image/png;base64,${bytesToBase64(png)}"/></svg>`;
      return new Blob([svg], { type: 'image/svg+xml' });
    }
    default:
      throw new Error(`${to.toUpperCase()} output requires a native engine`);
  }
}
