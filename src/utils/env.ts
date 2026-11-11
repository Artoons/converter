/** True when running inside the Tauri v2 desktop shell. */
export const isDesktopApp = (): boolean => Boolean(window.__TAURI_INTERNALS__);

export const APP_VERSION = 'v1.0.0-open-source';

/** Hard per-file limit for the browser sandbox. */
export const WEB_MAX_FILE_BYTES = 50 * 1024 * 1024;

const env = import.meta.env;
const releaseUrl = (env.VITE_GITHUB_RELEASE_URL ?? '').replace(/\/+$/, '');

export const config = {
  adsenseClient: env.VITE_ADSENSE_CLIENT_ID ?? '',
  adsenseSlotLeft: env.VITE_ADSENSE_SLOT_LEFT ?? '',
  adsenseSlotRight: env.VITE_ADSENSE_SLOT_RIGHT ?? '',
  tipUrl: env.VITE_TIP_URL ?? '',
  releaseUrl,
  repoUrl:
    env.VITE_GITHUB_REPO_URL ||
    (releaseUrl ? releaseUrl.replace(/\/releases(\/.*)?$/, '') : 'https://github.com/'),
  checksumsUrl:
    env.VITE_CHECKSUMS_URL || (releaseUrl ? `${releaseUrl}/download/checksums-sha256.txt` : ''),
};

/** Placeholder publisher IDs from .env.example are treated as "not configured". */
export const adsConfigured = (slot: string): boolean =>
  Boolean(config.adsenseClient && slot && !/^ca-pub-0+$/.test(config.adsenseClient) && !/^0+$/.test(slot));
