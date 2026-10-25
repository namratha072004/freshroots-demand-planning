/**
 * Weeks of stock cover against the safe zone for this SKU. The band is min..max (Raghav's rule), the marker is the
 * SKU, coloured by what the rules said: below the band = stockout risk, above = overstock. Text carries the value.
 * Built in HTML so it stretches with its column and the marker stays round.
 */
export function CoverMeter({ cover, min, max, compact = false }: { cover: number; min: number; max: number; compact?: boolean }) {
  const scaleMax = Math.max(max * 1.5, cover * 1.15, min * 2);
  const pct = (v: number) => `${(Math.min(v, scaleMax) / scaleMax) * 100}%`;
  const below = cover < min;
  const above = cover > max;
  const color = below ? "var(--order)" : above ? "var(--pause)" : "var(--ok)";
  const state = below ? "below the safe zone" : above ? "above the safe zone" : "inside the safe zone";
  return (
    <div className={`cover ${compact ? "sm" : ""}`} role="img" aria-label={`Stock cover ${cover.toFixed(1)} weeks, ${state} of ${min} to ${max} weeks`}>
      <div className="cover-track">
        <div className="cover-band" style={{ left: pct(min), width: `calc(${pct(max)} - ${pct(min)})` }} />
        <div className="cover-marker" style={{ left: pct(cover), background: color }} />
      </div>
      {!compact && (
        <div className="cover-ticks">
          <span style={{ left: pct(min) }}>{min}</span>
          <span style={{ left: pct(max) }}>{max}</span>
        </div>
      )}
    </div>
  );
}
