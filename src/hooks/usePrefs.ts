import { useCallback, useEffect, useState } from 'react';
import type { Category, FormatId } from '../core/formats';

export interface Prefs {
  /** Web: download each result automatically when it finishes. */
  autoDownload: boolean;
  /** Desktop: output folder ('' = next to the source file). */
  outputDir: string;
  /** Desktop: reveal the file in the OS file manager after converting. */
  revealAfterConvert: boolean;
  /** JPG / WEBP quality, 1-100. */
  quality: number;
  /** Default target format per category ('' = first available). */
  defaultTargets: Record<Category, FormatId | ''>;
}

export const DEFAULT_PREFS: Prefs = {
  autoDownload: false,
  outputDir: '',
  revealAfterConvert: false,
  quality: 92,
  defaultTargets: { image: 'webp', data: 'json', media: 'mp4', document: 'pdf' },
};

const KEY = 'artoons.prefs.v1';

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return { ...DEFAULT_PREFS, ...p, defaultTargets: { ...DEFAULT_PREFS.defaultTargets, ...(p.defaultTargets ?? {}) } };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(load);
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  }, [prefs]);
  const update = useCallback((patch: Partial<Prefs>) => setPrefs((p) => ({ ...p, ...patch })), []);
  return { prefs, update };
}
