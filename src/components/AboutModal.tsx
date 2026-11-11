import { Info } from 'lucide-react';
import { Modal } from './Modal';
import { APP_VERSION } from '../utils/env';
import type { ModulesApi } from '../hooks/useModules';
import { ENGINES } from '../modules/registry';

const LICENSES = [
  ['ARTOONS Converter', 'MIT'],
  ['Tauri', 'MIT / Apache-2.0'],
  ['React', 'MIT'],
  ['Tailwind CSS', 'MIT'],
  ['marked', 'MIT'],
  ['yaml', 'ISC'],
  ['lucide-react', 'ISC'],
  ['Space Grotesk / JetBrains Mono', 'OFL-1.1'],
  ['FFmpeg (optional engine)', 'LGPL-2.1+ / GPL-3.0'],
  ['Pandoc (optional engine)', 'GPL-2.0+'],
  ['Typst (optional engine)', 'Apache-2.0'],
  ['ImageMagick (optional engine)', 'ImageMagick License'],
];

export function AboutModal({ open, onClose, modules }: { open: boolean; onClose: () => void; modules: ModulesApi }) {
  const { desktop } = modules;
  return (
    <Modal open={open} onClose={onClose} title="About ARTOONS Converter" icon={<Info size={16} />} width="max-w-xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip bg-sun text-[#111]">{APP_VERSION}</span>
          <span className={`chip ${desktop ? 'bg-grape text-white' : 'bg-sky text-white'}`}>{desktop ? 'Tauri Desktop' : 'Web Browser'}</span>
          {modules.platform && <span className="chip">{modules.platform}</span>}
        </div>
        <p className="text-sm text-muted">
          A playful, technical, local-first universal file converter. One React + TypeScript codebase, two targets: the web sandbox and a native Tauri v2 desktop
          app with modular engines.
        </p>

        <section>
          <p className="micro mb-2">Engines</p>
          <table className="w-full text-sm">
            <tbody>
              {ENGINES.map((e) => {
                const st = modules.status[e.id];
                const state = e.builtin ? `built-in ${e.version}` : !desktop ? 'desktop only' : st?.installed ? `installed ${st.version ?? ''}` : 'not installed';
                return (
                  <tr key={e.id} className="border-b border-dashed border-line/25 last:border-0">
                    <td className="py-1.5 pr-2 font-semibold">{e.name}</td>
                    <td className="py-1.5 text-right font-mono text-xs text-muted">{state}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section>
          <p className="micro mb-2">Open-source licenses</p>
          <ul className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
            {LICENSES.map(([name, lic]) => (
              <li key={name} className="flex justify-between gap-2">
                <span>{name}</span>
                <span className="font-mono text-muted">{lic}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted">
            Optional engines are downloaded separately from their official distributions and executed as independent programs; their licenses apply to those
            binaries.
          </p>
        </section>
      </div>
    </Modal>
  );
}
