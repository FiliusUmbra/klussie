// The Overview screen's first real content (ROADMAP_C_PLATFORM_OPERATIONS.md §3.1) —
// PLATFORM_ACTIVATION_PROGRAMME.md §4's own Activation Ratio, per journey, made visible
// for the first time. See ACTIVATION_RATIO_OVERVIEW_DESIGN.md for the full reasoning:
// what each journey measures, why two journeys are expected to read near 50% (a live
// dual-write bridge, not a stalled cutover), and why this is deliberately scoped down
// from the rest of §3.1's own mission-control vision (funnel health, pipeline lag, a
// combined needs-attention list are all still real, unbuilt, future work).
//
// Same plain, compliance-surface treatment as AuditLog.jsx/TrustSafetyQueue.jsx — Card,
// no JobCard-style warmth — and the same loading idiom (result keyed by the exact fetch
// it belongs to). Reuses .flexi-bar/.flexi-bar-fill (src/shell/appStyles.js) rather than
// inventing a second progress-bar treatment. Not localized — OperatorApp.jsx's own
// stated, deliberate exemption (see that file's own header).
import { useEffect, useState } from "react";
import { Card } from "../design-system";
import { fetchActivationRatios, ACTIVATION_JOURNEYS, ACTIVATION_RATIO_WINDOW_DAYS } from "../lib/activationRatios.js";

function formatPct(ratio) {
  if (ratio == null) return "Not started";
  return `${Math.round(ratio * 1000) / 10}%`;
}

export function Overview() {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchActivationRatios().then((data) => {
      if (!cancelled) setRows(data);
    });
    return () => { cancelled = true; };
  }, []);

  const loading = rows === null;
  const byKey = new Map((rows ?? []).map((r) => [r.journeyKey, r]));

  return (
    <div>
      <div className="fineprint" style={{ justifyContent: "flex-start", marginBottom: 10 }}>
        Activation Ratio — last {ACTIVATION_RATIO_WINDOW_DAYS} days
      </div>

      {loading && <div className="empty-block"><p>Loading…</p></div>}

      {!loading && ACTIVATION_JOURNEYS.map((j) => {
        const row = byKey.get(j.key);
        const pct = row?.ratio == null ? 0 : Math.round(row.ratio * 100);
        return (
          <Card key={j.key} className="workspace-lookup-card" style={{ marginBottom: 10, textAlign: "left" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <strong>{j.label}</strong>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{formatPct(row?.ratio)}</span>
            </div>
            <div className="flexi-bar" style={{ marginTop: 8 }}>
              <div className="flexi-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="fineprint" style={{ justifyContent: "flex-start", marginTop: 6 }}>
              {j.key === "work_performed_to_service_record"
                ? `${row?.platformCount ?? 0} Service Records · ${row?.legacyCount ?? 0} completed jobs (adoption, not legacy replacement)`
                : `${row?.platformCount ?? 0} via the real engine · ${row?.legacyCount ?? 0} legacy`}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
