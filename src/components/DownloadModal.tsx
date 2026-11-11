import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  Check,
  Copy,
  Download,
  ExternalLink,
  Heart,
  Infinity as InfinityIcon,
  Lock,
  Monitor,
  Puzzle,
  ShieldAlert,
  ShieldCheck,
  WifiOff,
  Zap,
} from 'lucide-react';
import { Modal } from './Modal';
import { PackPicker } from './PackPicker';
import { CORE_INSTALLER_MB } from '../modules/registry';
import type { ModuleId } from '../core/routes';
import { config } from '../utils/env';
import { INSTALLERS, OS_LABEL, detectOS, installerUrl, osToPlatformKey, type InstallerAsset } from '../utils/os';
import { triggerDownload } from '../utils/format';

interface Props {
  open: boolean;
  onClose: () => void;
  onVerify: () => void;
}

const FEATURES = [
  { icon: InfinityIcon, title: 'Unlimited file sizes' },
  { icon: WifiOff, title: '100% offline privacy' },
  { icon: Zap, title: 'Hardware-accelerated' },
  { icon: Ban, title: 'Zero ads' },
  { icon: Puzzle, title: `~${CORE_INSTALLER_MB} MB modular core` },
  { icon: Lock, title: 'Open source (MIT)' },
];

const TIP_PRESETS = [2, 5, 10];

function buildTipUrl(amount: number | null): string {
  if (!config.tipUrl) return '';
  return config.tipUrl.includes('{amount}') ? config.tipUrl.replace('{amount}', String(amount ?? '')) : config.tipUrl;
}

function useChecksums(enabled: boolean) {
  const [sums, setSums] = useState<Record<string, string> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled || !config.checksumsUrl || sums) return;
    let alive = true;
    fetch(config.checksumsUrl)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => {
        if (!alive) return;
        const map: Record<string, string> = {};
        for (const line of text.split(/\r?\n/)) {
          const m = /^([a-f0-9]{64})\s+\*?(.+)$/i.exec(line.trim());
          if (m) map[m[2].trim()] = m[1].toLowerCase();
        }
        setSums(map);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [enabled, sums]);
  return { sums, failed };
}

export function DownloadModal({ open, onClose, onVerify }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [tip, setTip] = useState<number | null>(5);
  const [custom, setCustom] = useState('');
  const [packs, setPacks] = useState<Set<ModuleId>>(new Set());
  const [copied, setCopied] = useState(false);
  const os = useMemo(detectOS, []);
  const [chosen, setChosen] = useState<InstallerAsset>(() => INSTALLERS.find((i) => i.os === os && i.primary) ?? INSTALLERS[0]);
  const autoStarted = useRef(false);
  const { sums, failed } = useChecksums(open && step === 2);

  useEffect(() => {
    if (!open) {
      setStep(1);
      autoStarted.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (step !== 2 || autoStarted.current || os === 'unknown') return;
    const url = installerUrl(chosen.file);
    if (!url) return;
    autoStarted.current = true;
    const t = setTimeout(() => triggerDownload(url), 600);
    return () => clearTimeout(t);
  }, [step, os, chosen.file]);

  const tipAmount = tip ?? (Number(custom) > 0 ? Number(custom) : null);
  const tipUrl = buildTipUrl(tipAmount);
  const hash = sums?.[chosen.file];

  const copyHash = async () => {
    if (!hash) return;
    await navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Modal open={open} onClose={onClose} title={step === 1 ? 'Download ARTOONS Converter for Desktop (100% Free & Open Source)' : 'Download Installer'} icon={<Monitor size={16} />} width="max-w-2xl">
      {step === 1 ? (
        <div className="space-y-5">
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title }) => (
              <li key={title} className="flex items-center gap-2 rounded-md border border-chalk/25 bg-subtle p-2.5">
                <Icon size={16} className="shrink-0 text-crimson" />
                <span className="text-xs font-semibold text-chalk">{title}</span>
              </li>
            ))}
          </ul>

          <div className="chalk-card space-y-3 p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-chalk">
              <Heart size={15} className="text-crimson" /> Optional Tip
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {TIP_PRESETS.map((a) => (
                <button key={a} className={`btn btn-sm ${tip === a ? 'btn-primary' : ''}`} onClick={() => setTip(a)}>
                  ${a}
                </button>
              ))}
              <div className="flex items-center rounded-md border border-chalk/40 bg-subtle pl-2">
                <span className="text-sm text-sketch">$</span>
                <input
                  type="number"
                  min={1}
                  inputMode="decimal"
                  placeholder="Custom"
                  className="w-20 bg-transparent px-1 py-1 text-sm text-chalk focus:outline-none"
                  value={custom}
                  onFocus={() => setTip(null)}
                  onChange={(e) => setCustom(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center">
              <button
                className="btn btn-primary"
                disabled={!tipUrl || !tipAmount}
                onClick={() => {
                  window.open(tipUrl, '_blank', 'noopener,noreferrer');
                  setStep(2);
                }}
              >
                <Heart size={15} /> TIP {tipAmount ? `$${tipAmount}` : ''}
              </button>
              <button className="btn btn-ghost text-sm underline underline-offset-4" onClick={() => setStep(2)}>
                No thanks, just take me to the download
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="micro">Detected OS: {OS_LABEL[os]}</span>
            <button className="btn btn-sm btn-ghost" onClick={() => setStep(1)}>
              <ArrowLeft size={14} /> BACK
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {INSTALLERS.map((inst) => {
              const url = installerUrl(inst.file);
              const recommended = inst.os === os && inst.primary;
              return (
                <a
                  key={inst.file}
                  href={url || undefined}
                  onClick={() => setChosen(inst)}
                  className={`btn justify-start !py-2 ${recommended ? 'btn-primary' : ''} ${url ? '' : 'pointer-events-none opacity-45'}`}
                >
                  <Download size={15} />
                  <span className="flex-1 text-left leading-tight">
                    {inst.label}
                    <span className="block text-[11px] font-normal opacity-80">{inst.detail}</span>
                  </span>
                </a>
              );
            })}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-sketch">Choose Conversion Packs</p>
            <PackPicker platformKey={osToPlatformKey(os)} selected={packs} onChange={setPacks} baseMb={CORE_INSTALLER_MB} baseLabel="Core App" />
          </div>

          <div className="rounded-md border border-chalk/25 bg-subtle p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-sketch">
                <ShieldCheck size={14} /> SHA-256 · {chosen.file}
              </span>
              <button className="text-xs font-semibold underline" onClick={onVerify}>
                Verify file →
              </button>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded border border-chalk/25 bg-surface px-2 py-1 font-mono text-[11px] text-chalk">
                {hash ?? (failed || !config.checksumsUrl ? 'checksums-sha256.txt' : '…')}
              </code>
              {hash ? (
                <button className="btn btn-sm" onClick={() => void copyHash()}>
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                </button>
              ) : (
                config.checksumsUrl && (
                  <a className="btn btn-sm" href={config.checksumsUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={13} />
                  </a>
                )
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-md border border-dashed border-chalk/25 p-3 text-xs text-sketch">
            <ShieldAlert size={16} className="shrink-0 text-chalk" />
            <span>Windows SmartScreen may appear on new indie builds before signature propagation — verify SHA-256 above.</span>
          </div>
        </div>
      )}
    </Modal>
  );
}
