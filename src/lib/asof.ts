/** "Today" for the stale-data and festival-month checks (D1). ASOF_OVERRIDE wins when set. */
export function getAsOf(): string {
  const override = process.env.ASOF_OVERRIDE?.trim();
  if (override) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(override)) throw new Error("ASOF_OVERRIDE must be YYYY-MM-DD");
    return override;
  }
  return new Date().toISOString().slice(0, 10);
}
