import { FolderOpen, Moon, Settings, Sun } from 'lucide-react';
import { Modal } from './Modal';
import type { Prefs } from '../hooks/usePrefs';
import { CATEGORY_LABEL, FORMATS, type Category, type FormatId } from '../core/formats';
import { native } from '../lib/native';

export type PrefsTab = 'general' | 'defaults';

interface Props {
  open: boolean;
  onClose: () => void;
  tab: PrefsTab;
  onTab: (t: PrefsTab) => void;
  prefs: Prefs;
  update: (p: Partial<Prefs>) => void;
  desktop: boolean;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  defaultOutputDir: string;
}

const CATEGORY_TARGETS: Record<Category, FormatId[]> = {
  image: ['png', 'jpg', 'webp', 'bmp', 'ico', 'svg', 'gif', 'tiff'],
  data: ['json', 'csv', 'tsv', 'yaml', 'txt'],
  media: ['mp4', 'mkv', 'mov', 'webm', 'mp3', 'wav', 'flac', 'ogg', 'gif'],
  document: ['pdf', 'docx', 'epub', 'html', 'md', 'txt'],
};

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2.5">
      <span>
        <span className="block text-sm font-bold text-chalk">{label}</span>
        {hint && <span className="block text-xs text-sketch">{hint}</span>}
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full border border-chalk/50 bg-subtle transition-colors peer-checked:border-crimson peer-checked:bg-crimson after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-chalk after:transition-transform peer-checked:after:translate-x-5 peer-checked:after:bg-white" />
    </label>
  );
}

export function PreferencesModal({ open, onClose, tab, onTab, prefs, update, desktop, theme, toggleTheme, defaultOutputDir }: Props) {
  const chooseFolder = async () => {
    const dir = await native.pickFolder(prefs.outputDir || defaultOutputDir || undefined);
    if (dir) update({ outputDir: dir });
  };

  return (
    <Modal open={open} onClose={onClose} title="Preferences" icon={<Settings size={16} />} width="max-w-xl">
      <div className="mb-4 flex gap-1.5">
        <button className={`btn btn-sm ${tab === 'general' ? 'btn-primary' : ''}`} onClick={() => onTab('general')}>
          General
        </button>
        <button className={`btn btn-sm ${tab === 'defaults' ? 'btn-primary' : ''}`} onClick={() => onTab('defaults')}>
          Default Target Formats
        </button>
      </div>

      {tab === 'general' ? (
        <div className="divide-y divide-chalk/20">
          <div className="flex items-center justify-between py-2.5">
            <span className="text-sm font-bold text-chalk">Theme</span>
            <button className="btn btn-sm" onClick={toggleTheme}>
              {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
              {theme === 'dark' ? 'Dark (Click for Light)' : 'Light (Click for Dark)'}
            </button>
          </div>

          {desktop ? (
            <>
              <div className="py-3">
                <p className="text-sm font-bold text-chalk">Default save location</p>
                <p className="text-xs text-sketch">Leave empty to save next to each source file.</p>
                <div className="mt-2 flex gap-2">
                  <input className="input min-w-0 flex-1 font-mono text-xs" readOnly value={prefs.outputDir} placeholder="Same folder as the source file" />
                  <button className="btn btn-sm" onClick={() => void chooseFolder()}>
                    <FolderOpen size={14} /> Choose…
                  </button>
                  {prefs.outputDir && (
                    <button className="btn btn-sm btn-ghost" onClick={() => update({ outputDir: '' })}>
                      Reset
                    </button>
                  )}
                </div>
              </div>
              <Toggle
                checked={prefs.revealAfterConvert}
                onChange={(v) => update({ revealAfterConvert: v })}
                label="Show file in folder after converting"
              />
            </>
          ) : (
            <Toggle
              checked={prefs.autoDownload}
              onChange={(v) => update({ autoDownload: v })}
              label="Auto-download results"
              hint="Save each converted file as soon as it finishes."
            />
          )}

          <div className="py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-chalk">JPG / WEBP quality</span>
              <span className="font-mono text-xs text-chalk">{prefs.quality}%</span>
            </div>
            <input
              type="range"
              min={40}
              max={100}
              value={prefs.quality}
              onChange={(e) => update({ quality: Number(e.target.value) })}
              className="mt-2 w-full accent-[#E63946]"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-sketch">Files added to the queue automatically select these target formats when supported.</p>
          {(Object.keys(CATEGORY_TARGETS) as Category[]).map((cat) => (
            <label key={cat} className="flex items-center justify-between gap-4">
              <span className="text-sm font-bold text-chalk">{CATEGORY_LABEL[cat]}</span>
              <select
                className="input w-36 font-mono text-xs uppercase"
                value={prefs.defaultTargets[cat]}
                onChange={(e) => update({ defaultTargets: { ...prefs.defaultTargets, [cat]: e.target.value as FormatId | '' } })}
              >
                <option value="">Auto</option>
                {CATEGORY_TARGETS[cat].map((t) => (
                  <option key={t} value={t}>
                    {FORMATS[t].label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}
