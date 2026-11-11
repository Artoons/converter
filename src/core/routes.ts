import { type FormatId, FORMATS } from './formats';
import { WEB_MAX_FILE_BYTES } from '../utils/env';

export type BrowserEngine = 'browser-image' | 'browser-data' | 'browser-doc' | 'browser-audio' | 'browser-media';
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

const canvasIn: FormatId[] = ['png', 'jpg', 'webp', 'bmp', 'gif', 'ico', 'svg'];
const canvasOut: FormatId[] = ['png', 'jpg', 'webp', 'bmp', 'ico', 'svg'];
const video: FormatId[] = ['mp4', 'mkv', 'mov', 'webm'];
const audio: FormatId[] = ['mp3', 'wav', 'flac', 'ogg'];
const data: FormatId[] = ['json', 'csv', 'tsv', 'yaml', 'txt'];

// Images
add(canvasIn, canvasOut, ['browser-image']);
add(canvasIn, ['gif', 'tiff'], ['imagemagick']);
add(['tiff'], ['png', 'jpg', 'webp', 'bmp', 'ico', 'gif'], ['imagemagick']);
// Data
add(data, data, ['browser-data']);
// Documents
add(['md'], ['html', 'txt'], ['browser-doc']);
add(['html'], ['md', 'txt'], ['browser-doc']);
add(['txt'], ['md', 'html'], ['browser-doc']);
add(['md', 'html', 'txt'], ['docx', 'epub', 'pdf'], ['pandoc']);
add(['docx', 'epub'], ['md', 'html', 'txt', 'docx', 'epub', 'pdf'], ['pandoc']);
// Media — Desktop prefers native FFmpeg if installed; Web (and Desktop without FFmpeg) uses browser-media (< 50 MB on Web)
add(video, [...video, ...audio, 'gif'], ['ffmpeg', 'browser-media']);
add(audio, audio, ['ffmpeg', 'browser-media']);
add(['gif'], ['mp4', 'webm'], ['ffmpeg', 'browser-media']);

export function targetsFor(format: FormatId): FormatId[] {
  return Object.keys(ROUTES[format] ?? {}) as FormatId[];
}

export function enginesFor(from: FormatId, to: FormatId): Engine[] {
  return ROUTES[from]?.[to] ?? [];
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

  // On Desktop, prefer an installed native binary first; fall back to browser engine if available.
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
  mp3: ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'],
  wav: ['-vn', '-c:a', 'pcm_s16le'],
  flac: ['-vn', '-c:a', 'flac'],
  ogg: ['-vn', '-c:a', 'libvorbis', '-q:a', '5'],
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
      if (to === 'jpg' || to === 'webp') return ['-quality', String(quality)];
      return [];
  }
}

export function outputFileName(name: string, to: FormatId): string {
  const i = name.lastIndexOf('.');
  const base = i > 0 ? name.slice(0, i) : name;
  return `${base}.${FORMATS[to].ext}`;
}
