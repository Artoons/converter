import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Code2,
  Download,
  Eraser,
  FileUp,
  FolderOpen,
  HelpCircle,
  Info,
  LogOut,
  Moon,
  Package,
  Play,
  Puzzle,
  Settings,
  ShieldCheck,
  Sun,
  Target,
  Trash2,
} from 'lucide-react';
import { MenuBar, type MenuDef } from './components/MenuBar';
import { AdSlot } from './components/AdSlot';
import { Dropzone, FILTER_ACCEPT, type FilterCategory } from './components/Dropzone';
import { FileRow } from './components/FileRow';
import { DownloadModal } from './components/DownloadModal';
import { ModuleManagerModal } from './components/ModuleManagerModal';
import { AboutModal } from './components/AboutModal';
import { PreferencesModal, type PrefsTab } from './components/PreferencesModal';
import { HowItWorksModal } from './components/HowItWorksModal';
import { ChecksumModal } from './components/ChecksumModal';
import { FirstRunModal } from './components/FirstRunModal';
import { useTheme } from './hooks/useTheme';
import { usePrefs } from './hooks/usePrefs';
import { useModules } from './hooks/useModules';
import { useQueue } from './hooks/useQueue';
import { FORMATS, formatFromName, type FormatId } from './core/formats';
import { resolveRoute, targetsFor } from './core/routes';
import { ENGINES } from './modules/registry';
import { config, isDesktopApp } from './utils/env';
import { native, openExternal, subscribe } from './lib/native';

type ModalId = 'download' | 'modules' | 'about' | 'prefs' | 'how' | 'checksums' | 'setup' | null;
const SETUP_KEY = 'artoons.setup.v1';

export default function App() {
  const desktop = useMemo(isDesktopApp, []);
  const { theme, toggle: toggleTheme } = useTheme();
  const { prefs, update: updatePrefs } = usePrefs();
  const modules = useModules();
  const queue = useQueue({ desktop, installed: modules.installed, prefs });

  const [modal, setModal] = useState<ModalId>(null);
  const [prefsTab, setPrefsTab] = useState<PrefsTab>('general');
  const [filter, setFilter] = useState<FilterCategory>('all');
  const [nativeHover, setNativeHover] = useState(false);
  const [defaultOutputDir, setDefaultOutputDir] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const close = useCallback(() => setModal(null), []);

  const addFilteredFiles = useCallback(
    async (files: File[]) => {
      if (filter === 'all') {
        await queue.addFiles(files);
        return;
      }
      const matching = files.filter((f) => {
        const fmt = formatFromName(f.name);
        return fmt ? FORMATS[fmt].category === filter : true;
      });
      await queue.addFiles(matching.length ? matching : files);
    },
    [filter, queue],
  );

  useEffect(() => {
    if (!desktop) return;
    native.defaultOutputDir().then(setDefaultOutputDir).catch(() => {});
    if (!localStorage.getItem(SETUP_KEY)) setModal('setup');
    return subscribe(() => native.onDragDrop({ hover: setNativeHover, drop: (paths) => void queue.addPaths(paths) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktop]);

  useEffect(() => {
    if (desktop) return;
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, [desktop]);

  const openFiles = useCallback(async () => {
    if (desktop) await queue.addPaths(await native.pickFiles());
    else fileInput.current?.click();
  }, [desktop, queue]);

  const openPrefs = useCallback((tab: PrefsTab) => {
    setPrefsTab(tab);
    setModal('prefs');
  }, []);

  const openOutputFolder = useCallback(() => {
    const dir = prefs.outputDir || defaultOutputDir;
    if (dir) void native.openFolder(dir);
  }, [prefs.outputDir, defaultOutputDir]);

  const finishSetup = useCallback(() => {
    localStorage.setItem(SETUP_KEY, '1');
    setModal(null);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'o') {
        e.preventDefault();
        void openFiles();
      } else if (k === ',' && desktop) {
        e.preventDefault();
        openPrefs('general');
      } else if (k === 'l' && e.shiftKey) {
        e.preventDefault();
        toggleTheme();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [desktop, openFiles, openPrefs, toggleTheme]);

  // Classic File / Edit / Modules / Help menus ONLY appear in the Desktop App
  const menus: MenuDef[] = desktop
    ? [
        {
          label: 'File',
          items: [
            { label: 'Open Files', icon: <FileUp size={14} />, shortcut: 'Ctrl+O', onSelect: () => void openFiles() },
            { type: 'separator' },
            { label: 'Clear Completed', icon: <Eraser size={14} />, onSelect: queue.clearCompleted, disabled: !queue.items.some((i) => i.status === 'done') },
            { label: 'Clear All Queue', icon: <Trash2 size={14} />, onSelect: queue.clearAll, disabled: !queue.items.length },
            { type: 'separator' },
            { label: 'Open Output Folder', icon: <FolderOpen size={14} />, onSelect: openOutputFolder },
            { label: 'Exit', icon: <LogOut size={14} />, onSelect: () => void native.exit() },
          ],
        },
        {
          label: 'Edit',
          items: [
            { label: 'Default Target Format', icon: <Target size={14} />, onSelect: () => openPrefs('defaults') },
            {
              label: theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme',
              icon: theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />,
              shortcut: 'Ctrl+Shift+L',
              onSelect: toggleTheme,
            },
            { type: 'separator' },
            { label: 'Preferences', icon: <Settings size={14} />, shortcut: 'Ctrl+,', onSelect: () => openPrefs('general') },
          ],
        },
        {
          label: 'Modules',
          items: [
            { label: 'Manage Engines', icon: <Puzzle size={14} />, onSelect: () => setModal('modules') },
            { label: 'Pack Setup Wizard…', icon: <Package size={14} />, onSelect: () => setModal('setup') },
            { type: 'separator' },
            ...ENGINES.map((e) => ({
              label: e.shortName,
              icon: <Package size={14} />,
              onSelect: () => setModal('modules'),
              badge: e.builtin ? (
                <span className="chip">Built-in</span>
              ) : modules.installed.has(e.id) ? (
                <span className="chip">Installed</span>
              ) : (
                <span className="chip">~{e.approxDownloadMb} MB</span>
              ),
            })),
          ],
        },
        {
          label: 'Help',
          items: [
            { label: 'How It Works', icon: <HelpCircle size={14} />, onSelect: () => setModal('how') },
            { label: 'GitHub Repository', icon: <Code2 size={14} />, onSelect: () => openExternal(config.repoUrl, desktop) },
            { label: 'Verify Checksums', icon: <ShieldCheck size={14} />, onSelect: () => setModal('checksums') },
            { type: 'separator' },
            { label: 'About / Version', icon: <Info size={14} />, onSelect: () => setModal('about') },
          ],
        },
      ]
    : [];

  const batchTargets = useMemo(() => {
    const set = new Set<FormatId>();
    for (const i of queue.items) if (i.format) targetsFor(i.format).forEach((t) => set.add(t));
    return [...set];
  }, [queue.items]);

  const convertible = queue.items.filter(
    (i) =>
      (i.status === 'idle' || i.status === 'error') &&
      i.format &&
      i.target &&
      resolveRoute(i.format, i.target, { desktop, installed: modules.installed, size: i.size }).kind === 'ok',
  ).length;
  const busy = queue.items.some((i) => i.status === 'converting');
  const hasItems = queue.items.length > 0;

  return (
    <div className="relative flex h-full flex-col">
      <MenuBar
        menus={menus}
        right={
          <>
            {desktop && (
              <button
                className="btn btn-sm"
                onClick={() => setModal('modules')}
                title="Install or remove conversion engines"
              >
                <Puzzle size={14} /> Engines ({modules.installed.size}/{ENGINES.length})
              </button>
            )}
            <button
              className="btn btn-sm !px-2.5"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              <span className="hidden sm:inline">{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
            {!desktop && (
              <button className="btn btn-sm btn-primary" onClick={() => setModal('download')}>
                <Download size={14} /> GET DESKTOP APP
              </button>
            )}
          </>
        }
      />

      <input
        ref={fileInput}
        type="file"
        multiple
        accept={FILTER_ACCEPT[filter]}
        hidden
        onChange={(e) => {
          if (e.target.files?.length) void addFilteredFiles(Array.from(e.target.files));
          e.target.value = '';
        }}
      />

      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto">
        <div
          className={
            desktop
              ? 'mx-auto w-full max-w-5xl p-4 sm:p-6'
              : 'mx-auto grid w-full max-w-[1680px] gap-5 p-4 sm:p-6 lg:grid-cols-[200px_minmax(0,1fr)_200px] xl:grid-cols-[240px_minmax(0,1fr)_240px]'
          }
        >
          {!desktop && <AdSlot position="left" />}

          <main className="min-w-0 space-y-5">
            {/* Single prominent, professional privacy banner */}
            <div className="rounded-lg border border-chalk/25 bg-surface px-4 py-2.5 text-center">
              <p className="text-sm font-medium text-chalk sm:text-base">
                <span className="font-bold text-crimson">100% Local &amp; Private:</span> Unlike cloud converters that upload your files to remote servers, every conversion runs directly on your device.
              </p>
            </div>

            <Dropzone
              desktop={desktop}
              nativeHover={nativeHover}
              compact={hasItems}
              filter={filter}
              onFilterChange={setFilter}
              onFiles={(f) => void addFilteredFiles(f)}
              onBrowse={() => void openFiles()}
              onGetDesktop={() => setModal('download')}
            />

            {hasItems && (
              <section className="space-y-3">
                <div className="chalk-card flex flex-wrap items-center gap-2 p-2.5">
                  <span className="px-2 text-sm font-bold text-chalk">
                    {queue.items.length} {queue.items.length === 1 ? 'File' : 'Files'}
                  </span>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Convert all to"
                      className="input text-xs uppercase"
                      value=""
                      onChange={(e) => e.target.value && queue.setAllTargets(e.target.value as FormatId)}
                    >
                      <option value="">Convert all to…</option>
                      {batchTargets.map((t) => (
                        <option key={t} value={t}>
                          {FORMATS[t].label}
                        </option>
                      ))}
                    </select>
                    <button className="btn btn-sm" onClick={queue.clearCompleted} disabled={!queue.items.some((i) => i.status === 'done')}>
                      <Eraser size={14} /> CLEAR DONE
                    </button>
                    <button className="btn btn-sm btn-primary" onClick={() => void queue.convertAll()} disabled={!convertible || busy}>
                      <Play size={14} /> CONVERT ALL{convertible ? ` (${convertible})` : ''}
                    </button>
                  </div>
                </div>

                <ul className="space-y-2.5">
                  {queue.items.map((item) => (
                    <FileRow
                      key={item.id}
                      item={item}
                      desktop={desktop}
                      modules={modules}
                      onTarget={(t) => queue.setTarget(item.id, t)}
                      onConvert={() => void queue.convert(item.id)}
                      onRemove={() => queue.remove(item.id)}
                      onGetDesktop={() => setModal('download')}
                      onOpenModules={() => setModal('modules')}
                    />
                  ))}
                </ul>
              </section>
            )}
          </main>

          {!desktop && <AdSlot position="right" />}
        </div>
      </div>

      <DownloadModal open={modal === 'download'} onClose={close} onVerify={() => setModal('checksums')} />
      <ModuleManagerModal open={modal === 'modules'} onClose={close} modules={modules} onGetDesktop={() => setModal('download')} />
      <AboutModal open={modal === 'about'} onClose={close} modules={modules} />
      <PreferencesModal
        open={modal === 'prefs'}
        onClose={close}
        tab={prefsTab}
        onTab={setPrefsTab}
        prefs={prefs}
        update={updatePrefs}
        desktop={desktop}
        theme={theme}
        toggleTheme={toggleTheme}
        defaultOutputDir={defaultOutputDir}
      />
      <HowItWorksModal open={modal === 'how'} onClose={close} />
      <ChecksumModal open={modal === 'checksums'} onClose={close} desktop={desktop} />
      {desktop && <FirstRunModal open={modal === 'setup'} onClose={finishSetup} modules={modules} />}
    </div>
  );
}
