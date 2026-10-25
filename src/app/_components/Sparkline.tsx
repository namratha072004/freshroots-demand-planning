"use client";

import { useState } from "react";

/**
 * 16-week sales line. 2px line, last 4 weeks drawn in the accent (the window the rules compare), an end dot of
 * 8px with a surface ring, and a hover crosshair with a readout. A hidden table-friendly summary is in aria-label.
 */
export function Sparkline({ data, highlightLast = 4 }: { data: { week: string; units: number }[]; highlightLast?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length < 2) return <div className="viz-foot">No sales history</div>;

  const W = 220;
  const H = 52;
  const padX = 6;
  const padY = 8;
  const max = Math.max(...data.map((d) => d.units));
  const min = Math.min(...data.map((d) => d.units));
  const span = Math.max(1, max - min);
  const x = (i: number) => padX + (i * (W - padX * 2)) / (data.length - 1);
  const y = (v: number) => H - padY - ((v - min) / span) * (H - padY * 2);
  const pts = data.map((d, i) => [x(i), y(d.units)] as const);
  const path = (from: number, to: number) => pts.slice(from, to).map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const split = data.length - highlightLast;
  const active = hover ?? data.length - 1;
  const [ax, ay] = pts[active];
  const label = `Weekly units sold, ${data[0].week} to ${data[data.length - 1].week}: from ${data[0].units} to ${data[data.length - 1].units}`;

  return (
    <div
      className="spark-wrap"
      onMouseLeave={() => setHover(null)}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const rel = ((e.clientX - r.left) / r.width) * W;
        setHover(Math.max(0, Math.min(data.length - 1, Math.round(((rel - padX) / (W - padX * 2)) * (data.length - 1)))));
      }}
    >
      <svg className="viz-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="none" style={{ height: H }}>
        <line x1={padX} x2={W - padX} y1={H - 1} y2={H - 1} stroke="var(--line)" strokeWidth="1" />
        <path d={path(0, split + 1)} fill="none" stroke="var(--faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={path(split, data.length)} fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {hover !== null && <line x1={ax} x2={ax} y1={2} y2={H - 1} stroke="var(--line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      </svg>
      {/* The dot is HTML so it stays round while the line stretches with the card width. */}
      <span
        aria-hidden
        className="spark-dot"
        style={{
          position: "absolute",
          left: `${(ax / W) * 100}%`,
          top: ay,
          width: 10,
          height: 10,
          marginLeft: -5,
          marginTop: -5,
          borderRadius: 999,
          background: "var(--brand)",
          boxShadow: "0 0 0 2px var(--surface)",
          pointerEvents: "none",
        }}
      />
      {hover !== null && (
        <div className="spark-tip" style={{ left: `${(ax / W) * 100}%` }}>
          {data[active].week.slice(5)} · {data[active].units} units
        </div>
      )}
    </div>
  );
}
