import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Modal } from './Modal';
import { PackPicker } from './PackPicker';
import type { ModulesApi } from '../hooks/useModules';
import type { ModuleId } from '../core/routes';
import { engineById } from '../modules/registry';

interface Props {
  open: boolean;
  onClose: () => void;
  modules: ModulesApi;
}

/** Desktop first-launch wizard: pick which conversion packs to download. */
export function FirstRunModal({ open, onClose, modules }: Props) {
  const [selected, setSelected] = useState<Set<ModuleId>>(new Set());
  const [busy, setBusy] = useState<ModuleId | null>(null);
  const [failed, setFailed] = useState<string[]>([]);

  const installSelected = async () => {
    const fails: string[] = [];
    for (const id of selected) {
      if (modules.installed.has(id)) continue;
      setBusy(id);
      const ok = await modules.install(id);
      if (!ok) fails.push(engineById(id)?.name ?? id);
    }
    setBusy(null);
    setFailed(fails);
    if (!fails.length) onClose();
  };

  const prog = busy ? modules.progress[busy] : undefined;

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title="Welcome! What will you convert?" icon={<Sparkles size={16} />}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {busy && (
            <span className="mr-auto flex items-center gap-2 text-sm font-semibold">
              <Loader2 size={14} className="animate-spin" /> {engineById(busy)?.shortName}: {prog?.stage ?? 'starting'} {Math.round(prog?.percent ?? 0)}%
            </span>
          )}
          <button className="btn" disabled={Boolean(busy)} onClick={onClose}>
            Skip for now
          </button>
          <button className="btn btn-primary" disabled={Boolean(busy)} onClick={() => void installSelected()}>
            {selected.size ? 'Install selected packs' : 'Continue with Images & Data'}
          </button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-muted">
        The core app stays tiny. Pick only the packs you need — you can add or remove them anytime from <b>Modules → Manage Engines</b>.
      </p>
      <PackPicker
        platformKey={modules.platform}
        selected={selected}
        onChange={setSelected}
        installed={modules.installed}
        baseMb={0}
        baseLabel="already installed"
        disabled={Boolean(busy)}
      />
      {failed.length > 0 && (
        <p className="mt-3 rounded-lg border-2 border-tomato bg-tomato/10 p-2 text-xs text-tomato">
          Could not install: {failed.join(', ')}. See details in Modules → Manage Engines.
        </p>
      )}
    </Modal>
  );
}
