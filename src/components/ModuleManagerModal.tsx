import { useState } from 'react';
import { Download, FolderOpen, HardDrive, Loader2, Puzzle, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import type { ModulesApi } from '../hooks/useModules';
import { CATEGORY_TABS, CORE_INSTALLER_MB, ENGINES, availableOn, type EngineCategory, type EngineInfo } from '../modules/registry';
import { formatBytes } from '../utils/format';
import { native } from '../lib/native';
import { detectOS, osToPlatformKey } from '../utils/os';

interface Props {
  open: boolean;
  onClose: () => void;
  modules: ModulesApi;
  onGetDesktop: () => void;
}

function EngineCard({ engine, modules, onGetDesktop }: { engine: EngineInfo; modules: ModulesApi; onGetDesktop: () => void }) {
  const { desktop } = modules;
  const st = modules.status[engine.id];
  const prog = modules.progress[engine.id];
  const err = modules.errors[engine.id];
  const platformKey = modules.platform || osToPlatformKey(detectOS());
  const available = desktop ? (st?.available ?? availableOn(engine, platformKey)) : true;
  const installed = engine.builtin || Boolean(st?.installed);
  const [confirm, setConfirm] = useState(false);

  return (
    <li className="chalk-card overflow-hidden">
      <div className="flex items-center gap-3 p-3 sm:p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-chalk/30 bg-subtle text-chalk">
          <Puzzle size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-chalk">{engine.name}</h3>
            <span className="micro">{engine.builtin ? 'Built-in' : `~${engine.approxDownloadMb} MB`}</span>
            {!engine.builtin && !desktop && <span className="chip">Desktop Exclusive</span>}
            {!engine.builtin && desktop && installed && <span className="chip">Installed</span>}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {engine.unlocks.map((u) => (
              <span key={u} className="chip">
                {u}
              </span>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {engine.builtin ? null : !desktop ? (
            <button className="btn btn-sm btn-primary" onClick={onGetDesktop}>
              <Download size={14} /> GET APP
            </button>
          ) : prog ? (
            <span className="btn btn-sm pointer-events-none">
              <Loader2 size={14} className="animate-spin" /> {Math.round(prog.percent)}%
            </span>
          ) : installed ? (
            confirm ? (
              <div className="flex gap-1">
                <button className="btn btn-sm btn-primary" onClick={() => { setConfirm(false); void modules.uninstall(engine.id); }}>
                  REMOVE
                </button>
                <button className="btn btn-sm" onClick={() => setConfirm(false)}>
                  KEEP
                </button>
              </div>
            ) : (
              <button className="btn btn-sm" onClick={() => setConfirm(true)}>
                <Trash2 size={14} /> REMOVE
              </button>
            )
          ) : (
            <button className="btn btn-sm btn-primary" disabled={!available} onClick={() => void modules.install(engine.id)}>
              <Download size={14} /> INSTALL
            </button>
          )}
        </div>
      </div>

      {prog && (
        <div className="border-t border-chalk/20 bg-subtle px-4 py-2">
          <div className="h-2.5 overflow-hidden rounded-full border border-chalk/40 bg-surface">
            <div className="h-full bg-crimson transition-[width] duration-200" style={{ width: `${Math.max(3, prog.percent)}%` }} />
          </div>
        </div>
      )}
      {err && <p className="border-t border-chalk/20 px-4 py-2 text-xs text-crimson">{err}</p>}
    </li>
  );
}

export function ModuleManagerModal({ open, onClose, modules, onGetDesktop }: Props) {
  const [tab, setTab] = useState<'all' | EngineCategory>('all');
  const list = ENGINES.filter((e) => tab === 'all' || e.category === tab);
  const totalBytes = Object.values(modules.status).reduce((a, s) => a + (s?.sizeBytes ?? 0), 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Manage Engines"
      icon={<Puzzle size={16} />}
      width="max-w-2xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-sketch">
          <span className="flex items-center gap-1.5">
            <HardDrive size={14} /> {modules.desktop ? `${formatBytes(totalBytes)} installed` : `Core installer ~${CORE_INSTALLER_MB} MB`}
          </span>
          {modules.desktop && modules.enginesDir && (
            <button className="btn btn-sm" onClick={() => void native.openFolder(modules.enginesDir)}>
              <FolderOpen size={14} /> FOLDER
            </button>
          )}
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist">
        {CATEGORY_TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`btn btn-sm ${tab === t.id ? 'btn-primary' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <ul className="space-y-3">
        {list.map((e) => (
          <EngineCard key={e.id} engine={e} modules={modules} onGetDesktop={onGetDesktop} />
        ))}
      </ul>
    </Modal>
  );
}
