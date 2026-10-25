/** Colour themes and light/dark mode. Stored in cookies so the server renders the right one with no flash. */
export const THEME_COOKIE = "fr_theme";
export const MODE_COOKIE = "fr_mode";

export type Mode = "auto" | "light" | "dark";

export interface ThemeInfo {
  id: string;
  name: string;
  blurb: string;
  /** Preview colours (light): sidebar, page, brand, accent. Kept in step with src/app/themes.css. */
  swatch: { side: string; page: string; brand: string; accent: string };
}

export const THEMES: ThemeInfo[] = [
  { id: "forest", name: "Forest", blurb: "Deep green, the fresh-produce look", swatch: { side: "#0e2418", page: "#f4f3ee", brand: "#17653f", accent: "#cff27e" } },
  { id: "ocean", name: "Ocean", blurb: "Calm navy and sky blue", swatch: { side: "#0b1f33", page: "#f1f5f9", brand: "#0f5e9c", accent: "#8fd3ff" } },
  { id: "grape", name: "Grape", blurb: "Rich purple with a soft lilac", swatch: { side: "#1a1030", page: "#f6f3fb", brand: "#6d3fc4", accent: "#d9c4ff" } },
  { id: "rose", name: "Rose", blurb: "Warm berry and blush", swatch: { side: "#2a0e1d", page: "#fbf4f7", brand: "#be185d", accent: "#ffc7df" } },
  { id: "graphite", name: "Graphite", blurb: "Neutral charcoal with an amber spark", swatch: { side: "#111317", page: "#f4f4f5", brand: "#1f2937", accent: "#fcd34d" } },
];

export const DEFAULT_THEME = "forest";

/** Only known theme ids are ever put on the page. */
export function parseTheme(v: string | undefined | null): string {
  return THEMES.some((t) => t.id === v) ? (v as string) : DEFAULT_THEME;
}

export function parseMode(v: string | undefined | null): Mode {
  return v === "light" || v === "dark" ? v : "auto";
}
