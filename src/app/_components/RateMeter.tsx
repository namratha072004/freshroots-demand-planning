/** Rejection-rate meter: 0..40% track with the alert (10%) and stop (25%) lines; the fill carries severity. */
export function RateMeter({ rate, alertRate, stopRate }: { rate: number | null; alertRate: number; stopRate: number }) {
  const W = 260;
  const top = 0.4;
  const px = (v: number) => (Math.min(v, top) / top) * W;
  const r = rate ?? 0;
  const fill = r >= stopRate ? "var(--bad)" : r >= alertRate ? "var(--warn)" : "var(--ok)";
  return (
    <div className="meter">
      <svg className="meter-svg" viewBox={`0 0 ${W} 26`} role="img" aria-label={`Rejection rate ${rate === null ? "not yet known" : (r * 100).toFixed(1) + "%"}; alert at ${alertRate * 100}%, stop at ${stopRate * 100}%`}>
        <rect x={0} y={9} width={W} height={8} rx={4} fill="var(--track)" />
        {rate !== null && r > 0 && <rect className="meter-fill" x={0} y={9} width={Math.max(8, px(r))} height={8} rx={4} fill={fill} />}
        <line x1={px(alertRate)} x2={px(alertRate)} y1={4} y2={22} stroke="var(--warn)" strokeWidth="2" />
        <line x1={px(stopRate)} x2={px(stopRate)} y1={4} y2={22} stroke="var(--bad)" strokeWidth="2" />
      </svg>
      <div className="meter-legend" style={{ position: "relative", height: 14 }}>
        <span style={{ position: "absolute", left: 0 }}>0%</span>
        <span style={{ position: "absolute", left: `${(px(alertRate) / W) * 100}%`, transform: "translateX(-50%)" }}>alert {alertRate * 100}%</span>
        <span style={{ position: "absolute", left: `${(px(stopRate) / W) * 100}%`, transform: "translateX(-50%)" }}>stop {stopRate * 100}%</span>
      </div>
    </div>
  );
}
