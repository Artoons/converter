import { AUDIO_ONLY, FORMATS, type FormatId } from '../formats';
import { audioToWav } from './audio';

/**
 * Lightweight browser-side Video & Audio converter (< 50 MB).
 *
 * Strategy to keep bundle size ~0 KB while supporting all video/audio formats:
 * 1. Fast native browser paths (0 network, 0 external deps):
 *    - Any audio/video -> WAV (Web Audio decode + 16-bit PCM WAV)
 *    - Any audio/video -> FLAC (Web Audio decode + pure-TS 16-bit FLAC encoder)
 *    - Video -> GIF (HTML5 <video> + <canvas> + pure-TS GIF89a LZW encoder)
 *    - Video/Audio -> WEBM / MP4 / OGG (MediaRecorder + Canvas/WebAudio stream when supported)
 * 2. On-demand FFmpeg.wasm fallback loaded dynamically from CDN only when a container/codec
 *    (like MP3, MKV, MOV) isn't natively recordable by the current browser.
 */

// ---------------------------------------------------------------------------
// 1. Pure-TypeScript 16-bit FLAC Encoder (lossless, 0 dependencies)
// ---------------------------------------------------------------------------

const CRC8_TABLE = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
    t[i] = c;
  }
  return t;
})();

const CRC16_TABLE = (() => {
  const t = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i << 8;
    for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x8005) & 0xffff : (c << 1) & 0xffff;
    t[i] = c;
  }
  return t;
})();

function crc8(buf: Uint8Array): number {
  let c = 0;
  for (let i = 0; i < buf.length; i++) c = CRC8_TABLE[c ^ buf[i]];
  return c;
}

function crc16(buf: Uint8Array): number {
  let c = 0;
  for (let i = 0; i < buf.length; i++) c = ((c << 8) & 0xffff) ^ CRC16_TABLE[((c >> 8) ^ buf[i]) & 0xff];
  return c;
}

function utf8Uint(n: number): number[] {
  if (n < 0x80) return [n];
  const bytes: number[] = [];
  let len = 2;
  if (n >= 0x800) len = 3;
  if (n >= 0x10000) len = 4;
  if (n >= 0x200000) len = 5;
  for (let i = len - 1; i > 0; i--) {
    bytes[i] = 0x80 | (n & 0x3f);
    n >>= 6;
  }
  bytes[0] = ((0xff << (8 - len)) & 0xff) | n;
  return bytes;
}

async function encodeFlac(input: Blob): Promise<Blob> {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error('Web Audio unavailable');
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(await input.arrayBuffer());
    const channels = Math.min(2, audio.numberOfChannels);
    const rate = audio.sampleRate;
    const totalSamples = audio.length;
    const blockSize = 4096;

    const chData = Array.from({ length: channels }, (_, c) => {
      const f32 = audio.getChannelData(c);
      const i16 = new Int16Array(totalSamples);
      for (let i = 0; i < totalSamples; i++) {
        const s = Math.max(-1, Math.min(1, f32[i]));
        i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      return i16;
    });

    const chunks: BlobPart[] = [];
    // Magic "fLaC" + last-metadata-block STREAMINFO (34 bytes)
    const header = new Uint8Array(4 + 4 + 34);
    header.set([0x66, 0x4c, 0x61, 0x43, 0x80, 0x00, 0x00, 0x22], 0);
    const dv = new DataView(header.buffer);
    dv.setUint16(8, blockSize, false);
    dv.setUint16(10, blockSize, false);
    // 20-bit sample rate, 3-bit (channels-1), 5-bit (bps-1 = 15), 36-bit totalSamples
    const bpsMinus1 = 15;
    header[18] = (rate >> 12) & 0xff;
    header[19] = (rate >> 4) & 0xff;
    header[20] = ((rate & 0x0f) << 4) | (((channels - 1) & 0x07) << 1) | ((bpsMinus1 >> 4) & 0x01);
    header[21] = ((bpsMinus1 & 0x0f) << 4) | Number((BigInt(totalSamples) >> 32n) & 0x0fn);
    dv.setUint32(22, totalSamples >>> 0, false);
    chunks.push(header);

    let frameNum = 0;
    for (let offset = 0; offset < totalSamples; offset += blockSize) {
      const count = Math.min(blockSize, totalSamples - offset);
      const numBytes = utf8Uint(frameNum++);
      // Frame header with uncommon 16-bit blocksize (0b0110) and 16-bit sample rate in Hz (0b1100)
      const fhLen = 4 + numBytes.length + 2 + 2 + 1;
      const frame = new Uint8Array(fhLen + channels * (1 + count * 2) + 2);
      frame[0] = 0xff;
      frame[1] = 0xf8;
      frame[2] = 0x6c; // blocksize=16-bit at end (6), samplerate=16-bit Hz at end (12)
      frame[3] = (((channels - 1) & 0x0f) << 4) | (0b100 << 1); // 16-bit sample size
      frame.set(numBytes, 4);
      let p = 4 + numBytes.length;
      frame[p++] = ((count - 1) >> 8) & 0xff;
      frame[p++] = (count - 1) & 0xff;
      frame[p++] = (rate >> 8) & 0xff;
      frame[p++] = rate & 0xff;
      frame[p] = crc8(frame.subarray(0, p));
      p++;

      for (let c = 0; c < channels; c++) {
        frame[p++] = 0x02; // SUBFRAME_VERBATIM (000001_0)
        const src = chData[c];
        for (let i = 0; i < count; i++) {
          const v = src[offset + i];
          frame[p++] = (v >> 8) & 0xff;
          frame[p++] = v & 0xff;
        }
      }
      const c16 = crc16(frame.subarray(0, p));
      frame[p++] = (c16 >> 8) & 0xff;
      frame[p++] = c16 & 0xff;
      chunks.push(frame.slice(0, p));
    }

    return new Blob(chunks, { type: 'audio/flac' });
  } finally {
    void ctx.close();
  }
}

// ---------------------------------------------------------------------------
// 2. Pure-TypeScript Animated GIF89a Encoder (3-3-2 palette + LZW)
// ---------------------------------------------------------------------------

function lzwEncode(indices: Uint8Array, minCodeSize = 8): Uint8Array<ArrayBuffer> {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  const bytes: number[] = [minCodeSize];
  const subBlock: number[] = [];
  let bitBuf = 0;
  let bitCount = 0;

  const flushSub = () => {
    if (!subBlock.length) return;
    bytes.push(subBlock.length, ...subBlock);
    subBlock.length = 0;
  };
  const writeBits = (code: number, size: number) => {
    bitBuf |= code << bitCount;
    bitCount += size;
    while (bitCount >= 8) {
      subBlock.push(bitBuf & 0xff);
      if (subBlock.length === 255) flushSub();
      bitBuf >>= 8;
      bitCount -= 8;
    }
  };

  let codeSize = minCodeSize + 1;
  let nextCode = endCode + 1;
  const table = new Map<number, number>();
  writeBits(clearCode, codeSize);

  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const hit = table.get(key);
    if (hit !== undefined) {
      prefix = hit;
    } else {
      writeBits(prefix, codeSize);
      if (nextCode < 4096) {
        table.set(key, nextCode++);
        if (nextCode > 1 << codeSize && codeSize < 12) codeSize++;
      } else {
        writeBits(clearCode, codeSize);
        table.clear();
        codeSize = minCodeSize + 1;
        nextCode = endCode + 1;
      }
      prefix = k;
    }
  }
  writeBits(prefix, codeSize);
  writeBits(endCode, codeSize);
  if (bitCount > 0) subBlock.push(bitBuf & 0xff);
  flushSub();
  bytes.push(0); // block terminator
  return new Uint8Array(bytes);
}

async function videoToGif(input: Blob): Promise<Blob> {
  const url = URL.createObjectURL(input);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await new Promise<void>((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => rej(new Error('Could not decode video in browser'));
    });

    const scale = Math.min(1, 360 / Math.max(video.videoWidth || 360, 1));
    const w = Math.max(16, Math.round((video.videoWidth || 320) * scale));
    const h = Math.max(16, Math.round((video.videoHeight || 240) * scale));
    const fps = 10;
    const duration = Math.min(video.duration || 5, 10);
    const totalFrames = Math.max(1, Math.round(duration * fps));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    // Build 3-3-2 RGB global palette (256 colors)
    const palette = new Uint8Array(256 * 3);
    for (let i = 0; i < 256; i++) {
      const r = (i >> 5) & 0x07;
      const g = (i >> 2) & 0x07;
      const b = i & 0x03;
      palette[i * 3] = Math.round((r * 255) / 7);
      palette[i * 3 + 1] = Math.round((g * 255) / 7);
      palette[i * 3 + 2] = Math.round((b * 255) / 3);
    }

    const parts: BlobPart[] = [];
    const head = new Uint8Array(13);
    head.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0); // GIF89a
    head[6] = w & 0xff;
    head[7] = (w >> 8) & 0xff;
    head[8] = h & 0xff;
    head[9] = (h >> 8) & 0xff;
    head[10] = 0xf7; // GCT flag, 8-bit color
    head[11] = 0;
    head[12] = 0;
    parts.push(head, palette);
    // NETSCAPE2.0 infinite loop extension
    parts.push(new Uint8Array([0x21, 0xff, 0x0b, 0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30, 0x03, 0x01, 0x00, 0x00, 0x00]));

    const delayCs = Math.round(100 / fps);
    for (let f = 0; f < totalFrames; f++) {
      video.currentTime = Math.min(duration - 0.01, f / fps);
      await new Promise<void>((r) => {
        video.onseeked = () => r();
      });
      ctx.drawImage(video, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      const idx = new Uint8Array(w * h);
      for (let p = 0, j = 0; p < data.length; p += 4, j++) {
        idx[j] = ((data[p] & 0xe0) | ((data[p + 1] & 0xe0) >> 3) | (data[p + 2] >> 6)) & 0xff;
      }
      const gce = new Uint8Array([0x21, 0xf9, 0x04, 0x00, delayCs & 0xff, (delayCs >> 8) & 0xff, 0x00, 0x00]);
      const desc = new Uint8Array([0x2c, 0, 0, 0, 0, w & 0xff, (w >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff, 0x00]);
      parts.push(gce, desc, lzwEncode(idx, 8));
    }

    parts.push(new Uint8Array([0x3b])); // trailer
    return new Blob(parts, { type: 'image/gif' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------------------------------------------------------------------------
// 3. On-Demand CDN FFmpeg.wasm Loader (0 KB added to initial app bundle)
// ---------------------------------------------------------------------------

interface FFmpegInstance {
  writeFile: (name: string, data: Uint8Array) => Promise<void>;
  exec: (args: string[]) => Promise<number>;
  readFile: (name: string) => Promise<Uint8Array>;
  deleteFile: (name: string) => Promise<void>;
}

let ffmpegPromise: Promise<FFmpegInstance> | null = null;

async function toBlobURL(url: string, mimeType: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CDN fetch failed (${res.status})`);
  const buf = await res.arrayBuffer();
  return URL.createObjectURL(new Blob([buf], { type: mimeType }));
}

async function getFFmpegWasm(): Promise<FFmpegInstance> {
  if (ffmpegPromise) return ffmpegPromise;
  ffmpegPromise = (async () => {
    try {
      const ffmpegBase = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm';
      const coreBase = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
      const modUrl = `${ffmpegBase}/index.js`;
      const { FFmpeg } = (await import(/* @vite-ignore */ modUrl)) as {
        FFmpeg: new () => FFmpegInstance & { load: (cfg: Record<string, string>) => Promise<void> };
      };
      const ff = new FFmpeg();
      const [coreURL, wasmURL] = await Promise.all([
        toBlobURL(`${coreBase}/ffmpeg-core.js`, 'text/javascript'),
        toBlobURL(`${coreBase}/ffmpeg-core.wasm`, 'application/wasm'),
      ]);
      await ff.load({ coreURL, wasmURL });
      return ff;
    } catch (e) {
      ffmpegPromise = null;
      throw e;
    }
  })();
  return ffmpegPromise;
}

const WASM_ARGS: Partial<Record<FormatId, string[]>> = {
  mp4: ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '25', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart'],
  mov: ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '25', '-pix_fmt', 'yuv420p', '-c:a', 'aac'],
  mkv: ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '25', '-c:a', 'aac'],
  webm: ['-c:v', 'libvpx', '-b:v', '1M', '-c:a', 'libvorbis'],
  mp3: ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'],
  wav: ['-vn', '-c:a', 'pcm_s16le'],
  flac: ['-vn', '-c:a', 'flac'],
  ogg: ['-vn', '-c:a', 'libvorbis', '-q:a', '4'],
  gif: ['-vf', 'fps=10,scale=360:-1:flags=lanczos', '-loop', '0'],
};

async function convertViaFFmpegWasm(input: Blob, from: FormatId, to: FormatId): Promise<Blob> {
  const ff = await getFFmpegWasm();
  const inName = `in.${from}`;
  const outName = `out.${to}`;
  await ff.writeFile(inName, new Uint8Array(await input.arrayBuffer()));
  try {
    const code = await ff.exec(['-y', '-i', inName, ...(WASM_ARGS[to] ?? []), outName]);
    if (code !== 0) throw new Error(`FFmpeg exited with code ${code}`);
    const out = await ff.readFile(outName);
    return new Blob([out.slice()], { type: FORMATS[to].mime });
  } finally {
    await ff.deleteFile(inName).catch(() => {});
    await ff.deleteFile(outName).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// 4. Native Browser MediaRecorder Fallback (Offline Video/Audio Re-mux)
// ---------------------------------------------------------------------------

function pickRecorderMime(to: FormatId): string | null {
  const candidates: Record<string, string[]> = {
    webm: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'],
    mp4: ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'],
    mov: ['video/mp4', 'video/webm'],
    mkv: ['video/webm;codecs=vp9,opus', 'video/webm'],
    ogg: ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm'],
    mp3: ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'],
  };
  for (const m of candidates[to] ?? []) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

async function recordMediaElement(input: Blob, to: FormatId): Promise<Blob> {
  const mime = pickRecorderMime(to);
  if (!mime) throw new Error(`Browser cannot encode ${to.toUpperCase()} offline`);

  const url = URL.createObjectURL(input);
  const audioOnly = AUDIO_ONLY.includes(to);
  const el = document.createElement(audioOnly ? 'audio' : 'video');
  el.src = url;
  if (el instanceof HTMLVideoElement) el.playsInline = true;
  el.muted = false;
  el.volume = 0.0001;

  const Ctx = window.AudioContext || window.webkitAudioContext;
  const actx = Ctx ? new Ctx() : null;

  try {
    await new Promise<void>((res, rej) => {
      el.onloadedmetadata = () => res();
      el.onerror = () => rej(new Error('Could not decode media in browser'));
    });

    const tracks: MediaStreamTrack[] = [];
    if (!audioOnly && el instanceof HTMLVideoElement) {
      const canvas = document.createElement('canvas');
      canvas.width = el.videoWidth || 640;
      canvas.height = el.videoHeight || 360;
      const cctx = canvas.getContext('2d')!;
      const draw = () => {
        if (!el.paused && !el.ended) {
          cctx.drawImage(el, 0, 0, canvas.width, canvas.height);
          requestAnimationFrame(draw);
        }
      };
      el.addEventListener('play', draw);
      tracks.push(...canvas.captureStream(30).getVideoTracks());
    }

    if (actx) {
      const src = actx.createMediaElementSource(el);
      const dest = actx.createMediaStreamDestination();
      src.connect(dest);
      tracks.push(...dest.stream.getAudioTracks());
    }

    const stream = new MediaStream(tracks);
    const rec = new MediaRecorder(stream, { mimeType: mime });
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);

    const stopped = new Promise<void>((res, rej) => {
      rec.onstop = () => res();
      rec.onerror = () => rej(new Error('MediaRecorder failed'));
    });

    rec.start(200);
    await el.play();
    await new Promise<void>((res) => {
      el.onended = () => res();
    });
    if (rec.state !== 'inactive') rec.stop();
    await stopped;

    return new Blob(chunks, { type: FORMATS[to].mime });
  } finally {
    URL.revokeObjectURL(url);
    if (actx) void actx.close();
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function convertBrowserMedia(input: Blob, from: FormatId, to: FormatId): Promise<Blob> {
  // 1. Instant offline paths (zero external dependencies)
  if (to === 'wav') return audioToWav(input);
  if (to === 'flac') return encodeFlac(input);
  if (to === 'gif') return videoToGif(input);

  // 2. Try FFmpeg.wasm (exact container/codec for MP4, MKV, MOV, WEBM, MP3, OGG),
  //    falling back to native browser MediaRecorder if offline or blocked.
  try {
    return await convertViaFFmpegWasm(input, from, to);
  } catch {
    return recordMediaElement(input, to);
  }
}
