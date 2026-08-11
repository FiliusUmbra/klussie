// The tab bar at the bottom of both the customer and professional apps. Purely
// presentational: it takes the items it should show, including their badge counts, and
// owns no opinion about what those counts mean.
export function BottomNav({ tab, setTab, items }) {
  return (
    <div className="tabbar">
      {items.map((it) => (
        <button key={it.id} className={"tab" + (tab === it.id ? " tab-on" : "")} onClick={() => setTab(it.id)}>
          <span className="tab-icon-wrap"><it.icon size={19} />{!!it.badge && <span className="tab-badge">{it.badge}</span>}</span>
          {it.label}
        </button>
      ))}
    </div>
  );
}
