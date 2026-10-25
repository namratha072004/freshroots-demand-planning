import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { getSql } from "./db";

const DATA_DIR = path.join(process.cwd(), "data");

function readCsv(file: string): Record<string, string>[] {
  return parse(readFileSync(path.join(DATA_DIR, file), "utf8"), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });
}

function col(rows: Record<string, string>[], name: string): string[] {
  return rows.map((r) => {
    const v = r[name];
    if (v === undefined || v === "") throw new Error(`Missing value for column ${name}`);
    return v;
  });
}

export const EXPECTED_COUNTS = {
  distributor_master: 4,
  sku_master: 15,
  weekly_sales: 240,
  current_inventory: 15,
  calendar: 24,
} as const;

/** Replace all data tables with the CSV contents, in one transaction. Safe to re-run. */
export async function loadCsvFiles() {
  const sql = getSql();
  const dist = readCsv("distributor_master.csv");
  const sku = readCsv("sku_master.csv");
  const sales = readCsv("weekly_sales.csv");
  const inv = readCsv("current_inventory.csv");
  const cal = readCsv("calendar.csv");

  await sql.transaction([
    sql`DELETE FROM weekly_sales`,
    sql`DELETE FROM current_inventory`,
    sql`DELETE FROM sku_master`,
    sql`DELETE FROM distributor_master`,
    sql`DELETE FROM calendar`,
    sql`INSERT INTO distributor_master (distributor_id, distributor_name, region, status)
        SELECT * FROM unnest(${col(dist, "Distributor_ID")}::text[], ${col(dist, "Distributor_Name")}::text[],
                             ${col(dist, "Region")}::text[], ${col(dist, "Status")}::text[])`,
    sql`INSERT INTO sku_master (sku_id, sku_name, category, perishability, standard_reorder_qty, unit_of_measure, distributor_id)
        SELECT * FROM unnest(${col(sku, "SKU_ID")}::text[], ${col(sku, "SKU_Name")}::text[], ${col(sku, "Category")}::text[],
                             ${col(sku, "Perishability")}::text[], ${col(sku, "Standard_Reorder_Qty")}::int[],
                             ${col(sku, "Unit_of_Measure")}::text[], ${col(sku, "Distributor_ID")}::text[])`,
    sql`INSERT INTO weekly_sales (sku_id, week, units_sold)
        SELECT * FROM unnest(${col(sales, "SKU_ID")}::text[], ${col(sales, "Week")}::text[], ${col(sales, "Units_Sold")}::int[])`,
    sql`INSERT INTO current_inventory (sku_id, location, units_on_hand, as_of_date)
        SELECT * FROM unnest(${col(inv, "SKU_ID")}::text[], ${col(inv, "Location")}::text[],
                             ${col(inv, "Units_On_Hand")}::int[], ${col(inv, "As_Of_Date")}::date[])`,
    sql`INSERT INTO calendar (year, month, year_month, is_festival_month)
        SELECT * FROM unnest(${col(cal, "Year")}::int[], ${col(cal, "Month")}::int[], ${col(cal, "Year_Month")}::text[],
                             ${col(cal, "Is_Festival_Month").map((v) => v.toUpperCase() === "TRUE")}::boolean[])`,
  ]);
}

export async function countRows(): Promise<Record<keyof typeof EXPECTED_COUNTS, number>> {
  const sql = getSql();
  const [r] = await sql`SELECT
    (SELECT count(*)::int FROM distributor_master) AS distributor_master,
    (SELECT count(*)::int FROM sku_master) AS sku_master,
    (SELECT count(*)::int FROM weekly_sales) AS weekly_sales,
    (SELECT count(*)::int FROM current_inventory) AS current_inventory,
    (SELECT count(*)::int FROM calendar) AS calendar`;
  return r as Record<keyof typeof EXPECTED_COUNTS, number>;
}
