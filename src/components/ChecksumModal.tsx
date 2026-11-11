import { useState, type DragEvent } from 'react';
import { CheckCircle2, ExternalLink, FileSearch, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { Modal } from './Modal';
import { config } from '../utils/env';
import { errorMessage, formatBytes, sha256Hex } from '../utils/format';
import { native } from '../lib/native';

/** Compute a SHA-256 locally and compare it with the published checksum. */
export function ChecksumModal({ open, onClose, desktop }: { open: boolean; onClose: () => void; desktop: boolean }) {
  const [file, setFile] = useState<{ name: string; size?: number } | null>(null);
  const [hash, setHash] = useState('');
  const [expected, setExpected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const hashWebFile = async (f: File) => {
    setFile({ name: f.name, size: f.size });
    setBusy(true);
    setError('');
    setHash('');
    try {
      setHash(await sha256Hex(await f.arrayBuffer()));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const pick = async () => {
    if (desktop) {
      const [path] = await native.pickFiles();
      if (!path) return;
      setFile({ name: path });
      setBusy(true);
      setError('');
      setHash('');
      try {
        setHash(await native.sha256File(path));
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(false);
      }
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.onchange = () => input.files?.[0] && void hashWebFile(input.files[0]);
      input.click();
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && !desktop) void hashWebFile(f);
  };

  const exp = expected.trim().toLowerCase();
  const verdict = hash && exp ? (hash === exp ? 'match' : 'mismatch') : null;

  return (
    <Modal open={open} onClose={onClose} title="Verify checksums (SHA-256)" icon={<ShieldCheck size={16} />} width="max-w-xl">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Compare your downloaded installer against <code className="font-mono">checksums-sha256.txt</code> from the GitHub release. Hashing happens entirely on
          your device.
        </p>
        {config.checksumsUrl && (
          <a className="btn btn-sm" href={config.checksumsUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> Open published checksums
          </a>
        )}
        <div
          role="button"
          tabIndex={0}
          onClick={() => void pick()}
          onKeyDown={(e) => e.key === 'Enter' && void pick()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-line/50 p-4 hover:border-line hover:bg-ink/5"
        >
          {busy ? <Loader2 className="animate-spin" /> : <FileSearch />}
          <div className="min-w-0">
            <p className="truncate font-bold">{file ? file.name : 'Choose or drop a file to hash'}</p>
            {file?.size !== undefined && <p className="text-xs text-muted">{formatBytes(file.size)}</p>}
          </div>
        </div>
        {hash && (
          <div>
            <p className="micro mb-1">Computed SHA-256</p>
            <code className="block break-all rounded-md border-2 border-line bg-ink/5 p-2 font-mono text-[11px]">{hash}</code>
          </div>
        )}
        {error && <p className="text-sm text-tomato">{error}</p>}
        <label className="block">
          <span className="micro mb-1 block">Expected SHA-256</span>
          <input className="input w-full font-mono text-xs" placeholder="Paste the published hash" value={expected} onChange={(e) => setExpected(e.target.value)} />
        </label>
        {verdict === 'match' && (
          <p className="flex items-center gap-2 rounded-lg border-2 border-line bg-mint/30 p-2 text-sm font-bold">
            <CheckCircle2 size={18} /> Checksums match — the file is authentic.
          </p>
        )}
        {verdict === 'mismatch' && (
          <p className="flex items-center gap-2 rounded-lg border-2 border-tomato bg-tomato/10 p-2 text-sm font-bold text-tomato">
            <XCircle size={18} /> Mismatch — do not run this file. Re-download from the official release.
          </p>
        )}
      </div>
    </Modal>
  );
}
