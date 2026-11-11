import { useEffect, useRef, useState, type ReactNode } from 'react';

export type MenuEntry =
  | {
      type?: 'item';
      label: string;
      onSelect: () => void;
      shortcut?: string;
      icon?: ReactNode;
      badge?: ReactNode;
      disabled?: boolean;
    }
  | { type: 'separator' };

export interface MenuDef {
  label: string;
  items: MenuEntry[];
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex select-none items-center gap-2 pr-3">
      <span className="font-display text-2xl font-bold tracking-wide text-chalk">
        artoons.net
      </span>
      {!compact && <span className="micro hidden md:inline-block">converter</span>}
    </div>
  );
}

export function MenuBar({ menus, right }: { menus: MenuDef[]; right?: ReactNode }) {
  const [open, setOpen] = useState<number | null>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (open === null) return;
    const onDown = (e: MouseEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') setOpen((o) => (o === null ? o : (o + 1) % menus.length));
      if (e.key === 'ArrowLeft') setOpen((o) => (o === null ? o : (o - 1 + menus.length) % menus.length));
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, menus.length]);

  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-2 border-b border-chalk/25 bg-surface px-3 sm:px-6">
      <Logo />
      {menus.length > 0 && (
        <nav ref={navRef} className="ml-2 flex items-center gap-1" role="menubar" aria-label="Application menu">
          {menus.map((m, i) => (
            <div key={m.label} className="relative">
              <button
                role="menuitem"
                aria-haspopup="true"
                aria-expanded={open === i}
                className={`rounded-md px-2.5 py-1 text-sm font-semibold transition-colors ${
                  open === i
                    ? 'bg-subtle text-chalk underline decoration-crimson decoration-2 underline-offset-4'
                    : 'text-chalk/85 hover:bg-subtle hover:text-chalk'
                }`}
                onClick={() => setOpen(open === i ? null : i)}
                onMouseEnter={() => open !== null && setOpen(i)}
              >
                {m.label}
              </button>
              {open === i && (
                <div role="menu" className="panel absolute left-0 top-full mt-1.5 min-w-[240px] p-1.5">
                  {m.items.map((it, j) =>
                    it.type === 'separator' ? (
                      <div key={j} className="mx-2 my-1 border-t border-chalk/20" />
                    ) : (
                      <button
                        key={j}
                        role="menuitem"
                        disabled={it.disabled}
                        onClick={() => {
                          setOpen(null);
                          it.onSelect();
                        }}
                        className="group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm font-medium text-chalk hover:bg-crimson hover:text-white disabled:pointer-events-none disabled:opacity-40"
                      >
                        <span className="grid w-4 place-items-center text-sketch group-hover:text-white">{it.icon}</span>
                        <span className="flex-1">{it.label}</span>
                        {it.badge}
                        {it.shortcut && <span className="kbd group-hover:border-white/50 group-hover:bg-transparent group-hover:text-white">{it.shortcut}</span>}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>
          ))}
        </nav>
      )}
      <div className="ml-auto flex items-center gap-2.5">{right}</div>
    </header>
  );
}
