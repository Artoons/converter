import { type FormatId, FORMATS } from './formats';
import { WEB_MAX_FILE_BYTES } from '../utils/env';

export type BrowserEngine =
  | 'browser-image'
  | 'browser-data'
  | 'browser-doc'
  | 'browser-audio'
  | 'browser-media'
  | 'browser-archive';
export type NativeEngine = 'ffmpeg' | 'pandoc' | 'imagemagick';
export type Engine = BrowserEngine | NativeEngine;
export type ModuleId = 'core' | 'ffmpeg' | 'pandoc' | 'imagemagick';

export const ENGINE_MODULE: Record<NativeEngine, ModuleId> = {
  ffmpeg: 'ffmpeg',
  pandoc: 'pandoc',
  imagemagick: 'imagemagick',
};

export const isBrowserEngine = (e: Engine): e is BrowserEngine => e.startsWith('browser-');

// ---------------------------------------------------------------------------
// Routing table: input → target → engines (in order of preference)
// ---------------------------------------------------------------------------

type RouteTable = Partial<Record<FormatId, Partial<Record<FormatId, Engine[]>>>>;
const ROUTES: RouteTable = {};

function add(froms: FormatId[], tos: FormatId[], engines: Engine[]) {
  for (const from of froms) {
    for (const to of tos) {
      if (from === to) continue;
      const row = (ROUTES[from] ??= {});
      row[to] = [...(row[to] ?? []), ...engines.filter((e) => !(row[to] ?? []).includes(e))];
    }
  }
}

// 1. Images
const webImages: FormatId[] = ['png', 'jpg', 'webp', 'avif', 'bmp', 'ico', 'gif', 'svg', 'tga', 'ppm'];
const proImages: FormatId[] = ['tiff', 'psd', 'eps', 'hdr', 'exr', 'dds', 'heic', 'jxl', 'raw'];
const allImageOuts: FormatId[] = ['png', 'jpg', 'webp', 'avif', 'bmp', 'ico', 'gif', 'svg', 'tga', 'ppm', 'tiff', 'psd', 'eps', 'hdr', 'exr', 'dds', 'jxl', 'pdf'];

add(webImages, [...webImages, 'pdf'], ['browser-image']);
add(webImages, proImages.filter((f) => f !== 'raw' && f !== 'heic'), ['imagemagick']);
add(proImages, allImageOuts, ['imagemagick']);

// 2. Data & Configs (100% Web + App)
const dataFormats: FormatId[] = ['json', 'csv', 'tsv', 'yaml', 'xml', 'toml', 'ini', 'env', 'sql', 'txt'];
add(dataFormats, [...dataFormats, 'html'], ['browser-data']);

// 3. Documents & Ebooks
const webDocs: FormatId[] = ['md', 'html', 'txt', 'rtf'];
const proDocs: FormatId[] = ['docx', 'epub', 'odt', 'tex', 'rst', 'org', 'adoc', 'fb2'];
const allDocTargets: FormatId[] = ['md', 'html', 'txt', 'rtf', 'pdf', 'docx', 'epub', 'odt', 'tex', 'rst', 'org', 'adoc'];

// Web + App document routes
add(webDocs, [...webDocs, 'pdf'], ['browser-doc']);
add(['docx'], ['md', 'html', 'txt', 'rtf', 'pdf'], ['pandoc', 'browser-doc']);
// Desktop-only pro document routes (Pandoc + Typst)
add(webDocs, ['docx', 'epub', 'odt', 'tex', 'rst', 'org', 'adoc'], ['pandoc']);
add(proDocs, allDocTargets, ['pandoc']);

// 4. Audio & Video
const webVideo: FormatId[] = ['mp4', 'webm', 'mkv', 'mov', 'avi'];
const webAudio: FormatId[] = ['mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a', 'opus'];
const proVideo: FormatId[] = ['flv', 'wmv', 'mpg', '3gp'];
const proAudio: FormatId[] = ['wma', 'aiff', 'ac3'];

// Web (< 50 MB) + App (native FFmpeg preferred on Desktop)
add(webVideo, [...webVideo, ...webAudio, 'gif'], ['ffmpeg', 'browser-media']);
add(webAudio, webAudio, ['ffmpeg', 'browser-media']);
add(['gif'], ['mp4', 'webm'], ['ffmpeg', 'browser-media']);

// Desktop-only pro media routes
add([...webVideo, ...proVideo], [...webVideo, ...proVideo, ...webAudio, ...proAudio, 'gif'], ['ffmpeg']);
add([...webAudio, ...proAudio], [...webAudio, ...proAudio], ['ffmpeg']);

// 5. Archives & Compression (100% Web + App)
const archives: FormatId[] = ['zip', 'tar', 'tgz', 'gz'];
add(archives, archives, ['browser-archive']);

export function targetsFor(format: FormatId): FormatId[] {
  return Object.keys(ROUTES[format] ?? {}) as FormatId[];
}

export function enginesFor(from: FormatId, to: FormatId): Engine[] {
  return ROUTES[from]?.[to] ?? [];
}

/** True if this format has at least one browser-capable conversion route. */
export function isFormatWebSupported(format: FormatId): boolean {
  if (FORMATS[format].desktopOnly) return false;
  return targetsFor(format).some((to) => isWebCapable(format, to));
}

// ---------------------------------------------------------------------------
// Route resolution for the current environment
// ---------------------------------------------------------------------------

export type Route =
  | { kind: 'ok'; engine: Engine }
  | { kind: 'web-size' }
  | { kind: 'web-native'; engine: NativeEngine }
  | { kind: 'needs-module'; module: ModuleId; engine: NativeEngine }
  | { kind: 'unsupported' };

export interface RouteContext {
  desktop: boolean;
  installed: Set<string>;
  size: number;
}

export function resolveRoute(from: FormatId, to: FormatId, ctx: RouteContext): Route {
  const engines = enginesFor(from, to);
  if (!engines.length) return { kind: 'unsupported' };

  if (!ctx.desktop) {
    if (ctx.size > WEB_MAX_FILE_BYTES) return { kind: 'web-size' };
    const browser = engines.find(isBrowserEngine);
    if (browser) return { kind: 'ok', engine: browser };
    return { kind: 'web-native', engine: engines[0] as NativeEngine };
  }

  for (const e of engines) {
    if (!isBrowserEngine(e) && ctx.installed.has(ENGINE_MODULE[e])) return { kind: 'ok', engine: e };
  }
  const browser = engines.find(isBrowserEngine);
  if (browser) return { kind: 'ok', engine: browser };

  const first = engines.find((e) => !isBrowserEngine(e)) as NativeEngine;
  return { kind: 'needs-module', module: ENGINE_MODULE[first], engine: first };
}

/** True if the route works in the browser for files under the size limit. */
export function isWebCapable(from: FormatId, to: FormatId): boolean {
  return enginesFor(from, to).some(isBrowserEngine);
}

// ---------------------------------------------------------------------------
// Native engine arguments (placed between input and output by the Rust side)
// ---------------------------------------------------------------------------

const FFMPEG_ARGS: Partial<Record<FormatId, string[]>> = {
  mp4: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'],
  mov: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k'],
  mkv: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-c:a', 'aac', '-b:a', '192k'],
  webm: ['-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-row-mt', '1', '-c:a', 'libopus', '-b:a', '128k'],
  avi: ['-c:v', 'mpeg4', '-q:v', '4', '-c:a', 'libmp3lame', '-q:a', '2'],
  flv: ['-c:v', 'libx264', '-crf', '24', '-c:a', 'aac', '-ar', '44100'],
  wmv: ['-c:v', 'wmv2', '-b:v', '2M', '-c:a', 'wmav2', '-b:a', '192k'],
  mpg: ['-c:v', 'mpeg2video', '-q:v', '4', '-c:a', 'mp2', '-b:a', '192k'],
  '3gp': ['-c:v', 'h263', '-s', '352x288', '-c:a', 'aac', '-b:a', '64k'],
  mp3: ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'],
  wav: ['-vn', '-c:a', 'pcm_s16le'],
  flac: ['-vn', '-c:a', 'flac'],
  ogg: ['-vn', '-c:a', 'libvorbis', '-q:a', '5'],
  aac: ['-vn', '-c:a', 'aac', '-b:a', '192k'],
  m4a: ['-vn', '-c:a', 'aac', '-b:a', '192k'],
  opus: ['-vn', '-c:a', 'libopus', '-b:a', '128k'],
  wma: ['-vn', '-c:a', 'wmav2', '-b:a', '192k'],
  aiff: ['-vn', '-c:a', 'pcm_s16be'],
  ac3: ['-vn', '-c:a', 'ac3', '-b:a', '192k'],
  gif: ['-vf', 'fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse', '-loop', '0'],
};

export function nativeArgs(engine: NativeEngine, from: FormatId, to: FormatId, quality = 92): string[] {
  switch (engine) {
    case 'ffmpeg':
      return FFMPEG_ARGS[to] ?? [];
    case 'pandoc': {
      const a: string[] = [];
      if (from === 'txt') a.push('-f', 'markdown');
      if (to === 'txt') a.push('-t', 'plain');
      if (to === 'md') a.push('-t', 'gfm');
      if (to === 'html') a.push('--standalone', '--embed-resources');
      return a;
    }
    case 'imagemagick':
      if (to === 'ico') return ['-background', 'none', '-define', 'icon:auto-resize=256,128,64,48,32,16'];
      if (to === 'tiff') return ['-compress', 'lzw'];
      if (to === 'jpg' || to === 'webp' || to === 'avif' || to === 'jxl') return ['-quality', String(quality)];
      return [];
  }
}

export function outputFileName(name: string, to: FormatId): string {
  const lower = name.toLowerCase();
  const base = lower.endsWith('.tar.gz')
    ? name.slice(0, -7)
    : (() => {
        const i = name.lastIndexOf('.');
        return i > 0 ? name.slice(0, i) : name;
      })();
  return `${base}.${to === 'tgz' ? 'tar.gz' : FORMATS[to].ext}`;
}
