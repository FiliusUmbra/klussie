// Pro Workspace remarks, 2026-09-12 (Theme E) — the operator's own queue
// (catalog.service_suggestions, migration 0221): a pro's free-text service description
// the AI couldn't match to anything already in the catalog, waiting on a real decision
// before it can ever become a live, customer-searchable service. Same plain,
// compliance-surface treatment as TrustSafetyQueue.jsx/AuditLog.jsx — Card, no
// JobCard-style warmth. Not localized — OperatorApp.jsx's own stated, deliberate
// exemption (see that file's own header).
//
// NO SEPARATE DETAIL SHEET — UNLIKE CaseDetailSheet.jsx
//
// api.list_service_suggestions() already returns everything there is to decide on (the
// pro's own raw description, the AI's full proposal, every generated translation) in one
// row; there is no richer case_detail_for_caller()-style read to compose, and no
// multi-action decision shape (warn/suspend/escalate) — just approve or reject, with an
// optional note. A second sheet here would only add a click, not real information.
import { useEffect, useState } from "react";
import { Card, Badge } from "../design-system";
import { fetchServiceSuggestions, decideServiceSuggestion } from "../lib/serviceSuggestions.js";

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

function formatConfidence(confidence) {
  return confidence == null ? "—" : `${Math.round(confidence * 100)}%`;
}

function SuggestionCard({ suggestion, onDecided }) {
  const [note, setNote] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState("");

  const decide = async (decision) => {
    setDeciding(true);
    setError("");
    try {
      await decideServiceSuggestion(suggestion.suggestionId, decision, note.trim() || null);
      onDecided();
    } catch {
      setError("Could not record this decision. Please try again.");
      setDeciding(false);
    }
  };

  return (
    <Card style={{ marginBottom: 10, textAlign: "left" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <strong>{suggestion.proposedName}</strong>
        <Badge tone="amber">{suggestion.locale}</Badge>
      </div>
      <div className="fineprint" style={{ justifyContent: "flex-start", marginTop: 4 }}>
        {suggestion.workspaceName || "(unnamed workspace)"} · category: {suggestion.categoryId} · {suggestion.proposedMode} · €{suggestion.proposedBasePrice}
      </div>
      <div className="fineprint" style={{ justifyContent: "flex-start", marginTop: 2 }}>
        AI confidence {formatConfidence(suggestion.aiConfidence)} · suggested {formatDate(suggestion.createdAt)}
      </div>

      <p className="sheet-blurb" style={{ marginTop: 8 }}>{suggestion.proposedBlurb}</p>

      <div className="fineprint" style={{ justifyContent: "flex-start", marginTop: 8, fontStyle: "italic" }}>
        Pro's own words: "{suggestion.rawDescription}"
      </div>

      <textarea
        className="textarea"
        rows={2}
        placeholder="Decision note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        style={{ marginTop: 8 }}
      />

      {error && <p className="fineprint" style={{ color: "var(--danger, #b3261e)", justifyContent: "flex-start", marginTop: 6 }}>{error}</p>}

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="btn-secondary" disabled={deciding} onClick={() => decide("rejected")}>Reject</button>
        <button className="btn-primary" disabled={deciding} onClick={() => decide("approved")}>Approve</button>
      </div>
    </Card>
  );
}

export function ServiceSuggestionsQueue({ refreshKey, onRefresh }) {
  const [suggestions, setSuggestions] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchServiceSuggestions().then((rows) => {
      if (!cancelled) setSuggestions(rows);
    });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const loading = suggestions === null;

  return (
    <div>
      {loading && <div className="empty-block"><p>Loading…</p></div>}

      {!loading && suggestions.length === 0 && (
        <div className="empty-block"><p>No pending service suggestions.</p></div>
      )}

      {!loading && suggestions.map((s) => (
        <SuggestionCard key={s.suggestionId} suggestion={s} onDecided={onRefresh} />
      ))}
    </div>
  );
}
