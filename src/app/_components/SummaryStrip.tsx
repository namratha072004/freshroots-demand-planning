/** A slim row of a few numbers at the top of a drill-down page. */
export function SummaryStrip({ items }: { items: { label: string; value: React.ReactNode; note?: string }[] }) {
  return (
    <div className="sumstrip">
      {items.map((i) => (
        <div key={i.label} className="sum-item">
          <div className="sum-label">{i.label}</div>
          <div className="sum-value">{i.value}</div>
          {i.note && <div className="sum-note">{i.note}</div>}
        </div>
      ))}
    </div>
  );
}
