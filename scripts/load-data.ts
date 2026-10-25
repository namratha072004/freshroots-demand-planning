import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { loadCsvFiles, countRows, EXPECTED_COUNTS } = await import("../src/lib/loadCsv");
  await loadCsvFiles();
  const counts = await countRows();
  let ok = true;
  for (const [table, expected] of Object.entries(EXPECTED_COUNTS)) {
    const actual = counts[table as keyof typeof counts];
    const pass = actual === expected;
    ok &&= pass;
    console.log(`${pass ? "OK  " : "FAIL"} ${table.padEnd(20)} expected ${String(expected).padStart(3)}  got ${String(actual).padStart(3)}`);
  }
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error("load failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
