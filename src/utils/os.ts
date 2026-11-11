import { config } from './env';

export type OSKind = 'windows' | 'macos' | 'linux' | 'unknown';

export interface InstallerAsset {
  os: Exclude<OSKind, 'unknown'>;
  label: string;
  detail: string;
  /** Stable asset name uploaded by .github/workflows/release.yml */
  file: string;
  primary?: boolean;
}

export const INSTALLERS: InstallerAsset[] = [
  { os: 'windows', label: 'Windows 64-bit', detail: 'Installer (.exe)', file: 'ARTOONS-Converter-windows-x64-setup.exe', primary: true },
  { os: 'windows', label: 'Windows 64-bit', detail: 'MSI package (.msi)', file: 'ARTOONS-Converter-windows-x64.msi' },
  { os: 'macos', label: 'macOS', detail: 'Universal disk image (.dmg)', file: 'ARTOONS-Converter-macos-universal.dmg', primary: true },
  { os: 'linux', label: 'Linux x86_64', detail: 'Portable (.AppImage)', file: 'ARTOONS-Converter-linux-x86_64.AppImage', primary: true },
];

export function detectOS(): OSKind {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const p = (nav.userAgentData?.platform || navigator.platform || navigator.userAgent || '').toLowerCase();
  if (p.includes('win')) return 'windows';
  if (p.includes('mac') || p.includes('darwin')) return 'macos';
  if (p.includes('linux') || p.includes('x11')) return 'linux';
  return 'unknown';
}

/** Maps a browser OS to the engine-manifest platform key (x86_64 assumed for display purposes). */
export function osToPlatformKey(os: OSKind): string {
  switch (os) {
    case 'windows':
      return 'windows-x86_64';
    case 'macos':
      return 'macos-aarch64';
    case 'linux':
      return 'linux-x86_64';
    default:
      return 'windows-x86_64';
  }
}

export function installerUrl(file: string): string {
  return config.releaseUrl ? `${config.releaseUrl}/download/${file}` : '';
}

export const OS_LABEL: Record<OSKind, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  unknown: 'your OS',
};
