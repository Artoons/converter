import { Check, Package } from 'lucide-react';
import type { ModuleId } from '../core/routes';
import { ENGINES, PACK_PRESETS, availableOn } from '../modules/registry';

interface Props {
  platformKey: string;
  selected: Set<ModuleId>;
  onChange: (next: Set<ModuleId>) => void;
  installed?: Set<string>;
  baseMb: number;
  baseLabel: string;
  disabled?: boolean;
}

export function PackPicker({ platformKey, selected, onChange, installed, baseMb, baseLabel, disabled }: Props) {
  const optional = ENGINES.filter((e) => !e.builtin);
  const core = ENGINES.find((e) => e.builtin);
  const isInstalled = (id: string) => Boolean(installed?.has(id));
  const total = baseMb + optional.filter((e) => selected.has(e.id) && !isInstalled(e.id)).reduce((a, e) => a + e.approxDownloadMb, 0);

  const toggle = (id: ModuleId) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    onChange(n);
  };

  const applyPreset = (mods: ModuleId[]) =>
    onChange(new Set(mods.filter((m) => availableOn(ENGINES.find((e) => e.id === m)!, platformKey))));

  const presetMb = (mods: ModuleId[]) =>
    baseMb +
    mods
      .map((m) => ENGINES.find((e) => e.id === m)!)
      .filter((e) => availableOn(e, platformKey) && !isInstalled(e.id))
      .reduce((a, e) => a + e.approxDownloadMb, 0);

  const sameSet = (mods: ModuleId[]) => {
    const avail = mods.filter((m) => availableOn(ENGINES.find((e) => e.id === m)!, platformKey));
    return avail.length === selected.size && avail.every((m) => selected.has(m));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {PACK_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={disabled}
            onClick={() => applyPreset(p.modules)}
            className={`btn btn-sm ${sameSet(p.modules) ? 'btn-primary' : ''}`}
          >
            {p.label}
            <span className="text-xs opacity-75">{presetMb(p.modules)} MB</span>
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {core && (
          <li className="flex items-center gap-3 rounded-md border border-chalk/25 bg-subtle p-2.5">
            <span className="grid h-6 w-6 place-items-center rounded border border-chalk/50 bg-surface text-chalk">
              <Check size={14} strokeWidth={3} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-chalk">
                {core.shortName} <span className="font-normal text-sketch">· {baseLabel}</span>
              </p>
              <p className="truncate text-xs text-sketch">{core.unlocks.join(' · ')}</p>
            </div>
            <span className="chip">{baseMb ? `${baseMb} MB` : 'Built-in'}</span>
          </li>
        )}
        {optional.map((e) => {
          const avail = availableOn(e, platformKey);
          const inst = isInstalled(e.id);
          const on = inst || selected.has(e.id);
          return (
            <li key={e.id}>
              <label
                className={`flex items-center gap-3 rounded-md border p-2.5 transition-colors ${
                  !avail || inst || disabled ? 'cursor-default opacity-65' : 'cursor-pointer hover:border-chalk/60'
                } ${on ? 'border-crimson bg-subtle' : 'border-chalk/25'}`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={on}
                  disabled={!avail || inst || disabled}
                  onChange={() => toggle(e.id)}
                />
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded border ${
                    on ? 'border-crimson bg-crimson text-white' : 'border-chalk/40 bg-surface'
                  }`}
                >
                  {on && <Check size={14} strokeWidth={3} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-chalk">{e.shortName}</p>
                  <p className="truncate text-xs text-sketch">{e.unlocks.join(' · ')}</p>
                </div>
                <span className="chip">
                  {inst ? 'Installed' : avail ? `+${e.approxDownloadMb} MB` : 'N/A'}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between rounded-md border border-chalk/35 bg-subtle px-3 py-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-chalk">
          <Package size={15} /> Total Size
        </span>
        <span className="font-mono text-sm font-bold text-chalk">~{total} MB</span>
      </div>
    </div>
  );
}
