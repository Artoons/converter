import { type FormatId, formatFromName } from './formats';

export interface Detection {
  format: FormatId | null;
  by: 'magic' | 'extension' | 'none';
  /** Extension disagrees with the magic bytes (e.g. a PNG renamed to .jpg). */
  mismatch: boolean;
}

const ascii = (b: Uint8Array, start: number, len: number): string =>
  String.fromCharCode(...b.subarray(start, start + len));

const startsWith = (b: Uint8Array, sig: number[], offset = 0): boolean =>
  sig.every((v, i) => b[offset + i] === v);

/** Identify a file by its first bytes. Returns null for text formats (handled by extension). */
export function sniffMagic(b: Uint8Array, extHint: FormatId | null): FormatId | null {
  if (b.length < 4) return null;
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47])) return 'png';
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'jpg';
  if (ascii(b, 0, 4) === 'GIF8') return 'gif';
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WAVE') return 'wav';
  if (startsWith(b, [0x49, 0x49, 0x2a, 0x00]) || startsWith(b, [0x4d, 0x4d, 0x00, 0x2a])) return 'tiff';
  if (startsWith(b, [0x00, 0x00, 0x01, 0x00]) && b[4] > 0) return 'ico';
  if (b[0] === 0x42 && b[1] === 0x4d && b.length >= 14) return 'bmp';
  if (ascii(b, 0, 4) === '%PDF') return 'pdf';
  if (ascii(b, 0, 4) === 'fLaC') return 'flac';
  if (ascii(b, 0, 4) === 'OggS') return 'ogg';
  if (ascii(b, 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && extHint === 'mp3')) return 'mp3';
  if (startsWith(b, [0x1a, 0x45, 0xdf, 0xa3])) {
    return ascii(b, 0, Math.min(b.length, 64)).includes('webm') ? 'webm' : 'mkv';
  }
  if (ascii(b, 4, 4) === 'ftyp') {
    const brand = ascii(b, 8, 4);
    return brand === 'qt  ' ? 'mov' : 'mp4';
  }
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04])) {
    if (ascii(b, 30, 28) === 'mimetypeapplication/epub+zip') return 'epub';
    if (extHint === 'docx' || extHint === 'epub') return extHint;
    return null;
  }
  return null;
}

function sniffText(b: Uint8Array): FormatId | null {
  const head = new TextDecoder('utf-8', { fatal: false }).decode(b).replace(/^\uFEFF/, '').trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'svg';
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return 'html';
  return null;
}

export function detectFormat(head: Uint8Array, name: string): Detection {
  const ext = formatFromName(name);
  const magic = sniffMagic(head, ext) ?? sniffText(head);
  if (magic) {
    // mp4 vs mov share ISO-BMFF; m4a etc. — trust a compatible extension.
    const compatible = ext === magic || (['mp4', 'mov'].includes(ext ?? '') && ['mp4', 'mov'].includes(magic));
    return { format: compatible && ext ? ext : magic, by: 'magic', mismatch: Boolean(ext && !compatible) };
  }
  if (ext) return { format: ext, by: 'extension', mismatch: false };
  return { format: null, by: 'none', mismatch: false };
}
