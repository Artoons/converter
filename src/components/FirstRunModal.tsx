import { useState } from 'react';
import { Loader2, Puzzle } from 'lucide-react';
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

/**
 * Desktop first-launch wizard: pops up automatically the first time the app opens,
 * and can be reopened anytime from the top bar "Engines" button or Modules menu.
 */
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
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Choose Conversion Packs to Install"
      icon={<Puzzle size={16} />}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {busy && (
            <span className="mr-auto flex items-center gap-2 text-xs font-semibold text-chalk">
              <Loader2 size={14} className="animate-spin" /> {engineById(busy)?.shortName}: {prog?.stage ?? 'starting'} {Math.round(prog?.percent ?? 0)}%
            </span>
          )}
          <button className="btn btn-sm" disabled={Boolean(busy)} onClick={onClose}>
            Skip for Now
          </button>
          <button className="btn btn-sm btn-primary" disabled={Boolean(busy)} onClick={() => void installSelected()}>
            {selected.size ? 'Install Selected Packs' : 'Continue with Core Engine'}
          </button>
        </div>
      }
    >
      <p className="mb-4 text-xs leading-relaxed text-sketch">
        Select the conversion packs you want to download now. You can install or remove packs anytime from the <b className="text-chalk">Engines</b> button in the top bar or <b className="text-chalk">Modules → Manage Engines</b>.
      </p>
      <PackPicker
        platformKey={modules.platform}
        selected={selected}
        onChange={setSelected}
        installed={modules.installed}
        baseMb={0}
        baseLabel="Already Included"
        disabled={Boolean(busy)}
      />
      {failed.length > 0 && (
        <p className="mt-3 rounded-md border border-crimson bg-crimson/10 p-2 text-xs text-crimson">
          Could not install: {failed.join(', ')}. You can retry anytime in Modules → Manage Engines.
        </p>
      )}
    </Modal>
  );
}
