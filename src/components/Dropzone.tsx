import { useState, type DragEvent } from 'react';
import { CATEGORY_LABEL, FORMATS, type Category, type FormatId } from '../core/formats';

export type FilterCategory = 'all' | Category;

interface Props {
  desktop: boolean;
  nativeHover: boolean;
  compact: boolean;
  filter: FilterCategory;
  onFilterChange: (next: FilterCategory) => void;
  onFiles: (files: File[]) => void;
  onBrowse: () => void;
}

const FORMAT_GROUPS: { cat: Category; label: string; formats: FormatId[] }[] = [
  { cat: 'image', label: CATEGORY_LABEL.image, formats: ['png', 'jpg', 'webp', 'bmp', 'ico', 'gif', 'tiff', 'svg'] },
  { cat: 'media', label: CATEGORY_LABEL.media, formats: ['mp4', 'mkv', 'mov', 'webm', 'mp3', 'wav', 'flac', 'ogg'] },
  { cat: 'document', label: CATEGORY_LABEL.document, formats: ['pdf', 'docx', 'epub', 'md', 'html', 'txt'] },
  { cat: 'data', label: CATEGORY_LABEL.data, formats: ['json', 'csv', 'tsv', 'yaml', 'txt'] },
];

export const FILTER_ACCEPT: Record<FilterCategory, string> = {
  all: '',
  image: '.png,.jpg,.jpeg,.webp,.bmp,.ico,.gif,.tiff,.tif,.svg,image/*',
  media: '.mp4,.mkv,.mov,.webm,.mp3,.wav,.flac,.ogg,.m4v,.opus,video/*,audio/*',
  document: '.pdf,.docx,.epub,.md,.markdown,.html,.htm,.txt',
  data: '.json,.csv,.tsv,.yaml,.yml,.txt',
};

export function Dropzone({
  desktop,
  nativeHover,
  compact,
  filter,
  onFilterChange,
  onFiles,
  onBrowse,
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

  const visibleGroups = filter === 'all' ? FORMAT_GROUPS : FORMAT_GROUPS.filter((g) => g.cat === filter);

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
      } ${compact ? 'px-5 py-4' : 'px-6 py-8 sm:px-8 sm:py-9'}`}
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
            <option value="all">All File Types</option>
            <option value="image">Images Only</option>
            <option value="media">Video &amp; Audio Only</option>
            <option value="document">Documents Only</option>
            <option value="data">Data &amp; Spreadsheets Only</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="chip">{desktop ? 'Unlimited Size' : 'Up to 50 MB / file'}</span>
          {desktop && <span className="kbd hidden sm:inline-block">Ctrl+O</span>}
        </div>
      </div>

      {/* Supported File Types Directory Below */}
      {!compact && (
        <div className="relative z-10 mt-6 border-t border-chalk/20 pt-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-sketch">
              Supported Formats {filter !== 'all' ? `— ${CATEGORY_LABEL[filter]}` : ''}
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

          <div className={`grid gap-3 ${visibleGroups.length === 1 ? 'grid-cols-1' : 'sm:grid-cols-2 lg:grid-cols-4'}`}>
            {visibleGroups.map((g) => (
              <div
                key={g.cat}
                onClick={() => onFilterChange(filter === g.cat ? 'all' : g.cat)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onFilterChange(filter === g.cat ? 'all' : g.cat)}
                className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                  filter === g.cat
                    ? 'border-crimson bg-subtle'
                    : 'border-chalk/25 bg-subtle/60 hover:border-chalk/60'
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
      )}
    </div>
  );
}
