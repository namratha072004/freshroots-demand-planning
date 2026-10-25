"use client";

import { useEffect, useRef } from "react";

/**
 * Counts up to `value` once on load. The server renders the final number (so it is right without scripts and for
 * reduced-motion users); the animation only rewrites the text on the client. No state, so nothing re-renders.
 */
export function CountUp({ value, decimals = 0, suffix = "" }: { value: number; decimals?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const fmt = (n: number) => `${n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const start = performance.now() + 250; // let the card finish rising in first
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / 900));
      el.textContent = fmt(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    el.textContent = fmt(0);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el.textContent = fmt(value);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals, suffix]);

  return <span ref={ref} className="num">{fmt(value)}</span>;
}
