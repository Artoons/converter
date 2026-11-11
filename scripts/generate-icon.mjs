#!/usr/bin/env node
/**
 * Generates pure-Node RGBA PNG & ICO icons for Tauri (`src-tauri/icons/`)
 * so `cargo tauri dev` and `cargo tauri build` work immediately without external image libraries.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.resolve(__dirname, '../src-tauri/icons');
fs.mkdirSync(iconsDir, { recursive: true });

// CRC32 table for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function renderIconRGBA(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const pad = Math.max(1, Math.round(size * 0.08));
  const border = Math.max(1, Math.round(size * 0.06));

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter type 0
    for (let x = 0; x < size; x++) {
      const p = rowStart + 1 + x * 4;
      const inCard = x >= pad && x < size - pad && y >= pad && y < size - pad;
      if (!inCard) {
        raw[p] = 0;
        raw[p + 1] = 0;
        raw[p + 2] = 0;
        raw[p + 3] = 0;
        continue;
      }
      const isBorder =
        x < pad + border || x >= size - pad - border || y < pad + border || y >= size - pad - border;

      // Normalised coords inside card (0..1)
      const nx = (x - pad) / (size - 2 * pad);
      const ny = (y - pad) / (size - 2 * pad);

      // Stylized "A" + pink dot
      const dxDot = nx - 0.72;
      const dyDot = ny - 0.72;
      const inDot = dxDot * dxDot + dyDot * dyDot < 0.018;

      const inLeftLeg = Math.abs(nx - (0.46 - (ny - 0.22) * 0.36)) < 0.075 && ny >= 0.2 && ny <= 0.78;
      const inRightLeg = Math.abs(nx - (0.46 + (ny - 0.22) * 0.36)) < 0.075 && ny >= 0.2 && ny <= 0.78;
      const inCrossbar = ny >= 0.52 && ny <= 0.63 && nx >= 0.3 && nx <= 0.62;

      if (isBorder || inLeftLeg || inRightLeg || inCrossbar) {
        // Ink (#111111)
        raw[p] = 0x11;
        raw[p + 1] = 0x11;
        raw[p + 2] = 0x11;
        raw[p + 3] = 0xff;
      } else if (inDot) {
        // Bubble pink (#FF5D8F)
        raw[p] = 0xff;
        raw[p + 1] = 0x5d;
        raw[p + 2] = 0x8f;
        raw[p + 3] = 0xff;
      } else {
        // Sun yellow (#FFD23F)
        raw[p] = 0xff;
        raw[p + 1] = 0xd2;
        raw[p + 2] = 0x3f;
        raw[p + 3] = 0xff;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeIco(pngBuffers, sizes) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6 + count * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  let offset = header.length;
  for (let i = 0; i < count; i++) {
    const s = sizes[i];
    const buf = pngBuffers[i];
    const entry = 6 + i * 16;
    header[entry] = s >= 256 ? 0 : s;
    header[entry + 1] = s >= 256 ? 0 : s;
    header[entry + 2] = 0;
    header[entry + 3] = 0;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(buf.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += buf.length;
  }
  return Buffer.concat([header, ...pngBuffers]);
}

function makeIcns(png256) {
  // 'ic08' = 256x256 PNG-compressed ICNS element
  const chunkLen = 8 + png256.length;
  const totalLen = 8 + chunkLen;
  const out = Buffer.alloc(16);
  out.write('icns', 0, 'ascii');
  out.writeUInt32BE(totalLen, 4);
  out.write('ic08', 8, 'ascii');
  out.writeUInt32BE(chunkLen, 12);
  return Buffer.concat([out, png256]);
}

const png32 = renderIconRGBA(32);
const png128 = renderIconRGBA(128);
const png256 = renderIconRGBA(256);
const png512 = renderIconRGBA(512);

fs.writeFileSync(path.join(iconsDir, '32x32.png'), png32);
fs.writeFileSync(path.join(iconsDir, '128x128.png'), png128);
fs.writeFileSync(path.join(iconsDir, '128x128@2x.png'), png256);
fs.writeFileSync(path.join(iconsDir, 'icon.png'), png512);
fs.writeFileSync(path.join(iconsDir, 'icon.ico'), makeIco([png32, png256], [32, 256]));
fs.writeFileSync(path.join(iconsDir, 'icon.icns'), makeIcns(png256));
fs.writeFileSync(path.join(__dirname, 'app-icon.png'), png512);

console.log('Generated Tauri icons in src-tauri/icons/');
