import {
  Archive,
  ArrowRight,
  Check,
  Database,
  Download,
  FileAudio,
  FileQuestion,
  FileText,
  FileVideo,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Play,
  RotateCcw,
  X,
} from 'lucide-react';
import { AUDIO_ONLY, FORMATS, type FormatId } from '../core/formats';
import { isWebCapable, resolveRoute, targetsFor, type Route } from '../core/routes';
import type { QueueItem } from '../hooks/useQueue';
import type { ModulesApi } from '../hooks/useModules';
import { engineById } from '../modules/registry';
import { formatBytes } from '../utils/format';
import { native } from '../lib/native';

interface Props {
  item: QueueItem;
  desktop: boolean;
  modules: ModulesApi;
  onTarget: (target: FormatId) => void;
  onConvert: () => void;
  onRemove: () => void;
  onGetDesktop: () => void;
  onOpenModules: () => void;
}

function FormatIcon({ format }: { format: FormatId | null }) {
  const cls = 'shrink-0 text-chalk';
  if (!format) return <FileQuestion size={20} className={cls} />;
  const cat = FORMATS[format].category;
  if (cat === 'image') return <ImageIcon size={20} className={cls} />;
  if (cat === 'data') return <Database size={20} className={cls} />;
  if (cat === 'archive') return <Archive size={20} className={cls} />;
  if (cat === 'media') return AUDIO_ONLY.includes(format) ? <FileAudio size={20} className={cls} /> : <FileVideo size={20} className={cls} />;
  return <FileText size={20} className={cls} />;
}

function StatusArea({ item, route, modules, onGetDesktop, onOpenModules }: {
  item: QueueItem;
  route: Route | null;
} & Pick<Props, 'modules' | 'onGetDesktop' | 'onOpenModules'>) {
  if (item.status === 'converting') {
    const determinate = item.progress > 0;
    return (
      <div className="flex items-center gap-2">
        <Loader2 size={14} className="animate-spin text-chalk" />
        <div className="h-2.5 flex-1 overflow-hidden rounded-full border border-chalk/50 bg-subtle">
          <div
            className={`h-full transition-[width] duration-200 ${determinate ? 'bg-crimson' : 'progress-stripes'}`}
            style={{ width: determinate ? `${item.progress}%` : '100%' }}
          />
        </div>
        <span className="w-10 text-right text-xs text-sketch">{determinate ? `${Math.round(item.progress)}%` : '…'}</span>
      </div>
    );
  }
  if (item.status === 'done') {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="chip">
          <Check size={11} strokeWidth={3} /> Done
        </span>
        <span className="truncate text-sketch">
          {item.outputName}
          {item.outputSize ? ` · ${formatBytes(item.outputSize)}` : ''}
        </span>
      </div>
    );
  }
  if (item.status === 'error') {
    return (
      <p className="line-clamp-2 text-xs text-crimson" title={item.error}>
        {item.error}
      </p>
    );
  }
  if (!item.format) return <span className="micro">Unknown format</span>;
  if (!route || route.kind === 'unsupported') return <span className="micro">Unsupported</span>;

  if (route.kind === 'web-size') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip">Over 50 MB — Requires Desktop App</span>
        <button className="btn btn-sm btn-primary" onClick={onGetDesktop}>
          GET APP
        </button>
      </div>
    );
  }
  if (route.kind === 'web-native') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip">Desktop App Exclusive Format</span>
        <button className="btn btn-sm btn-primary" onClick={onGetDesktop}>
          GET APP
        </button>
      </div>
    );
  }
  if (route.kind === 'needs-module') {
    const eng = engineById(route.module);
    const prog = modules.progress[route.module];
    if (prog) {
      return (
        <span className="micro flex items-center gap-1.5">
          <Loader2 size={12} className="animate-spin" /> {Math.round(prog.percent)}%
        </span>
      );
    }
    const available = modules.status[route.module]?.available ?? true;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip">Needs {eng?.shortName ?? route.module}</span>
        {available ? (
          <button className="btn btn-sm btn-primary" onClick={() => void modules.install(route.module)}>
            INSTALL (~{eng?.approxDownloadMb} MB)
          </button>
        ) : (
          <button className="btn btn-sm" onClick={onOpenModules}>
            ENGINES
          </button>
        )}
      </div>
    );
  }
  return <span className="micro">Ready</span>;
}

export function FileRow({ item, desktop, modules, onTarget, onConvert, onRemove, onGetDesktop, onOpenModules }: Props) {
  const allTargets = item.format ? targetsFor(item.format) : [];
  const webTargets = item.format ? allTargets.filter((t) => isWebCapable(item.format!, t)) : [];
  const appOnlyTargets = item.format ? allTargets.filter((t) => !isWebCapable(item.format!, t)) : [];

  const route = item.format && item.target ? resolveRoute(item.format, item.target, { desktop, installed: modules.installed, size: item.size }) : null;
  const canConvert = route?.kind === 'ok' && (item.status === 'idle' || item.status === 'error');

  return (
    <li className="chalk-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-chalk/30 bg-subtle">
          <FormatIcon format={item.format} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-bold text-chalk" title={item.path ?? item.name}>
              {item.name}
            </p>
            <span className="micro">{formatBytes(item.size)}</span>
            {item.format && <span className="chip">{FORMATS[item.format].label}</span>}
          </div>
          <div className="mt-1.5">
            <StatusArea item={item} route={route} modules={modules} onGetDesktop={onGetDesktop} onOpenModules={onOpenModules} />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
        {allTargets.length > 0 && (
          <>
            <ArrowRight size={15} className="text-sketch" />
            <select
              aria-label={`Target format for ${item.name}`}
              className="input w-[136px] text-xs uppercase"
              value={item.target ?? ''}
              disabled={item.status === 'converting'}
              onChange={(e) => onTarget(e.target.value as FormatId)}
            >
              {desktop ? (
                allTargets.map((t) => (
                  <option key={t} value={t}>
                    {FORMATS[t].label}
                  </option>
                ))
              ) : (
                <>
                  {webTargets.length > 0 && (
                    <optgroup label="Web & App Supported">
                      {webTargets.map((t) => (
                        <option key={t} value={t}>
                          {FORMATS[t].label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {appOnlyTargets.length > 0 && (
                    <optgroup label="Desktop App Only">
                      {appOnlyTargets.map((t) => (
                        <option key={t} value={t}>
                          {FORMATS[t].label} (App Only)
                        </option>
                      ))}
                    </optgroup>
                  )}
                </>
              )}
            </select>
          </>
        )}

        {item.status === 'done' ? (
          desktop ? (
            <button className="btn btn-sm btn-primary" onClick={() => item.outputPath && void native.revealPath(item.outputPath)}>
              <FolderOpen size={14} /> SHOW
            </button>
          ) : (
            <a className="btn btn-sm btn-primary" href={item.outputUrl} download={item.outputName}>
              <Download size={14} /> SAVE
            </a>
          )
        ) : (
          <button className="btn btn-sm btn-primary" disabled={!canConvert} onClick={onConvert}>
            {item.status === 'error' ? <RotateCcw size={14} /> : <Play size={14} />}
            {item.status === 'error' ? 'RETRY' : 'CONVERT'}
          </button>
        )}
        <button className="btn btn-sm btn-ghost !px-1.5" onClick={onRemove} disabled={item.status === 'converting'} aria-label={`Remove ${item.name}`}>
          <X size={16} />
        </button>
      </div>
    </li>
  );
}
