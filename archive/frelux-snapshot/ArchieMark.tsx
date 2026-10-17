/**
 * ArchieMark - the shared premium ARCHIE AI identity mark.
 *
 * An inline SVG (never an <img>), so it cannot 404, stays crisp at any size
 * and inherits the FRELUX brand gradient: violet into cyan, with a polished
 * top highlight and the four-point AI sparkle.
 */
export default function ArchieMark({
  className = "h-6 w-6",
  "aria-label": ariaLabel = "ARCHIE",
}: {
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <linearGradient id="archie-mark-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8B5CF6" />
          <stop offset="0.55" stopColor="#6D28D9" />
          <stop offset="1" stopColor="#1FA8CC" />
        </linearGradient>
        <linearGradient id="archie-mark-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.35" />
          <stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect
        x="2"
        y="2"
        width="44"
        height="44"
        rx="14"
        fill="url(#archie-mark-g)"
      />
      <rect
        x="2"
        y="2"
        width="44"
        height="44"
        rx="14"
        fill="url(#archie-mark-shine)"
      />
      {/* Four-point AI sparkle */}
      <path
        d="M24 9.5 Q26.2 21.8 38.5 24 Q26.2 26.2 24 38.5 Q21.8 26.2 9.5 24 Q21.8 21.8 24 9.5 Z"
        fill="#FFFFFF"
        fillOpacity="0.96"
      />
      <circle cx="35.5" cy="14.5" r="2.4" fill="#FFFFFF" fillOpacity="0.9" />
      <circle cx="13.5" cy="33.5" r="1.7" fill="#FFFFFF" fillOpacity="0.55" />
    </svg>
  );
}
