import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { ModuleId } from '../core/routes';

/** Typed wrappers around the Rust commands in src-tauri/src. Only call when isDesktopApp(). */

export interface NativeFileInfo {
  path: string;
  name: string;
  size: number;
  head: number[];
}

export interface ModuleStatus {
  id: ModuleId;
  name: string;
  builtin: boolean;
  installed: boolean;
  available: boolean;
  version: string | null;
  path: string | null;
  sizeBytes: number;
}

export interface ModuleProgress {
  moduleId: ModuleId;
  stage: 'starting' | 'downloading' | 'verifying' | 'extracting' | 'finalizing' | 'done' | 'error';
  artifactIndex: number;
  artifactCount: number;
  downloaded: number;
  total: number | null;
  percent: number;
  message: string | null;
}

export interface ConvertProgress {
  jobId: string;
  percent: number;
}

export const native = {
  fileInfo: (paths: string[]) => invoke<NativeFileInfo[]>('file_info', { paths }),

  readFileBytes: async (path: string) => new Uint8Array(await invoke<ArrayBuffer>('read_file_bytes', { path })),

  writeFileBytes: (path: string, data: Uint8Array) =>
    invoke<void>('write_file_bytes', data, { headers: { 'x-path': encodeURIComponent(path) } }),

  resolveOutputPath: (dir: string, fileName: string) => invoke<string>('resolve_output_path', { dir, fileName }),

  defaultOutputDir: () => invoke<string>('default_output_dir'),

  convertNative: (inputPath: string, outputPath: string, engine: string, args: string[], jobId: string) =>
    invoke<string>('convert_file_native', { inputPath, outputPath, engine, args, jobId }),

  getModulesStatus: () => invoke<ModuleStatus[]>('get_modules_status'),
  installModule: (moduleId: string) => invoke<ModuleStatus>('install_module', { moduleId }),
  uninstallModule: (moduleId: string) => invoke<ModuleStatus>('uninstall_module', { moduleId }),
  enginesDir: () => invoke<string>('engines_dir_path'),
  platform: () => invoke<string>('get_platform'),

  sha256File: (path: string) => invoke<string>('sha256_file', { path }),
  openFolder: (path: string) => invoke<void>('open_folder', { path }),
  revealPath: (path: string) => invoke<void>('reveal_path', { path }),
  openExternal: (url: string) => invoke<void>('open_external', { url }),
  exit: () => invoke<void>('exit_app'),

  async pickFiles(): Promise<string[]> {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const r = await open({ multiple: true, directory: false, title: 'Add files to convert' });
    if (!r) return [];
    return Array.isArray(r) ? r : [r];
  },

  async pickFolder(defaultPath?: string): Promise<string | null> {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const r = await open({ directory: true, multiple: false, defaultPath, title: 'Choose output folder' });
    return typeof r === 'string' ? r : null;
  },

  onModuleProgress: (cb: (p: ModuleProgress) => void): Promise<UnlistenFn> =>
    listen<ModuleProgress>('module-download-progress', (e) => cb(e.payload)),

  onConvertProgress: (cb: (p: ConvertProgress) => void): Promise<UnlistenFn> =>
    listen<ConvertProgress>('convert-progress', (e) => cb(e.payload)),

  async onDragDrop(handlers: { hover: (over: boolean) => void; drop: (paths: string[]) => void }): Promise<UnlistenFn> {
    const { getCurrentWebview } = await import('@tauri-apps/api/webview');
    return getCurrentWebview().onDragDropEvent((event) => {
      const p = event.payload;
      if (p.type === 'enter' || p.type === 'over') handlers.hover(true);
      else if (p.type === 'drop') {
        handlers.hover(false);
        handlers.drop(p.paths);
      } else handlers.hover(false);
    });
  },
};

/** Subscribe to a Tauri event from a React effect, safe under StrictMode double-mount. */
export function subscribe(start: () => Promise<UnlistenFn>): () => void {
  let un: UnlistenFn | null = null;
  let cancelled = false;
  start()
    .then((f) => (cancelled ? f() : (un = f)))
    .catch(() => {});
  return () => {
    cancelled = true;
    un?.();
  };
}

/** Opens an external link in the system browser (desktop) or a new tab (web). */
export function openExternal(url: string, desktop: boolean): void {
  if (!url) return;
  if (desktop) void native.openExternal(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}
