import { HelpCircle } from 'lucide-react';
import { Modal } from './Modal';
import { CORE_INSTALLER_MB } from '../modules/registry';

const STEPS = [
  ['Drop files', 'Drag files onto the dropzone or press Ctrl+O. The type is detected from magic bytes, not just the extension.'],
  ['Pick a target', 'Choose a format per file, or use “Convert all to…” for the whole batch. Defaults live in Edit → Default Target Format.'],
  ['Convert locally', 'Images use the Canvas API; data & text use built-in parsers. Nothing is uploaded — everything runs on your device.'],
  ['Go native when needed', `Video, audio, DOCX/PDF and TIFF need native engines. The desktop app (~${CORE_INSTALLER_MB} MB) installs only the packs you choose.`],
];

export function HowItWorksModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="How it works" icon={<HelpCircle size={16} />} width="max-w-xl">
      <ol className="space-y-3">
        {STEPS.map(([title, text], i) => (
          <li key={title} className="flex gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border-2 border-line bg-sun font-black text-[#111] shadow-hard-sm">{i + 1}</span>
            <div>
              <p className="font-bold">{title}</p>
              <p className="text-sm text-muted">{text}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-5 rounded-lg border-2 border-dashed border-line/40 p-3 text-xs text-muted">
        <b className="text-ink">Web vs Desktop.</b> The web version caps files at 50 MB and runs in the browser sandbox. The desktop app has no limits, no ads, and
        runs fully offline once your engines are installed.
      </div>
    </Modal>
  );
}
