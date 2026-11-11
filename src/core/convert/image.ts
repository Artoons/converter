import type { FormatId } from '../formats';

/**
 * Browser-side raster conversions:
 * PNG, JPG, WEBP, AVIF, BMP, ICO, GIF, SVG, TGA (Targa), PPM (Netpbm), and Image -> PDF.
 */

function decodeTga(buf: Uint8Array): ImageData {
  if (buf.length < 18) throw new Error('Invalid TGA file');
  const idLen = buf[0];
  const colorMapType = buf[1];
  const imageType = buf[2];
  const width = buf[12] | (buf[13] << 8);
  const height = buf[14] | (buf[15] << 8);
  const bpp = buf[16];
  const desc = buf[17];
  const topOrigin = (desc & 0x20) !== 0;

  if (colorMapType !== 0 || (imageType !== 2 && imageType !== 10) || (bpp !== 24 && bpp !== 32)) {
    throw new Error('Only true-color 24/32-bit TGA files are supported in browser mode');
  }

  const bytesPerPixel = bpp >> 3;
  const out = new Uint8ClampedArray(width * height * 4);
  let src = 18 + idLen;
  const totalPixels = width * height;
  const rawPixels = new Uint8Array(totalPixels * 4);
  let px = 0;

  const readPixel = (o: number) => [buf[o + 2], buf[o + 1], buf[o], bytesPerPixel === 4 ? buf[o + 3] : 255];

  if (imageType === 2) {
    for (; px < totalPixels && src + bytesPerPixel <= buf.length; px++, src += bytesPerPixel) {
      const [r, g, b, a] = readPixel(src);
      const d = px * 4;
      rawPixels[d] = r;
      rawPixels[d + 1] = g;
      rawPixels[d + 2] = b;
      rawPixels[d + 3] = a;
    }
  } else {
    while (px < totalPixels && src < buf.length) {
      const header = buf[src++];
      const count = (header & 0x7f) + 1;
      if (header & 0x80) {
        const [r, g, b, a] = readPixel(src);
        src += bytesPerPixel;
        for (let i = 0; i < count && px < totalPixels; i++, px++) {
          const d = px * 4;
          rawPixels[d] = r;
          rawPixels[d + 1] = g;
          rawPixels[d + 2] = b;
          rawPixels[d + 3] = a;
        }
      } else {
        for (let i = 0; i < count && px < totalPixels; i++, px++, src += bytesPerPixel) {
          const [r, g, b, a] = readPixel(src);
          const d = px * 4;
          rawPixels[d] = r;
          rawPixels[d + 1] = g;
          rawPixels[d + 2] = b;
          rawPixels[d + 3] = a;
        }
      }
    }
  }

  for (let y = 0; y < height; y++) {
    const sy = topOrigin ? y : height - 1 - y;
    out.set(rawPixels.subarray(sy * width * 4, (sy + 1) * width * 4), y * width * 4);
  }
  return new ImageData(out, width, height);
}

function encodeTga(ctx: CanvasRenderingContext2D, w: number, h: number): Blob {
  const { data } = ctx.getImageData(0, 0, w, h);
  const out = new Uint8Array(18 + w * h * 4);
  out[2] = 2; // uncompressed true-color
  out[12] = w & 0xff;
  out[13] = (w >> 8) & 0xff;
  out[14] = h & 0xff;
  out[15] = (h >> 8) & 0xff;
  out[16] = 32; // 32-bit BGRA
  out[17] = 0x28; // top-left origin + 8-bit alpha
  let p = 18;
  for (let i = 0; i < data.length; i += 4) {
    out[p++] = data[i + 2];
    out[p++] = data[i + 1];
    out[p++] = data[i];
    out[p++] = data[i + 3];
  }
  return new Blob([out], { type: 'image/x-tga' });
}

function decodePpm(buf: Uint8Array): ImageData {
  // Parse P3 (ASCII RGB) or P6 (binary RGB) header
  let i = 0;
  const nextToken = (): string => {
    while (i < buf.length) {
      if (buf[i] === 0x23) {
        while (i < buf.length && buf[i] !== 0x0a) i++;
      } else if (buf[i] <= 0x20) i++;
      else break;
    }
    let s = '';
    while (i < buf.length && buf[i] > 0x20 && buf[i] !== 0x23) s += String.fromCharCode(buf[i++]);
    return s;
  };
  const magic = nextToken();
  const width = Number(nextToken());
  const height = Number(nextToken());
  const maxVal = Number(nextToken()) || 255;
  i++; // single whitespace after maxVal
  if (!width || !height) throw new Error('Invalid PPM header');

  const out = new Uint8ClampedArray(width * height * 4);
  if (magic === 'P6') {
    for (let p = 0; p < width * height && i + 2 < buf.length; p++, i += 3) {
      const d = p * 4;
      out[d] = (buf[i] * 255) / maxVal;
      out[d + 1] = (buf[i + 1] * 255) / maxVal;
      out[d + 2] = (buf[i + 2] * 255) / maxVal;
      out[d + 3] = 255;
    }
  } else if (magic === 'P3') {
    for (let p = 0; p < width * height; p++) {
      const d = p * 4;
      out[d] = (Number(nextToken()) * 255) / maxVal;
      out[d + 1] = (Number(nextToken()) * 255) / maxVal;
      out[d + 2] = (Number(nextToken()) * 255) / maxVal;
      out[d + 3] = 255;
    }
  } else {
    throw new Error(`Unsupported Netpbm variant: ${magic}`);
  }
  return new ImageData(out, width, height);
}

function encodePpm(ctx: CanvasRenderingContext2D, w: number, h: number): Blob {
  const { data } = ctx.getImageData(0, 0, w, h);
  const header = new TextEncoder().encode(`P6\n${w} ${h}\n255\n`);
  const body = new Uint8Array(w * h * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    body[j] = data[i];
    body[j + 1] = data[i + 1];
    body[j + 2] = data[i + 2];
  }
  return new Blob([header, body], { type: 'image/x-portable-pixmap' });
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

async function loadRasterToCanvas(blob: Blob, from: FormatId): Promise<[HTMLCanvasElement, CanvasRenderingContext2D]> {
  if (from === 'tga' || from === 'ppm') {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const imgData = from === 'tga' ? decodeTga(bytes) : decodePpm(bytes);
    const [c, ctx] = makeCanvas(imgData.width, imgData.height);
    ctx.putImageData(imgData, 0, 0);
    return [c, ctx];
  }
  const isSvg = from === 'svg';
  const src = URL.createObjectURL(isSvg && blob.type !== 'image/svg+xml' ? new Blob([blob], { type: 'image/svg+xml' }) : blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    await img.decode();
    const w = img.naturalWidth || 1024;
    const h = img.naturalHeight || 1024;
    const [c, ctx] = makeCanvas(w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return [c, ctx];
  } catch {
    throw new Error('This image could not be decoded by the browser engine.');
  } finally {
    setTimeout(() => URL.revokeObjectURL(src), 0);
  }
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
  v.setInt32(22, h, true);
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

async function encodeIco(srcCanvas: HTMLCanvasElement, w: number, h: number): Promise<Blob> {
  const largest = Math.max(w, h);
  let sizes = [16, 24, 32, 48, 64, 128, 256].filter((s) => s <= Math.max(largest, 16));
  if (!sizes.length) sizes = [16];
  const pngs: Uint8Array[] = [];
  for (const s of sizes) {
    const [c, ctx] = makeCanvas(s, s);
    const scale = Math.min(s / w, s / h);
    const dw = w * scale;
    const dh = h * scale;
    ctx.drawImage(srcCanvas, (s - dw) / 2, (s - dh) / 2, dw, dh);
    pngs.push(new Uint8Array(await (await toBlob(c, 'image/png')).arrayBuffer()));
  }
  const headerSize = 6 + 16 * sizes.length;
  const total = headerSize + pngs.reduce((a, p) => a + p.length, 0);
  const buf = new ArrayBuffer(total);
  const v = new DataView(buf);
  v.setUint16(0, 0, true);
  v.setUint16(2, 1, true);
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

function encodeStaticGif(ctx: CanvasRenderingContext2D, w: number, h: number): Blob {
  const { data } = ctx.getImageData(0, 0, w, h);
  const palette = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    palette[i * 3] = Math.round((((i >> 5) & 0x07) * 255) / 7);
    palette[i * 3 + 1] = Math.round((((i >> 2) & 0x07) * 255) / 7);
    palette[i * 3 + 2] = Math.round(((i & 0x03) * 255) / 3);
  }
  const idx = new Uint8Array(w * h);
  for (let p = 0, j = 0; p < data.length; p += 4, j++) {
    idx[j] = ((data[p] & 0xe0) | ((data[p + 1] & 0xe0) >> 3) | (data[p + 2] >> 6)) & 0xff;
  }

  // LZW 8-bit
  const minCodeSize = 8;
  const clearCode = 256;
  const endCode = 257;
  const bytes: number[] = [minCodeSize];
  const sub: number[] = [];
  let bitBuf = 0;
  let bitCount = 0;
  const flush = () => {
    if (!sub.length) return;
    bytes.push(sub.length, ...sub);
    sub.length = 0;
  };
  const writeBits = (code: number, size: number) => {
    bitBuf |= code << bitCount;
    bitCount += size;
    while (bitCount >= 8) {
      sub.push(bitBuf & 0xff);
      if (sub.length === 255) flush();
      bitBuf >>= 8;
      bitCount -= 8;
    }
  };
  let codeSize = 9;
  let nextCode = 258;
  const table = new Map<number, number>();
  writeBits(clearCode, codeSize);
  let prefix = idx[0] ?? 0;
  for (let i = 1; i < idx.length; i++) {
    const k = idx[i];
    const key = (prefix << 8) | k;
    const hit = table.get(key);
    if (hit !== undefined) prefix = hit;
    else {
      writeBits(prefix, codeSize);
      if (nextCode < 4096) {
        table.set(key, nextCode++);
        if (nextCode > 1 << codeSize && codeSize < 12) codeSize++;
      } else {
        writeBits(clearCode, codeSize);
        table.clear();
        codeSize = 9;
        nextCode = 258;
      }
      prefix = k;
    }
  }
  writeBits(prefix, codeSize);
  writeBits(endCode, codeSize);
  if (bitCount > 0) sub.push(bitBuf & 0xff);
  flush();
  bytes.push(0, 0x3b);

  const head = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, w & 0xff, (w >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff, 0xf7, 0, 0]);
  const desc = new Uint8Array([0x2c, 0, 0, 0, 0, w & 0xff, (w >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff, 0x00]);
  return new Blob([head, palette, desc, new Uint8Array(bytes)], { type: 'image/gif' });
}

/** Wraps a canvas image into a standalone single-page PDF-1.4 document (0 dependencies). */
async function encodeImagePdf(canvas: HTMLCanvasElement, w: number, h: number, quality: number): Promise<Blob> {
  // Render onto white matte for JPEG stream
  const [matte, mctx] = makeCanvas(w, h);
  mctx.fillStyle = '#ffffff';
  mctx.fillRect(0, 0, w, h);
  mctx.drawImage(canvas, 0, 0);
  const jpg = new Uint8Array(await (await toBlob(matte, 'image/jpeg', quality)).arrayBuffer());

  // Fit inside A4/Letter points (72 dpi), preserving aspect ratio
  const maxSide = 792;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const pw = Math.max(72, Math.round(w * scale));
  const ph = Math.max(72, Math.round(h * scale));

  const enc = new TextEncoder();
  const chunks: BlobPart[] = [];
  const offsets: number[] = [0];
  let pos = 0;
  const pushStr = (s: string) => {
    const b = enc.encode(s);
    chunks.push(b);
    pos += b.length;
  };
  const pushBytes = (b: Uint8Array) => {
    chunks.push(b.slice());
    pos += b.length;
  };
  const startObj = (id: number) => {
    offsets[id] = pos;
    pushStr(`${id} 0 obj\n`);
  };

  pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');
  startObj(1);
  pushStr('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  startObj(2);
  pushStr('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  startObj(3);
  pushStr(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`);
  startObj(4);
  pushStr(
    `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`,
  );
  pushBytes(jpg);
  pushStr('\nendstream\nendobj\n');

  const content = `q\n${pw} 0 0 ${ph} 0 0 cm\n/Im0 Do\nQ\n`;
  startObj(5);
  pushStr(`<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);

  const xrefOffset = pos;
  pushStr('xref\n0 6\n0000000000 65535 f \n');
  for (let i = 1; i <= 5; i++) {
    pushStr(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  pushStr(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

export async function convertImage(input: Blob, from: FormatId, to: FormatId, quality = 0.92): Promise<Blob> {
  const [srcCanvas, srcCtx] = await loadRasterToCanvas(input, from);
  const w = srcCanvas.width;
  const h = srcCanvas.height;

  // Formats without alpha get a white matte
  let canvas = srcCanvas;
  let ctx = srcCtx;
  if (to === 'jpg' || to === 'bmp' || to === 'ppm') {
    [canvas, ctx] = makeCanvas(w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(srcCanvas, 0, 0, w, h);
  }

  switch (to) {
    case 'png':
      return toBlob(canvas, 'image/png');
    case 'jpg':
      return toBlob(canvas, 'image/jpeg', quality);
    case 'webp':
      return toBlob(canvas, 'image/webp', quality);
    case 'avif':
      try {
        return await toBlob(canvas, 'image/avif', quality);
      } catch {
        // Fallback if current browser lacks AVIF encoder
        return toBlob(canvas, 'image/webp', quality);
      }
    case 'bmp':
      return encodeBmp(ctx, w, h);
    case 'ico':
      return encodeIco(canvas, w, h);
    case 'gif':
      return encodeStaticGif(ctx, w, h);
    case 'tga':
      return encodeTga(ctx, w, h);
    case 'ppm':
      return encodePpm(ctx, w, h);
    case 'pdf':
      return encodeImagePdf(canvas, w, h, quality);
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
