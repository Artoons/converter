import manifest from '../../src-tauri/engines.json';
import type { ModuleId } from '../core/routes';

export type EngineCategory = 'images' | 'media' | 'documents';

export interface EngineInfo {
  id: ModuleId;
  name: string;
  shortName: string;
  category: EngineCategory;
  builtin?: boolean;
  version: string;
  license: string;
  approxDownloadMb: number;
  approxInstalledMb: number;
  description: string;
  unlocks: string[];
  platforms?: Record<string, unknown[]>;
}

/** Shared with the Rust backend (src-tauri/engines.json) — single source of truth. */
export const ENGINES = manifest.engines as unknown as EngineInfo[];
export const CORE_INSTALLER_MB: number = manifest.coreInstallerMb;

export const engineById = (id: string): EngineInfo | undefined => ENGINES.find((e) => e.id === id);

export const CATEGORY_TABS: { id: 'all' | EngineCategory; label: string }[] = [
  { id: 'all', label: 'all' },
  { id: 'images', label: 'images' },
  { id: 'media', label: 'video & audio' },
  { id: 'documents', label: 'documents' },
];

export const ENGINE_ACCENT: Record<ModuleId, string> = {
  core: 'bg-[#121212]',
  ffmpeg: 'bg-[#121212]',
  pandoc: 'bg-[#121212]',
  imagemagick: 'bg-[#121212]',
};

export function availableOn(engine: EngineInfo, platformKey: string): boolean {
  return Boolean(engine.builtin || engine.platforms?.[platformKey]);
}

/** Quick install presets ("only video", "only images", …). */
export const PACK_PRESETS: { id: string; label: string; modules: ModuleId[] }[] = [
  { id: 'images', label: 'images only', modules: [] },
  { id: 'video', label: 'video & audio', modules: ['ffmpeg'] },
  { id: 'docs', label: 'documents', modules: ['pandoc'] },
  { id: 'pro-images', label: 'pro images', modules: ['imagemagick'] },
  { id: 'all', label: 'all packs', modules: ['ffmpeg', 'pandoc', 'imagemagick'] },
];
