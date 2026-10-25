import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, THEMES, parseMode, parseTheme } from "@/lib/theme";

const css = readFileSync(path.join(process.cwd(), "src/app/themes.css"), "utf8");
const globals = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

/** The value of a variable in the light block of a theme. */
function lightVar(theme: string, name: string): string {
  const block = new RegExp(`:root\\[data-theme="${theme}"\\] \\{([^}]*)\\}`).exec(css)?.[1] ?? "";
  return new RegExp(`${name}: (#[0-9a-f]{6});`).exec(block)?.[1] ?? "";
}

describe("theme names are whitelisted", () => {
  it("only known ids pass; anything else falls back to the default", () => {
    for (const t of THEMES) expect(parseTheme(t.id)).toBe(t.id);
    for (const bad of [undefined, null, "", "nope", "FOREST", "ocean\" onload=\"x", "../x", "<b>"]) expect(parseTheme(bad as never)).toBe(DEFAULT_THEME);
  });
  it("mode is auto unless explicitly light or dark", () => {
    expect(parseMode("light")).toBe("light");
    expect(parseMode("dark")).toBe("dark");
    for (const bad of [undefined, "", "auto", "blue", "DARK"]) expect(parseMode(bad as never)).toBe("auto");
  });
});

describe("the picker previews match the real styles", () => {
  it("every theme has light, system-dark and forced-dark styles", () => {
    for (const t of THEMES) {
      expect(css).toContain(`:root[data-theme="${t.id}"] {`);
      expect(css).toContain(`:root[data-theme="${t.id}"]:not([data-mode="light"]) {`);
      expect(css).toContain(`:root[data-theme="${t.id}"][data-mode="dark"] {`);
    }
  });
  it("swatch colours equal the CSS values", () => {
    for (const t of THEMES) {
      expect(lightVar(t.id, "--side-bg")).toBe(t.swatch.side);
      expect(lightVar(t.id, "--bg")).toBe(t.swatch.page);
      expect(lightVar(t.id, "--brand")).toBe(t.swatch.brand);
      expect(lightVar(t.id, "--accent")).toBe(t.swatch.accent);
    }
  });
  it("at least five themes are offered", () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(5);
  });
});

describe("status colours are not themed", () => {
  it("themes never override the status colours, so they keep one meaning everywhere", () => {
    for (const v of ["--order", "--pause", "--ok", "--bad", "--warn", "--hand"]) expect(css).not.toContain(`${v}`);
  });
  it("a forced light or dark choice beats the device setting", () => {
    expect(globals).toContain(':root:not([data-mode="light"])');
    expect(globals).toContain(':root[data-mode="dark"]');
  });
});
