import Link from "next/link";

export function Tabs({ active }: { active: "flags" | "launches" }) {
  return (
    <nav className="tabs">
      <Link href="/" className={`tab ${active === "flags" ? "active" : ""}`}>
        Flag list
      </Link>
      <Link href="/launches" className={`tab ${active === "launches" ? "active" : ""}`}>
        New launches
      </Link>
    </nav>
  );
}
