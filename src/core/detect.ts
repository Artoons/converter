import { type FormatId, formatFromName } from './formats';

export interface Detection {
  format: FormatId | null;
  by: 'magic' | 'extension' | 'none';
  mismatch: boolean;
}

const ascii = (b: Uint8Array, start: number, len: number): string =>
  String.fromCharCode(...b.subarray(start, start + len));

const startsWith = (b: Uint8Array, sig: number[], offset = 0): boolean =>
  b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v);

/** Identify a file by its first bytes. Returns null for text formats (handled by extension). */
export function sniffMagic(b: Uint8Array, extHint: FormatId | null): FormatId | null {
  if (b.length < 4) return null;
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47])) return 'png';
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'jpg';
  if (ascii(b, 0, 4) === 'GIF8') return 'gif';
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WAVE') return 'wav';
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'AVI ') return 'avi';
  if (ascii(b, 0, 4) === 'FORM' && ascii(b, 8, 4) === 'AIFF') return 'aiff';
  if (startsWith(b, [0x49, 0x49, 0x2a, 0x00]) || startsWith(b, [0x4d, 0x4d, 0x00, 0x2a])) {
    return extHint === 'raw' ? 'raw' : 'tiff';
  }
  if (ascii(b, 0, 4) === '8BPS') return 'psd';
  if (ascii(b, 0, 4) === 'DDS ') return 'dds';
  if (startsWith(b, [0x76, 0x2f, 0x31, 0x01])) return 'exr';
  if (startsWith(b, [0xff, 0x0a]) || startsWith(b, [0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20])) return 'jxl';
  if (startsWith(b, [0x00, 0x00, 0x01, 0x00]) && b[4] > 0) return 'ico';
  if (b[0] === 0x42 && b[1] === 0x4d && b.length >= 14) return 'bmp';
  if (ascii(b, 0, 4) === '%PDF') return 'pdf';
  if (ascii(b, 0, 5) === '{\\rtf') return 'rtf';
  if (ascii(b, 0, 4) === 'fLaC') return 'flac';
  if (ascii(b, 0, 4) === 'OggS') return extHint === 'opus' ? 'opus' : 'ogg';
  if (ascii(b, 0, 3) === 'FLV') return 'flv';
  if (startsWith(b, [0x30, 0x26, 0xb2, 0x75])) return extHint === 'wma' ? 'wma' : 'wmv';
  if (startsWith(b, [0x0b, 0x77])) return 'ac3';
  if (ascii(b, 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && (extHint === 'mp3' || extHint === 'aac'))) {
    return extHint === 'aac' ? 'aac' : 'mp3';
  }
  if (startsWith(b, [0x1a, 0x45, 0xdf, 0xa3])) {
    return ascii(b, 0, Math.min(b.length, 64)).includes('webm') ? 'webm' : 'mkv';
  }
  if (ascii(b, 4, 4) === 'ftyp') {
    const brand = ascii(b, 8, 4).trim();
    if (brand === 'avif' || brand === 'avis') return 'avif';
    if (brand === 'heic' || brand === 'heix' || brand === 'mif1' || brand === 'msf1') return 'heic';
    if (brand === 'M4A') return 'm4a';
    if (brand.startsWith('3gp') || brand.startsWith('3g2')) return '3gp';
    if (brand === 'qt') return 'mov';
    return extHint === 'm4a' || extHint === 'mov' ? extHint : 'mp4';
  }
  if (startsWith(b, [0x1f, 0x8b])) {
    return extHint === 'tgz' ? 'tgz' : 'gz';
  }
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04])) {
    if (ascii(b, 30, 28) === 'mimetypeapplication/epub+zip') return 'epub';
    if (extHint === 'docx' || extHint === 'epub' || extHint === 'odt') return extHint;
    return 'zip';
  }
  return null;
}

function sniffText(b: Uint8Array, extHint: FormatId | null): FormatId | null {
  const head = new TextDecoder('utf-8', { fatal: false }).decode(b).replace(/^\uFEFF/, '').trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'svg';
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return 'html';
  if (head.startsWith('<?xml') && extHint === 'fb2') return 'fb2';
  if (head.startsWith('<?xml')) return 'xml';
  if (/^p[1-6]\s/.test(head)) return 'ppm';
  if (head.startsWith('#?radiance') || head.startsWith('#?rgbe')) return 'hdr';
  if (head.startsWith('%!ps')) return 'eps';
  return null;
}

export function detectFormat(head: Uint8Array, name: string): Detection {
  const ext = formatFromName(name);
  const magic = sniffMagic(head, ext) ?? sniffText(head, ext);
  if (magic) {
    const isoFamily: FormatId[] = ['mp4', 'mov', 'm4a', '3gp', 'avif', 'heic'];
    const compatible = ext === magic || (ext !== null && isoFamily.includes(ext) && isoFamily.includes(magic));
    return { format: compatible && ext ? ext : magic, by: 'magic', mismatch: Boolean(ext && !compatible) };
  }
  if (ext) return { format: ext, by: 'extension', mismatch: false };
  return { format: null, by: 'none', mismatch: false };
}
