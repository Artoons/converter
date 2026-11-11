import { useState, type DragEvent } from 'react';
import { CheckCircle2, Download, Monitor } from 'lucide-react';
import { CATEGORY_LABEL, FORMATS, FORMAT_IDS, type Category } from '../core/formats';

export type FilterCategory = 'all' | Category;

interface Props {
  desktop: boolean;
  nativeHover: boolean;
  compact: boolean;
  filter: FilterCategory;
  onFilterChange: (next: FilterCategory) => void;
  onFiles: (files: File[]) => void;
  onBrowse: () => void;
  onGetDesktop: () => void;
}

const CATEGORIES: Category[] = ['image', 'media', 'document', 'data', 'archive'];

/** Web + App supported formats per category (100% working in browser <= 50 MB AND in Desktop App). */
const WEB_SUPPORTED_GROUPS = CATEGORIES.map((cat) => ({
  cat,
  label: CATEGORY_LABEL[cat],
  formats: FORMAT_IDS.filter((id) => FORMATS[id].category === cat && !FORMATS[id].desktopOnly),
})).filter((g) => g.formats.length > 0);

/** Desktop App Exclusive formats per category (requires native FFmpeg / Pandoc+Typst / ImageMagick). */
const APP_ONLY_GROUPS = CATEGORIES.map((cat) => ({
  cat,
  label: CATEGORY_LABEL[cat],
  formats: FORMAT_IDS.filter((id) => FORMATS[id].category === cat && Boolean(FORMATS[id].desktopOnly)),
})).filter((g) => g.formats.length > 0);

/** Full unified groups for the compiled Desktop App (where everything is supported with zero limits). */
const DESKTOP_ALL_GROUPS = CATEGORIES.map((cat) => ({
  cat,
  label: CATEGORY_LABEL[cat],
  formats: FORMAT_IDS.filter((id) => FORMATS[id].category === cat),
}));

export const FILTER_ACCEPT: Record<FilterCategory, string> = {
  all: '',
  image: '.png,.jpg,.jpeg,.webp,.avif,.bmp,.ico,.gif,.svg,.tga,.ppm,.pgm,.pbm,.tiff,.tif,.psd,.eps,.hdr,.exr,.dds,.heic,.heif,.jxl,.raw,.cr2,.nef,.arw,.dng,image/*',
  media: '.mp4,.webm,.mkv,.mov,.avi,.flv,.wmv,.mpg,.mpeg,.3gp,.mp3,.wav,.flac,.ogg,.aac,.m4a,.opus,.wma,.aiff,.ac3,video/*,audio/*',
  document: '.md,.markdown,.html,.htm,.txt,.rtf,.pdf,.docx,.epub,.odt,.tex,.latex,.rst,.org,.adoc,.fb2',
  data: '.json,.csv,.tsv,.yaml,.yml,.xml,.toml,.ini,.cfg,.conf,.env,.sql,.txt',
  archive: '.zip,.tar,.tgz,.tar.gz,.gz,.gzip',
};

export function Dropzone({
  desktop,
  nativeHover,
  compact,
  filter,
  onFilterChange,
  onFiles,
  onBrowse,
  onGetDesktop,
}: Props) {
  const [hover, setHover] = useState(false);
  const active = hover || nativeHover;

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setHover(false);
    if (desktop) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFiles(files);
  };

  const filterList = <T extends { cat: Category }>(groups: T[]) =>
    filter === 'all' ? groups : groups.filter((g) => g.cat === filter);

  const webGroups = filterList(WEB_SUPPORTED_GROUPS);
  const appOnlyGroups = filterList(APP_ONLY_GROUPS);
  const desktopGroups = filterList(DESKTOP_ALL_GROUPS);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={onDrop}
      className={`chalk-card relative overflow-hidden transition-colors ${
        active ? 'border-crimson bg-crimson/10' : ''
      } ${compact ? 'px-5 py-4' : 'px-6 py-7 sm:px-8 sm:py-8'}`}
    >
      {/* Top Action Row: Primary Drop/Browse CTA + Category Filter Dropdown */}
      <div className={`relative z-10 flex flex-wrap items-center justify-center gap-3 ${compact ? 'sm:justify-between' : ''}`}>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onBrowse}
            className="btn btn-primary px-6 py-2.5 text-base sm:text-lg tracking-wider"
          >
            {active ? 'DROP FILES NOW' : 'DROP / SELECT FILES'}
            <span className="ml-1 text-sm">►</span>
          </button>

          <select
            aria-label="Filter file types"
            value={filter}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onFilterChange(e.target.value as FilterCategory)}
            className="input h-[42px] cursor-pointer px-3 text-sm font-semibold"
          >
            <option value="all">All Categories</option>
            <option value="image">Images Only</option>
            <option value="media">Video &amp; Audio Only</option>
            <option value="document">Documents &amp; Ebooks Only</option>
            <option value="data">Data &amp; Configs Only</option>
            <option value="archive">Archives Only</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="chip">{desktop ? 'Unlimited File Size' : 'Web Max: 50 MB / file'}</span>
          {desktop && <span className="kbd hidden sm:inline-block">Ctrl+O</span>}
        </div>
      </div>

      {/* Supported Formats Lists */}
      {!compact && (
        <div className="relative z-10 mt-6 space-y-6 border-t border-chalk/20 pt-5">
          {desktop ? (
            /* DESKTOP APP VIEW: Unified list — no web limits, all formats unlocked */
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-chalk">
                  <CheckCircle2 size={14} className="text-crimson" />
                  Supported Formats {filter !== 'all' ? `— ${CATEGORY_LABEL[filter]}` : '(All Unlocked in Desktop App)'}
                </span>
                {filter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => onFilterChange('all')}
                    className="text-xs font-semibold text-chalk underline underline-offset-2 hover:text-crimson"
                  >
                    Show all categories
                  </button>
                )}
              </div>

              <div className={`grid gap-3 ${desktopGroups.length === 1 ? 'grid-cols-1' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
                {desktopGroups.map((g) => (
                  <div
                    key={g.cat}
                    onClick={() => onFilterChange(filter === g.cat ? 'all' : g.cat)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && onFilterChange(filter === g.cat ? 'all' : g.cat)}
                    className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                      filter === g.cat ? 'border-crimson bg-subtle' : 'border-chalk/25 bg-subtle/60 hover:border-chalk/60'
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wide text-chalk">{g.label}</span>
                      <span className="text-[11px] text-sketch">{g.formats.length} types</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {g.formats.map((f) => (
                        <span key={f} className="chip">
                          {FORMATS[f].label}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* WEBSITE VIEW: Two Strictly Separated Lists (1. Web & App Supported, 2. Desktop App Only) */
            <>
              {/* LIST 1: Web & App Supported */}
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-chalk">
                    <CheckCircle2 size={14} className="text-crimson" />
                    Web &amp; App Supported Formats — Instant in Browser (Up to 50 MB)
                  </span>
                  {filter !== 'all' && (
                    <button
                      type="button"
                      onClick={() => onFilterChange('all')}
                      className="text-xs font-semibold text-chalk underline underline-offset-2 hover:text-crimson"
                    >
                      Show all categories
                    </button>
                  )}
                </div>

                <div className={`grid gap-3 ${webGroups.length === 1 ? 'grid-cols-1' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
                  {webGroups.map((g) => (
                    <div
                      key={g.cat}
                      onClick={() => onFilterChange(filter === g.cat ? 'all' : g.cat)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && onFilterChange(filter === g.cat ? 'all' : g.cat)}
                      className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                        filter === g.cat ? 'border-crimson bg-subtle' : 'border-chalk/25 bg-subtle/60 hover:border-chalk/60'
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wide text-chalk">{g.label}</span>
                        <span className="text-[11px] text-sketch">{g.formats.length} types</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {g.formats.map((f) => (
                          <span key={f} className="chip">
                            {FORMATS[f].label}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* LIST 2: Desktop App Only Formats */}
              {appOnlyGroups.length > 0 && (
                <div className="rounded-lg border border-dashed border-chalk/30 bg-subtle/40 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sketch">
                      <Monitor size={14} className="text-crimson" />
                      Desktop App Only Formats — Unlimited File Size &amp; Native Pro Engines
                    </span>
                    <button type="button" onClick={onGetDesktop} className="btn btn-sm btn-primary">
                      <Download size={13} /> GET DESKTOP APP
                    </button>
                  </div>

                  <div className={`grid gap-3 ${appOnlyGroups.length === 1 ? 'grid-cols-1' : 'sm:grid-cols-3'}`}>
                    {appOnlyGroups.map((g) => (
                      <div key={g.cat} className="rounded-md border border-chalk/20 bg-surface/70 p-2.5">
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wide text-sketch">{g.label}</span>
                          <span className="text-[10px] text-sketch">App Only</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {g.formats.map((f) => (
                            <span key={f} className="chip opacity-80">
                              {FORMATS[f].label}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
