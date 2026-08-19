// The Operations Workspace shell (Platform Activation Slice 0, WP 0.5) — a minimal
// landing surface distinguishing "you are in Klussie Operations" from every other
// context, rendered by AppShell.jsx whenever the active workspace holds the
// platform_operations capability (ADR-0030). Reuses existing shell chrome and CSS
// classes only — no new design-system component for this package, per this work
// package's own stated scope; WP 0.6 replaces the single placeholder tab below with the
// real Audit viewer (ROADMAP_C_PLATFORM_OPERATIONS.md §3.7).
//
// NOT ROUTED THROUGH useLang()/appStrings.js
//
// Every customer- and professional-facing screen in this codebase is localized across
// ten markets (src/lib/appStrings.js). This screen is not: its audience is company
// staff operating the platform, not a customer in any market the product serves — the
// same distinction ROADMAP_C_PLATFORM_OPERATIONS.md draws throughout between the
// customer/professional experiences and Platform Operations. Revisit this if that
// audience assumption ever changes.
import { useState } from "react";

const TABS = [{ id: "audit", label: "Audit" }];

export function OperatorApp() {
  const [tab, setTab] = useState("audit");

  return (
    <div className="pad">
      <div className="hello" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6, marginBottom: 22 }}>
        <div className="h1">Klussie Operations</div>
        <div className="fineprint" style={{ justifyContent: "flex-start" }}>Signed in as an operator.</div>
      </div>

      <div className="segmented" role="tablist" aria-label="Operations">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "seg-on" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "audit" && (
        <div className="empty-block" style={{ marginTop: 16 }}>
          <p>The audit log lands here next.</p>
        </div>
      )}
    </div>
  );
}
