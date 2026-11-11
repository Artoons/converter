/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADSENSE_CLIENT_ID?: string;
  readonly VITE_ADSENSE_SLOT_LEFT?: string;
  readonly VITE_ADSENSE_SLOT_RIGHT?: string;
  readonly VITE_TIP_URL?: string;
  readonly VITE_GITHUB_RELEASE_URL?: string;
  readonly VITE_GITHUB_REPO_URL?: string;
  readonly VITE_CHECKSUMS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __TAURI_INTERNALS__?: unknown;
  adsbygoogle?: unknown[];
  webkitAudioContext?: typeof AudioContext;
}
