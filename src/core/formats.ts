export type Category = 'image' | 'media' | 'document' | 'data' | 'archive';

export type FormatId =
  // Images (Web + App)
  | 'png' | 'jpg' | 'webp' | 'avif' | 'bmp' | 'ico' | 'gif' | 'svg' | 'tga' | 'ppm'
  // Images (Desktop App Exclusive - ImageMagick)
  | 'tiff' | 'psd' | 'eps' | 'hdr' | 'exr' | 'dds' | 'heic' | 'jxl' | 'raw'
  // Audio & Video (Web < 50 MB + App)
  | 'mp4' | 'webm' | 'mkv' | 'mov' | 'avi'
  | 'mp3' | 'wav' | 'flac' | 'ogg' | 'aac' | 'm4a' | 'opus'
  // Audio & Video (Desktop App Exclusive - FFmpeg)
  | 'flv' | 'wmv' | 'mpg' | '3gp' | 'wma' | 'aiff' | 'ac3'
  // Documents (Web + App)
  | 'md' | 'html' | 'txt' | 'rtf' | 'pdf' | 'docx'
  // Documents (Desktop App Exclusive - Pandoc + Typst)
  | 'epub' | 'odt' | 'tex' | 'rst' | 'org' | 'adoc' | 'fb2'
  // Data, Config & Spreadsheets (Web + App)
  | 'json' | 'csv' | 'tsv' | 'yaml' | 'xml' | 'toml' | 'ini' | 'env' | 'sql'
  // Archives & Compression (Web + App)
  | 'zip' | 'tar' | 'tgz' | 'gz';

export interface FormatDef {
  id: FormatId;
  label: string;
  category: Category;
  ext: string;
  aliases?: string[];
  mime: string;
  /** True if this format requires a native desktop engine (not available in the web browser). */
  desktopOnly?: boolean;
}

const f = (
  id: FormatId,
  label: string,
  category: Category,
  mime: string,
  aliases?: string[],
  desktopOnly?: boolean,
): FormatDef => ({
  id,
  label,
  category,
  ext: id,
  mime,
  aliases,
  desktopOnly,
});

export const FORMATS: Record<FormatId, FormatDef> = {
  // ---- Images (Web + App) -------------------------------------------------
  png: f('png', 'PNG', 'image', 'image/png'),
  jpg: f('jpg', 'JPG', 'image', 'image/jpeg', ['jpeg', 'jfif', 'jpe']),
  webp: f('webp', 'WEBP', 'image', 'image/webp'),
  avif: f('avif', 'AVIF', 'image', 'image/avif'),
  bmp: f('bmp', 'BMP', 'image', 'image/bmp', ['dib']),
  ico: f('ico', 'ICO', 'image', 'image/x-icon'),
  gif: f('gif', 'GIF', 'image', 'image/gif'),
  svg: f('svg', 'SVG', 'image', 'image/svg+xml'),
  tga: f('tga', 'TGA', 'image', 'image/x-tga', ['icb', 'vda', 'vst']),
  ppm: f('ppm', 'PPM', 'image', 'image/x-portable-pixmap', ['pgm', 'pbm', 'pnm']),

  // ---- Images (Desktop Exclusive - ImageMagick) ---------------------------
  tiff: f('tiff', 'TIFF', 'image', 'image/tiff', ['tif'], true),
  psd: f('psd', 'PSD', 'image', 'image/vnd.adobe.photoshop', undefined, true),
  eps: f('eps', 'EPS', 'image', 'application/postscript', ['ps'], true),
  hdr: f('hdr', 'HDR', 'image', 'image/vnd.radiance', ['rgbe'], true),
  exr: f('exr', 'EXR', 'image', 'image/x-exr', undefined, true),
  dds: f('dds', 'DDS', 'image', 'image/vnd-ms.dds', undefined, true),
  heic: f('heic', 'HEIC', 'image', 'image/heic', ['heif'], true),
  jxl: f('jxl', 'JXL', 'image', 'image/jxl', undefined, true),
  raw: f('raw', 'RAW', 'image', 'image/x-dcraw', ['cr2', 'nef', 'arw', 'dng', 'orf', 'rw2'], true),

  // ---- Audio & Video (Web < 50 MB + App) ----------------------------------
  mp4: f('mp4', 'MP4', 'media', 'video/mp4', ['m4v']),
  webm: f('webm', 'WEBM', 'media', 'video/webm'),
  mkv: f('mkv', 'MKV', 'media', 'video/x-matroska'),
  mov: f('mov', 'MOV', 'media', 'video/quicktime', ['qt']),
  avi: f('avi', 'AVI', 'media', 'video/x-msvideo'),
  mp3: f('mp3', 'MP3', 'media', 'audio/mpeg'),
  wav: f('wav', 'WAV', 'media', 'audio/wav', ['wave']),
  flac: f('flac', 'FLAC', 'media', 'audio/flac'),
  ogg: f('ogg', 'OGG', 'media', 'audio/ogg', ['oga']),
  aac: f('aac', 'AAC', 'media', 'audio/aac'),
  m4a: f('m4a', 'M4A', 'media', 'audio/mp4'),
  opus: f('opus', 'OPUS', 'media', 'audio/opus'),

  // ---- Audio & Video (Desktop Exclusive - FFmpeg) -------------------------
  flv: f('flv', 'FLV', 'media', 'video/x-flv', undefined, true),
  wmv: f('wmv', 'WMV', 'media', 'video/x-ms-wmv', ['asf'], true),
  mpg: f('mpg', 'MPG', 'media', 'video/mpeg', ['mpeg', 'm2v', 'ts'], true),
  '3gp': f('3gp', '3GP', 'media', 'video/3gpp', ['3g2'], true),
  wma: f('wma', 'WMA', 'media', 'audio/x-ms-wma', undefined, true),
  aiff: f('aiff', 'AIFF', 'media', 'audio/aiff', ['aif', 'aifc'], true),
  ac3: f('ac3', 'AC3', 'media', 'audio/ac3', undefined, true),

  // ---- Documents (Web + App) ----------------------------------------------
  md: f('md', 'MD', 'document', 'text/markdown', ['markdown', 'mdown']),
  html: f('html', 'HTML', 'document', 'text/html', ['htm', 'xhtml']),
  txt: f('txt', 'TXT', 'document', 'text/plain', ['text', 'log']),
  rtf: f('rtf', 'RTF', 'document', 'application/rtf'),
  pdf: f('pdf', 'PDF', 'document', 'application/pdf'),
  docx: f('docx', 'DOCX', 'document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),

  // ---- Documents (Desktop Exclusive - Pandoc + Typst) ---------------------
  epub: f('epub', 'EPUB', 'document', 'application/epub+zip', undefined, true),
  odt: f('odt', 'ODT', 'document', 'application/vnd.oasis.opendocument.text', undefined, true),
  tex: f('tex', 'LATEX', 'document', 'application/x-tex', ['latex'], true),
  rst: f('rst', 'RST', 'document', 'text/x-rst', undefined, true),
  org: f('org', 'ORG', 'document', 'text/org', undefined, true),
  adoc: f('adoc', 'ADOC', 'document', 'text/asciidoc', ['asciidoc'], true),
  fb2: f('fb2', 'FB2', 'document', 'application/x-fictionbook+xml', undefined, true),

  // ---- Data, Config & Spreadsheets (Web + App) ----------------------------
  json: f('json', 'JSON', 'data', 'application/json'),
  csv: f('csv', 'CSV', 'data', 'text/csv'),
  tsv: f('tsv', 'TSV', 'data', 'text/tab-separated-values', ['tab']),
  yaml: f('yaml', 'YAML', 'data', 'application/yaml', ['yml']),
  xml: f('xml', 'XML', 'data', 'application/xml'),
  toml: f('toml', 'TOML', 'data', 'application/toml'),
  ini: f('ini', 'INI', 'data', 'text/plain', ['cfg', 'conf']),
  env: f('env', 'ENV', 'data', 'text/plain'),
  sql: f('sql', 'SQL', 'data', 'application/sql'),

  // ---- Archives & Compression (Web + App) ---------------------------------
  zip: f('zip', 'ZIP', 'archive', 'application/zip'),
  tar: f('tar', 'TAR', 'archive', 'application/x-tar'),
  tgz: f('tgz', 'TAR.GZ', 'archive', 'application/gzip', ['tar.gz']),
  gz: f('gz', 'GZ', 'archive', 'application/gzip', ['gzip']),
};

export const FORMAT_IDS = Object.keys(FORMATS) as FormatId[];

export const CATEGORY_LABEL: Record<Category, string> = {
  image: 'Images',
  media: 'Audio & Video',
  document: 'Documents & Ebooks',
  data: 'Data & Configs',
  archive: 'Archives',
};

const EXT_MAP: Record<string, FormatId> = {};
for (const def of Object.values(FORMATS)) {
  EXT_MAP[def.ext] = def.id;
  for (const a of def.aliases ?? []) EXT_MAP[a] = def.id;
}

export function formatFromName(name: string): FormatId | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.tar.gz')) return 'tgz';
  if (lower === '.env' || lower.endsWith('.env')) return 'env';
  const m = /\.([a-z0-9]+)$/i.exec(lower);
  return m ? EXT_MAP[m[1]] ?? null : null;
}

export const AUDIO_ONLY: FormatId[] = ['mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a', 'opus', 'wma', 'aiff', 'ac3'];
