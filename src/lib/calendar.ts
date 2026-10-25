export interface CalendarRow {
  yearMonth: string; // "2026-10"
  isFestivalMonth: boolean;
}

/** Is the month of `asOf` (YYYY-MM-DD) a festival month in the calendar? Throws if the month is missing. */
export function isFestivalMonth(calendar: CalendarRow[], asOf: string): boolean {
  const ym = asOf.slice(0, 7);
  const row = calendar.find((c) => c.yearMonth === ym);
  if (!row) throw new Error(`Month ${ym} is not in the calendar`);
  return row.isFestivalMonth;
}
