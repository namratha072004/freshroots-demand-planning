import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import "./themes.css";
import { MODE_COOKIE, THEME_COOKIE, parseMode, parseTheme } from "@/lib/theme";

const sans = Plus_Jakarta_Sans({ variable: "--font-sans", subsets: ["latin"], display: "swap" });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Freshroots Demand Planning",
  description: "Draft-only demand planning decision support",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const jar = await cookies();
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  const mode = parseMode(jar.get(MODE_COOKIE)?.value);
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} data-theme={theme} data-mode={mode === "auto" ? undefined : mode}>
      <body>{children}</body>
    </html>
  );
}
