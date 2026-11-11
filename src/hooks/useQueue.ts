import { useCallback, useEffect, useRef, useState } from 'react';
import { detectFormat } from '../core/detect';
import { FORMATS, type FormatId } from '../core/formats';
import {
  isBrowserEngine,
  isWebCapable,
  nativeArgs,
  outputFileName,
  resolveRoute,
  targetsFor,
  type Engine,
} from '../core/routes';
import { browserConvert } from '../core/convert';
import { native, subscribe } from '../lib/native';
import { baseName, dirName, errorMessage, triggerDownload, uid } from '../utils/format';
import type { Prefs } from './usePrefs';

export type ItemStatus = 'idle' | 'converting' | 'done' | 'error';

export interface QueueItem {
  id: string;
  name: string;
  size: number;
  file?: File; // web
  path?: string; // desktop
  format: FormatId | null;
  detectedBy: 'magic' | 'extension' | 'none';
  extMismatch: boolean;
  target: FormatId | null;
  status: ItemStatus;
  progress: number;
  error?: string;
  outputUrl?: string;
  outputName?: string;
  outputPath?: string;
  outputSize?: number;
}

interface Options {
  desktop: boolean;
  installed: Set<string>;
  prefs: Prefs;
}

interface Entry {
  name: string;
  size: number;
  head: Uint8Array;
  file?: File;
  path?: string;
}

export function useQueue(opts: Options) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const patch = useCallback(
    (id: string, p: Partial<QueueItem>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...p } : i))),
    [],
  );

  useEffect(() => {
    if (!opts.desktop) return;
    return subscribe(() =>
      native.onConvertProgress(({ jobId, percent }) =>
        setItems((list) => list.map((i) => (i.id === jobId && i.status === 'converting' ? { ...i, progress: percent } : i))),
      ),
    );
  }, [opts.desktop]);

  // Update idle queued items when default target formats change in Preferences
  useEffect(() => {
    setItems((list) =>
      list.map((i) => {
        if (i.status !== 'idle' || !i.format) return i;
        const preferred = opts.prefs.defaultTargets[FORMATS[i.format].category];
        const targets = targetsFor(i.format);
        if (preferred && targets.includes(preferred) && i.target !== preferred) {
          return { ...i, target: preferred };
        }
        return i;
      }),
    );
  }, [opts.prefs.defaultTargets]);

  const addEntries = useCallback((entries: Entry[]) => {
    const { prefs, desktop } = optsRef.current;
    const created = entries.map<QueueItem>((e) => {
      const det = detectFormat(e.head, e.name);
      const allTargets = det.format ? targetsFor(det.format) : [];
      const webTargets = det.format ? allTargets.filter((t) => isWebCapable(det.format!, t)) : [];
      const candidates = !desktop && webTargets.length > 0 ? webTargets : allTargets;
      const preferred = det.format ? prefs.defaultTargets[FORMATS[det.format].category] : '';
      const target = preferred && candidates.includes(preferred) ? preferred : candidates[0] ?? allTargets[0] ?? null;
      return {
        id: uid(),
        name: e.name,
        size: e.size,
        file: e.file,
        path: e.path,
        format: det.format,
        detectedBy: det.by,
        extMismatch: det.mismatch,
        target,
        status: 'idle',
        progress: 0,
      };
    });
    setItems((l) => [...l, ...created]);
  }, []);

  const addFiles = useCallback(
    async (files: File[]) => {
      const entries = await Promise.all(
        files.map(async (f) => ({
          name: f.name,
          size: f.size,
          file: f,
          head: new Uint8Array(await f.slice(0, 64).arrayBuffer()),
        })),
      );
      addEntries(entries);
    },
    [addEntries],
  );

  const addPaths = useCallback(
    async (paths: string[]) => {
      if (!paths.length) return;
      const infos = await native.fileInfo(paths);
      addEntries(infos.map((i) => ({ name: i.name, size: i.size, path: i.path, head: new Uint8Array(i.head) })));
    },
    [addEntries],
  );

  const setTarget = useCallback((id: string, target: FormatId) => patch(id, { target, status: 'idle', error: undefined }), [patch]);

  const setAllTargets = useCallback((target: FormatId) => {
    setItems((list) =>
      list.map((i) =>
        i.format && i.status !== 'converting' && targetsFor(i.format).includes(target)
          ? { ...i, target, status: i.status === 'done' ? 'idle' : i.status, error: undefined }
          : i,
      ),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setItems((list) => {
      const it = list.find((i) => i.id === id);
      if (it?.outputUrl) URL.revokeObjectURL(it.outputUrl);
      return list.filter((i) => i.id !== id);
    });
  }, []);

  const clearCompleted = useCallback(() => {
    setItems((list) => {
      list.filter((i) => i.status === 'done' && i.outputUrl).forEach((i) => URL.revokeObjectURL(i.outputUrl!));
      return list.filter((i) => i.status !== 'done');
    });
  }, []);

  const clearAll = useCallback(() => {
    setItems((list) => {
      list.forEach((i) => i.outputUrl && URL.revokeObjectURL(i.outputUrl));
      return list.filter((i) => i.status === 'converting');
    });
  }, []);

  const run = useCallback(async (item: QueueItem, target: FormatId, engine: Engine): Promise<Partial<QueueItem>> => {
    const { desktop, prefs } = optsRef.current;
    const from = item.format!;
    const outName = outputFileName(item.name, target);
    const quality = Math.min(1, Math.max(0.01, prefs.quality / 100));

    if (desktop && item.path) {
      const dir = prefs.outputDir || dirName(item.path);
      const outPath = await native.resolveOutputPath(dir, outName);
      if (isBrowserEngine(engine)) {
        const bytes = await native.readFileBytes(item.path);
        const blob = await browserConvert(engine, new Blob([bytes], { type: FORMATS[from].mime }), from, target, {
          quality,
          title: baseName(item.name),
        });
        await native.writeFileBytes(outPath, new Uint8Array(await blob.arrayBuffer()));
        return { outputPath: outPath, outputName: outName, outputSize: blob.size };
      }
      const result = await native.convertNative(item.path, outPath, engine, nativeArgs(engine, from, target, prefs.quality), item.id);
      return { outputPath: result, outputName: outName };
    }

    if (!item.file || !isBrowserEngine(engine)) throw new Error('This conversion requires the Desktop App');
    const blob = await browserConvert(engine, item.file, from, target, { quality, title: baseName(item.name) });
    const url = URL.createObjectURL(blob);
    if (prefs.autoDownload) triggerDownload(url, outName);
    return { outputUrl: url, outputName: outName, outputSize: blob.size };
  }, []);

  const convert = useCallback(
    async (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (!item || !item.format || !item.target || item.status === 'converting') return;
      const { desktop, installed, prefs } = optsRef.current;
      const route = resolveRoute(item.format, item.target, { desktop, installed, size: item.size });
      if (route.kind !== 'ok') return;
      if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
      patch(id, { status: 'converting', progress: 0, error: undefined, outputUrl: undefined, outputPath: undefined, outputSize: undefined });
      // Let React paint the "converting" state before CPU-heavy canvas work.
      await new Promise((r) => setTimeout(r, 16));
      try {
        const result = await run(item, item.target, route.engine);
        patch(id, { status: 'done', progress: 100, ...result });
        if (desktop && prefs.revealAfterConvert && result.outputPath) void native.revealPath(result.outputPath).catch(() => {});
      } catch (e) {
        patch(id, { status: 'error', progress: 0, error: errorMessage(e) });
      }
    },
    [patch, run],
  );

  const convertAll = useCallback(async () => {
    for (const i of itemsRef.current) {
      if (i.status === 'idle' || i.status === 'error') await convert(i.id);
    }
  }, [convert]);

  return { items, addFiles, addPaths, setTarget, setAllTargets, remove, clearCompleted, clearAll, convert, convertAll };
}

export type QueueApi = ReturnType<typeof useQueue>;
