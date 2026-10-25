import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Freshroots Demand Planning",
  description: "Draft-only demand planning decision support",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
