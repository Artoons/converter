import type { FormatId } from '../formats';

/**
 * Pure-TypeScript Archive & Compression converter (0 external dependencies):
 * Converts between ZIP ⇄ TAR ⇄ TAR.GZ (.tgz) ⇄ GZ using the browser's built-in
 * CompressionStream / DecompressionStream ('gzip' & 'deflate-raw') + USTAR TAR & PKZIP.
 */

export interface ArchiveEntry {
  name: string;
  data: Uint8Array;
}

const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC32_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function pipeStream(input: Uint8Array, transform: ReadableWritablePair<Uint8Array, Uint8Array>): Promise<Uint8Array> {
  const writer = transform.writable.getWriter();
  void writer.write(input.slice());
  void writer.close();
  const reader = transform.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export async function gzipCompress(data: Uint8Array): Promise<Uint8Array> {
  return pipeStream(data, new CompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
}

export async function gzipDecompress(data: Uint8Array): Promise<Uint8Array> {
  return pipeStream(data, new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
}

export async function deflateRawDecompress(data: Uint8Array): Promise<Uint8Array> {
  return pipeStream(data, new DecompressionStream('deflate-raw') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
}

// ---- ZIP Reader & Writer --------------------------------------------------

export async function readZipEntries(buf: Uint8Array): Promise<ArchiveEntry[]> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // Locate End of Central Directory (0x06054b50)
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Invalid ZIP archive');

  const count = dv.getUint16(eocd + 8, true);
  let cdOffset = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const entries: ArchiveEntry[] = [];

  for (let i = 0; i < count && cdOffset + 46 <= buf.length; i++) {
    if (dv.getUint32(cdOffset, true) !== 0x02014b50) break;
    const method = dv.getUint16(cdOffset + 10, true);
    const compSize = dv.getUint32(cdOffset + 20, true);
    const nameLen = dv.getUint16(cdOffset + 28, true);
    const extraLen = dv.getUint16(cdOffset + 30, true);
    const commentLen = dv.getUint16(cdOffset + 32, true);
    const localOffset = dv.getUint32(cdOffset + 42, true);
    const name = dec.decode(buf.subarray(cdOffset + 46, cdOffset + 46 + nameLen));
    cdOffset += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue;
    const lNameLen = dv.getUint16(localOffset + 26, true);
    const lExtraLen = dv.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);

    if (method === 0) {
      entries.push({ name, data: raw.slice() });
    } else if (method === 8) {
      entries.push({ name, data: await deflateRawDecompress(raw) });
    }
  }
  return entries;
}

export function writeZipEntries(entries: ArchiveEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const cdParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name.replace(/^\/+/, ''));
    const data = entry.data;
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    const ldv = new DataView(local.buffer);
    ldv.setUint32(0, 0x04034b50, true);
    ldv.setUint16(4, 20, true);
    ldv.setUint16(8, 0, true); // store (method 0)
    ldv.setUint32(14, crc, true);
    ldv.setUint32(18, data.length, true);
    ldv.setUint32(22, data.length, true);
    ldv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(cd.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, data.length, true);
    cdv.setUint32(24, data.length, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);

    localParts.push(local, data);
    cdParts.push(cd);
    offset += local.length + data.length;
  }

  const cdSize = cdParts.reduce((a, b) => a + b.length, 0);
  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(8, entries.length, true);
  edv.setUint16(10, entries.length, true);
  edv.setUint32(12, cdSize, true);
  edv.setUint32(16, offset, true);

  const total = offset + cdSize + 22;
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of [...localParts, ...cdParts, eocd]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

// ---- POSIX USTAR TAR Reader & Writer --------------------------------------

export function readTarEntries(buf: Uint8Array): ArchiveEntry[] {
  const dec = new TextDecoder();
  const entries: ArchiveEntry[] = [];
  let pos = 0;

  while (pos + 512 <= buf.length) {
    const header = buf.subarray(pos, pos + 512);
    if (header.every((b) => b === 0)) break;
    const nameRaw = dec.decode(header.subarray(0, 100)).replace(/\0.*$/, '');
    const sizeOct = dec.decode(header.subarray(124, 136)).replace(/\0.*$/, '').trim();
    const typeFlag = header[156];
    const size = parseInt(sizeOct || '0', 8) || 0;
    pos += 512;

    if (nameRaw && typeFlag !== 53 /* '5' directory */ && !nameRaw.endsWith('/')) {
      entries.push({ name: nameRaw, data: buf.subarray(pos, pos + size).slice() });
    }
    pos += Math.ceil(size / 512) * 512;
  }
  return entries;
}

export function writeTarEntries(entries: ArchiveEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const blocks: Uint8Array[] = [];
  const mtime = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0');

  const putAscii = (target: Uint8Array, offset: number, str: string, maxLen: number) => {
    const b = enc.encode(str);
    target.set(b.subarray(0, maxLen), offset);
  };

  for (const entry of entries) {
    const header = new Uint8Array(512);
    putAscii(header, 0, entry.name.replace(/^\/+/, '').slice(0, 99), 100);
    putAscii(header, 100, '0000644\0', 8);
    putAscii(header, 108, '0000000\0', 8);
    putAscii(header, 116, '0000000\0', 8);
    putAscii(header, 124, entry.data.length.toString(8).padStart(11, '0') + '\0', 12);
    putAscii(header, 136, mtime + '\0', 12);
    header.fill(0x20, 148, 156); // checksum spaces
    header[156] = 0x30; // '0' normal file
    putAscii(header, 257, 'ustar\0', 6);
    putAscii(header, 263, '00', 2);

    let sum = 0;
    for (let i = 0; i < 512; i++) sum += header[i];
    putAscii(header, 148, sum.toString(8).padStart(6, '0') + '\0 ', 8);

    blocks.push(header, entry.data);
    const pad = (512 - (entry.data.length % 512)) % 512;
    if (pad) blocks.push(new Uint8Array(pad));
  }

  blocks.push(new Uint8Array(1024)); // two 512-byte zero blocks
  const total = blocks.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const b of blocks) {
    out.set(b, p);
    p += b.length;
  }
  return out;
}

export async function convertArchive(input: Blob, from: FormatId, to: FormatId, baseTitle = 'archive'): Promise<Blob> {
  const bytes = new Uint8Array(await input.arrayBuffer());

  // 1. Extract entries from input archive
  let entries: ArchiveEntry[];
  if (from === 'zip') {
    entries = await readZipEntries(bytes);
  } else if (from === 'tar') {
    entries = readTarEntries(bytes);
  } else if (from === 'tgz') {
    entries = readTarEntries(await gzipDecompress(bytes));
  } else if (from === 'gz') {
    const raw = await gzipDecompress(bytes);
    // Check if the gzipped stream is actually a tar archive
    const maybeTar = raw.length >= 512 && new TextDecoder().decode(raw.subarray(257, 262)) === 'ustar';
    entries = maybeTar ? readTarEntries(raw) : [{ name: baseTitle || 'file.bin', data: raw }];
  } else {
    entries = [{ name: `${baseTitle}.${from}`, data: bytes }];
  }

  // 2. Encode to target archive
  switch (to) {
    case 'zip':
      return new Blob([writeZipEntries(entries).slice()], { type: 'application/zip' });
    case 'tar':
      return new Blob([writeTarEntries(entries).slice()], { type: 'application/x-tar' });
    case 'tgz': {
      const gz = await gzipCompress(writeTarEntries(entries));
      return new Blob([gz.slice()], { type: 'application/gzip' });
    }
    case 'gz': {
      const payload = entries.length === 1 ? entries[0].data : writeTarEntries(entries);
      const gz = await gzipCompress(payload);
      return new Blob([gz.slice()], { type: 'application/gzip' });
    }
    default:
      throw new Error(`Unsupported archive target: ${to}`);
  }
}
