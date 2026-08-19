// The Operations Workspace shell (Platform Activation Slice 0, WP 0.5/0.6) — a minimal
// landing surface distinguishing "you are in Klussie Operations" from every other
// context, rendered by AppShell.jsx whenever the active workspace holds the
// platform_operations capability (ADR-0030). Reuses existing shell chrome and CSS
// classes only — no new design-system component for this shell itself.
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
import { AuditLog } from "./AuditLog.jsx";

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
        <div style={{ marginTop: 16 }}>
          <AuditLog />
        </div>
      )}
    </div>
  );
}
