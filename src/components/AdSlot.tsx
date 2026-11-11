import { useEffect, useRef, useState } from 'react';
import { adsConfigured, config, isDesktopApp } from '../utils/env';

let adsensePromise: Promise<void> | null = null;

function loadAdSense(client: string): Promise<void> {
  if (isDesktopApp()) return Promise.reject(new Error('Ads are disabled in the desktop app'));
  if (adsensePromise) return adsensePromise;
  adsensePromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve();
    s.onerror = () => {
      adsensePromise = null;
      reject(new Error('AdSense blocked or unavailable'));
    };
    document.head.appendChild(s);
  });
  return adsensePromise;
}

/**
 * Subtle, sincere fallback shown inside the ad rail when an adblocker is active.
 */
function HouseCard() {
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center px-4 py-6 text-center">
      <p className="text-[11px] leading-relaxed text-sketch/80">
        Quiet sidebar ads help fund this project and keep it 100% free. There are never any pop-ups, redirects, or intrusive banners here — if you’d like to support the site, please consider whitelisting it in your adblocker.
      </p>
    </div>
  );
}

/**
 * Strictly separated advertising rail inside a bordered <aside> with persistent
 * "ADVERTISEMENT" top label. Never mounted in the Tauri desktop app.
 */
export function AdSlot({ position }: { position: 'left' | 'right' }) {
  const slot = position === 'left' ? config.adsenseSlotLeft : config.adsenseSlotRight;
  const enabled = !isDesktopApp() && !import.meta.env.DEV && adsConfigured(slot);
  const [fallback, setFallback] = useState(!enabled);
  const insRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    loadAdSense(config.adsenseClient)
      .then(() => {
        if (!alive || pushed.current) return;
        pushed.current = true;
        try {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch {
          setFallback(true);
        }
      })
      .catch(() => alive && setFallback(true));
    const t = window.setTimeout(() => {
      const el = insRef.current;
      if (alive && (!el || el.getAttribute('data-ad-status') === 'unfilled' || el.offsetHeight < 10)) setFallback(true);
    }, 5000);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [enabled]);

  if (isDesktopApp()) return null;

  return (
    <aside aria-label="Advertisement" className="hidden lg:block">
      <div className="chalk-card sticky top-4 overflow-hidden">
        <div className="border-b border-chalk/20 bg-subtle px-2 py-1 text-center font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-sketch">
          ADVERTISEMENT
        </div>
        <div className="min-h-[480px] p-2">
          {fallback ? (
            <HouseCard />
          ) : (
            <ins
              ref={insRef}
              className="adsbygoogle"
              style={{ display: 'block', minHeight: 480 }}
              data-ad-client={config.adsenseClient}
              data-ad-slot={slot}
              data-ad-format="vertical"
              data-full-width-responsive="false"
            />
          )}
        </div>
      </div>
    </aside>
  );
}
