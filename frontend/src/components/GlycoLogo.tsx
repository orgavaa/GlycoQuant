/**
 * GlycoQuant lettermark.
 *
 * A circular cell body with a soft pericellular halo (the "glyco" — a
 * visual analogue of the WGA brush) and a "GQ" lettermark inside.
 * The halo gradient runs from WGA-green (#1b7837) at the outer edge
 * to YAP-magenta (#762a83) at the inside, encoding the platform's
 * core measurement: pericellular surface coat ↔ nuclear translocation.
 *
 * Pure SVG — scales without a raster asset and recolours with the
 * surrounding text via inheriting `currentColor` for the lettermark.
 */
export function GlycoLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      role="img"
      aria-label="GlycoQuant logo"
    >
      <defs>
        <radialGradient id="gq-halo" cx="50%" cy="50%" r="50%">
          {/* Inner: YAP-magenta — the mechanotransduction destination */}
          <stop offset="35%" stopColor="#762a83" stopOpacity="0" />
          <stop offset="55%" stopColor="#762a83" stopOpacity="0.45" />
          {/* Outer: WGA-green — the lectin readout this platform measures */}
          <stop offset="85%" stopColor="#1b7837" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#1b7837" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="gq-cell" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#1e293b" />
        </radialGradient>
      </defs>

      {/* Pericellular halo — fades in then out, evoking the brush */}
      <circle cx="16" cy="16" r="15" fill="url(#gq-halo)" />

      {/* Cell body */}
      <circle cx="16" cy="16" r="11" fill="url(#gq-cell)" />

      {/* GQ lettermark, slightly inset */}
      <text
        x="16"
        y="20.5"
        textAnchor="middle"
        fontFamily="IBM Plex Sans, system-ui, sans-serif"
        fontWeight="700"
        fontSize="10"
        fill="#f8fafc"
        letterSpacing="-0.5"
      >
        GQ
      </text>
    </svg>
  );
}
