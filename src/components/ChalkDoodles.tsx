/**
 * Living Dark Sketchbook / Kinetic Chalkboard SVG doodles & mascots (`artoons.net`).
 * All background margin doodles are non-interactive (`pointer-events-none`) in #333333 / #6E6E6E
 * at 0.08–0.15 opacity and animate in stepped frames (`steps(4)`).
 */

export function BackgroundDoodles() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none" aria-hidden="true">
      {/* Left margin spiral */}
      <svg
        viewBox="0 0 100 100"
        className="doodle-spin absolute left-4 top-28 h-20 w-20 text-[#6E6E6E] opacity-[0.14]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      >
        <path d="M50 50 m0 -3 a3 3 0 1 1 0 6 a7 7 0 1 1 0 -14 a13 13 0 1 1 0 26 a20 20 0 1 1 0 -40 a28 28 0 1 1 0 56" />
      </svg>

      {/* Right margin spiral */}
      <svg
        viewBox="0 0 100 100"
        className="doodle-spin absolute right-6 top-1/2 h-24 w-24 text-[#6E6E6E] opacity-[0.13]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      >
        <path d="M50 50 m0 -4 a4 4 0 1 0 0 8 a9 9 0 1 0 0 -18 a16 16 0 1 0 0 32 a24 24 0 1 0 0 -48 a33 33 0 1 0 0 66" />
      </svg>

      {/* Bottom-left spiral + stars */}
      <svg
        viewBox="0 0 120 120"
        className="doodle-pulse absolute bottom-10 left-6 h-24 w-24 text-[#6E6E6E] opacity-[0.13]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M25 30 L30 15 L35 30 L20 20 L40 20 Z" />
        <path d="M75 80 m0 -5 a5 5 0 1 1 0 10 a11 11 0 1 1 0 -22 a18 18 0 1 1 0 36" />
        <path d="M15 85 L35 70 M18 92 L40 76 M22 99 L44 82" />
      </svg>

      {/* Bottom-right stars & crosshatch */}
      <svg
        viewBox="0 0 120 120"
        className="doodle-pulse absolute bottom-12 right-8 h-24 w-24 text-[#6E6E6E] opacity-[0.13]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M70 25 L75 10 L80 25 L65 15 L85 15 Z" />
        <path d="M30 65 L34 53 L38 65 L26 57 L42 57 Z" />
        <path d="M60 85 m0 -4 a4 4 0 1 1 0 8 a10 10 0 1 1 0 -20 a17 17 0 1 1 0 34" />
      </svg>

      {/* Top center stars */}
      <svg
        viewBox="0 0 140 50"
        className="doodle-pulse absolute left-1/3 top-14 h-12 w-36 text-[#6E6E6E] opacity-[0.12]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <path d="M20 30 L24 18 L28 30 L16 22 L32 22 Z" />
        <path d="M105 22 L108 12 L111 22 L101 15 L115 15 Z" />
      </svg>
    </div>
  );
}

/** Little red chalk imp mascot in the top bar (inspired by the artoons.net header). */
export function ImpMascot({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={`${className} doodle-pulse select-none`}
      fill="none"
      stroke="#6E6E6E"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Horns */}
      <path d="M18 18 C12 10, 14 6, 22 14" />
      <path d="M46 18 C52 10, 50 6, 42 14" />
      {/* Head */}
      <ellipse cx="32" cy="27" rx="17" ry="14" />
      {/* Big mismatched toon eyes */}
      <circle cx="25" cy="25" r="5" />
      <circle cx="25" cy="25" r="1.6" fill="#EAEAEA" />
      <circle cx="39" cy="24" r="6.2" />
      <circle cx="39" cy="24" r="2" fill="#EAEAEA" />
      {/* Grin */}
      <path d="M22 34 Q32 40 42 33" />
      {/* Body & stick legs */}
      <path d="M26 41 L24 53 L39 53 L38 41" />
      <path d="M27 53 L26 60 M23 60 L29 60" />
      <path d="M36 53 L37 60 M34 60 L40 60" />
      <path d="M24 44 L15 40 M39 44 L48 40" />
    </svg>
  );
}

/** Functional hand-drawn red arrow — ONLY used to point at the primary CTA. */
export function FocalRedArrow({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 110 85"
      className={`self-draw pointer-events-none select-none ${className}`}
      fill="none"
      stroke="#E63946"
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ filter: 'url(#chalk-boil)' }}
      aria-hidden="true"
    >
      <path d="M12 74 C 48 68, 72 48, 78 12" />
      <path d="M65 23 L78 10 L88 26" />
    </svg>
  );
}

/** Sketchy chalk illustrations for the 4 category cards. */
export function CategorySketch({ kind }: { kind: 'image' | 'media' | 'document' | 'data' }) {
  if (kind === 'image') {
    return (
      <svg viewBox="0 0 80 56" className="h-12 w-16 text-[#6E6E6E]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* Goofy toon face like "sketches" card */}
        <ellipse cx="40" cy="30" rx="22" ry="18" />
        <circle cx="32" cy="27" r="4.5" />
        <circle cx="32" cy="27" r="1.5" fill="currentColor" />
        <circle cx="48" cy="26" r="5.5" />
        <circle cx="48" cy="26" r="1.8" fill="currentColor" />
        <path d="M32 39 Q40 44 49 38" />
        <path d="M30 12 L35 6 L38 12 L43 6 L47 12" />
      </svg>
    );
  }
  if (kind === 'media') {
    return (
      <svg viewBox="0 0 80 56" className="h-12 w-16 text-[#6E6E6E]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* Film clapper + sound waves */}
        <rect x="12" y="14" width="44" height="32" rx="3" />
        <polygon points="28,22 28,38 43,30" fill="currentColor" opacity="0.35" />
        <path d="M62 20 Q69 30 62 40" />
        <path d="M68 15 Q77 30 68 45" />
      </svg>
    );
  }
  if (kind === 'document') {
    return (
      <svg viewBox="0 0 80 56" className="h-12 w-16 text-[#6E6E6E]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 8 L48 8 L58 18 L58 48 L20 48 Z" />
        <path d="M48 8 L48 18 L58 18" />
        <path d="M27 25 L50 25 M27 33 L48 33 M27 40 L40 40" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 80 56" className="h-12 w-16 text-[#6E6E6E]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="14" y="10" width="52" height="36" rx="2" />
      <path d="M14 22 L66 22 M14 34 L66 34 M34 10 L34 46 M50 10 L50 46" />
    </svg>
  );
}
