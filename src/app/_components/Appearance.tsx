"use client";

import { Check, Monitor, Moon, Palette, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MODE_COOKIE, THEME_COOKIE, THEMES, type Mode } from "@/lib/theme";

function save(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

function applyTheme(id: string) {
  document.documentElement.dataset.theme = id;
  save(THEME_COOKIE, id);
}
function applyMode(mode: Mode) {
  if (mode === "auto") delete document.documentElement.dataset.mode;
  else document.documentElement.dataset.mode = mode;
  save(MODE_COOKIE, mode);
}

/** Theme swatches and a light / dark / auto switch. The choice is applied at once and remembered in a cookie. */
export function AppearancePicker({ initialTheme, initialMode }: { initialTheme: string; initialMode: Mode }) {
  const [theme, setTheme] = useState(initialTheme);
  const [mode, setMode] = useState<Mode>(initialMode);

  return (
    <div>
      <div className="swatches" role="radiogroup" aria-label="Colour theme">
        {THEMES.map((t) => (
          <button key={t.id} role="radio" aria-checked={theme === t.id} className={`swatch ${theme === t.id ? "on" : ""}`} onClick={() => (setTheme(t.id), applyTheme(t.id))} title={t.blurb}>
            <span className="swatch-prev" aria-hidden>
              <i style={{ background: t.swatch.side }} />
              <b style={{ background: t.swatch.page }}>
                <u style={{ background: t.swatch.brand }} />
                <u style={{ background: t.swatch.accent }} />
              </b>
            </span>
            <span className="swatch-name">{t.name}</span>
            <span className="swatch-blurb">{t.blurb}</span>
            {theme === t.id && <Check size={14} strokeWidth={3} className="swatch-check" />}
          </button>
        ))}
      </div>
      <div className="seg" role="radiogroup" aria-label="Light or dark" style={{ marginTop: 14 }}>
        {([["auto", "Match my device", Monitor], ["light", "Light", Sun], ["dark", "Dark", Moon]] as const).map(([m, label, Icon]) => (
          <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? "on" : ""} onClick={() => (setMode(m), applyMode(m))}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Header button that opens the picker anywhere in the app. */
export function AppearanceMenu() {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState<{ theme: string; mode: Mode } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open) {
      const d = document.documentElement.dataset;
      setNow({ theme: d.theme ?? "forest", mode: (d.mode as Mode) ?? "auto" });
    }
    setOpen((v) => !v);
  };

  return (
    <div className="popwrap" ref={ref}>
      <button className="ghost icon-btn" onClick={toggle} aria-expanded={open} aria-haspopup="dialog" aria-label="Change colours" title="Change colours">
        <Palette size={17} />
      </button>
      {open && now && (
        <div className="card pop appearance-pop" role="dialog" aria-label="Appearance">
          <div className="po-glimpse-title">Colours</div>
          <AppearancePicker initialTheme={now.theme} initialMode={now.mode} />
        </div>
      )}
    </div>
  );
}
