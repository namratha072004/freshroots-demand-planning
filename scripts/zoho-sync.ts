import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { ZohoClient, zohoEnv } = await import("../src/lib/zoho/client");
  const { syncZohoItems } = await import("../src/lib/zoho/draftPo");
  const r = await syncZohoItems(new ZohoClient(zohoEnv()));
  console.log(`mapped ${r.mapped} SKUs to Zoho items.${r.missing.length ? ` Missing in Zoho: ${r.missing.join(", ")}` : " None missing."}`);
}

main().catch((e) => {
  console.error("sync failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
