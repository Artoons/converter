export type Category = 'image' | 'data' | 'media' | 'document';

export type FormatId =
  | 'png' | 'jpg' | 'webp' | 'bmp' | 'ico' | 'gif' | 'tiff' | 'svg'
  | 'json' | 'csv' | 'tsv' | 'yaml' | 'txt'
  | 'mp4' | 'mkv' | 'mov' | 'webm' | 'mp3' | 'wav' | 'flac' | 'ogg'
  | 'md' | 'html' | 'docx' | 'epub' | 'pdf';

export interface FormatDef {
  id: FormatId;
  label: string;
  category: Category;
  ext: string;
  aliases?: string[];
  mime: string;
}

const f = (id: FormatId, label: string, category: Category, mime: string, aliases?: string[]): FormatDef => ({
  id,
  label,
  category,
  ext: id,
  mime,
  aliases,
});

export const FORMATS: Record<FormatId, FormatDef> = {
  png: f('png', 'PNG', 'image', 'image/png'),
  jpg: f('jpg', 'JPG', 'image', 'image/jpeg', ['jpeg', 'jfif', 'jpe']),
  webp: f('webp', 'WEBP', 'image', 'image/webp'),
  bmp: f('bmp', 'BMP', 'image', 'image/bmp', ['dib']),
  ico: f('ico', 'ICO', 'image', 'image/x-icon'),
  gif: f('gif', 'GIF', 'image', 'image/gif'),
  tiff: f('tiff', 'TIFF', 'image', 'image/tiff', ['tif']),
  svg: f('svg', 'SVG', 'image', 'image/svg+xml'),

  json: f('json', 'JSON', 'data', 'application/json'),
  csv: f('csv', 'CSV', 'data', 'text/csv'),
  tsv: f('tsv', 'TSV', 'data', 'text/tab-separated-values', ['tab']),
  yaml: f('yaml', 'YAML', 'data', 'application/yaml', ['yml']),
  txt: f('txt', 'TXT', 'data', 'text/plain', ['text', 'log']),

  mp4: f('mp4', 'MP4', 'media', 'video/mp4', ['m4v']),
  mkv: f('mkv', 'MKV', 'media', 'video/x-matroska'),
  mov: f('mov', 'MOV', 'media', 'video/quicktime', ['qt']),
  webm: f('webm', 'WEBM', 'media', 'video/webm'),
  mp3: f('mp3', 'MP3', 'media', 'audio/mpeg'),
  wav: f('wav', 'WAV', 'media', 'audio/wav', ['wave']),
  flac: f('flac', 'FLAC', 'media', 'audio/flac'),
  ogg: f('ogg', 'OGG', 'media', 'audio/ogg', ['oga', 'opus']),

  md: f('md', 'MD', 'document', 'text/markdown', ['markdown', 'mdown']),
  html: f('html', 'HTML', 'document', 'text/html', ['htm', 'xhtml']),
  docx: f('docx', 'DOCX', 'document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
  epub: f('epub', 'EPUB', 'document', 'application/epub+zip'),
  pdf: f('pdf', 'PDF', 'document', 'application/pdf'),
};

export const FORMAT_IDS = Object.keys(FORMATS) as FormatId[];

export const CATEGORY_LABEL: Record<Category, string> = {
  image: 'Images',
  data: 'Data & Spreadsheets',
  media: 'Audio & Video',
  document: 'Documents',
};

const EXT_MAP: Record<string, FormatId> = {};
for (const def of Object.values(FORMATS)) {
  EXT_MAP[def.ext] = def.id;
  for (const a of def.aliases ?? []) EXT_MAP[a] = def.id;
}

export function formatFromName(name: string): FormatId | null {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? EXT_MAP[m[1].toLowerCase()] ?? null : null;
}

export const AUDIO_ONLY: FormatId[] = ['mp3', 'wav', 'flac', 'ogg'];
