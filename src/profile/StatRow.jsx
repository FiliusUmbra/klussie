// SLICE_5_UNIFIED_PROFILE_DESIGN.md §3b — the `stat-row`/`stat`/`stat-num`/`stat-label`
// markup CustomerProfile.jsx and ProProfile.jsx each hand-wrote with different data, same
// structure. Which stats and what they mean stays entirely audience-specific (a customer's
// requests-sent vs. a pro's trust score are computed from different things and mean
// different things) — only the repeated markup becomes one primitive.
export function StatRow({ items }) {
  return (
    <div className="stat-row">
      {items.map((item, i) => (
        <div className="stat" key={item.key ?? i}>
          <div className="stat-num">{item.value}</div>
          <div className="stat-label">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
