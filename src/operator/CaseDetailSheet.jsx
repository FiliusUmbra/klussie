// Slice 5, WP 5.2 — one case in full: reporter, reported workspace, the report itself,
// its own decision history, and the four enforcement actions
// (ROADMAP_C_PLATFORM_OPERATIONS.md §3.3). Not localized — OperatorApp.jsx's own stated,
// deliberate exemption (see that file's own header).
//
// EVIDENCE (photos, messages, the relevant Service Record) IS NOT ASSEMBLED HERE —
// A NAMED, DELIBERATE SCOPE LIMIT, NOT AN OVERSIGHT
//
// safety.case_detail_for_caller() (0171) exposes subject_type/subject_id but does not
// resolve them into full evidence — the "compose at read time, never duplicate"
// principle platform.my_inbox()/property.locations_for_property() already use. This
// screen shows what the contract returns (the case's own facts, its decision history)
// and does not yet cross into work.messages/work.service_records/
// property.document_attachments to render evidence inline — a real, separable follow-up
// once this first pass proves the triage/decision loop itself works.
//
// SUSPEND GETS A CONFIRMING SECOND STEP — THE SAME Modal PATTERN Profile.jsx's OWN
// TESTIMONIAL-DELETE FLOW ALREADY USES
//
// A capability withdrawal is the one action here that is genuinely consequential and
// not casually reversible in the moment (§6.10: behaviour removed immediately; the
// capability itself can be re-granted, but the professional loses access the instant
// this fires). Every other action (warn/escalate/close) submits directly.
import { useState } from "react";
import { Drawer, Card, Badge, Button, Modal } from "../design-system";
import { recordDecision } from "../lib/trustSafety.js";

const ACTIONS = [
  { key: "warn", label: "Warn" },
  { key: "suspend", label: "Suspend a capability" },
  { key: "escalate", label: "Escalate" },
  { key: "close_no_action", label: "Close — no action" },
];

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString() : "—";
}

export function CaseDetailSheet({ caseDetail, actorRef, onClose, onDecided }) {
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState("");
  const [capabilityKey, setCapabilityKey] = useState("");
  const [confirmingSuspend, setConfirmingSuspend] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const resolved = caseDetail.status === "resolved";

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await recordDecision({ caseId: caseDetail.id, action, reason, capabilityKey, actorRef });
      setConfirmingSuspend(false);
      onDecided();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitClick = () => {
    if (action === "suspend") {
      setConfirmingSuspend(true);
    } else {
      submit();
    }
  };

  const canSubmit = action && (action !== "suspend" || capabilityKey.trim().length > 0);

  return (
    <Drawer onClose={onClose}>
      <div className="sheet-title">{caseDetail.reportedWorkspaceName || "(unnamed workspace)"}</div>
      <Badge tone={caseDetail.status === "escalated" ? "amber" : caseDetail.status === "resolved" ? "sage" : "forest"}>
        {caseDetail.status}
      </Badge>

      <div className="fineprint" style={{ justifyContent: "flex-start", marginTop: 10 }}>
        Reported by {caseDetail.reporterName || "—"} · {caseDetail.category} · filed {formatDate(caseDetail.createdAt)}
      </div>
      {caseDetail.details && <p className="sheet-blurb">{caseDetail.details}</p>}

      <div className="section-title" style={{ marginTop: 14 }}>Decision history</div>
      {caseDetail.decisions.length === 0 && (
        <div className="empty-block"><p>No decisions recorded yet.</p></div>
      )}
      {caseDetail.decisions.map((d) => (
        <Card key={d.id} style={{ marginBottom: 8, textAlign: "left" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <strong>{d.action}</strong>
            <span className="fineprint">{formatDate(d.decidedAt)}</span>
          </div>
          <div className="fineprint" style={{ justifyContent: "flex-start", marginTop: 4 }}>
            {d.operatorName || "—"}{d.capabilityKey ? ` · ${d.capabilityKey}` : ""}
          </div>
          {d.reason && <p className="sheet-blurb" style={{ marginTop: 4 }}>{d.reason}</p>}
        </Card>
      ))}

      {!resolved && (
        <>
          <div className="section-title" style={{ marginTop: 14 }}>Record a decision</div>
          <div className="segmented segmented-block">
            {ACTIONS.map((a) => (
              <button key={a.key} className={action === a.key ? "seg-on" : ""} onClick={() => setAction(a.key)}>{a.label}</button>
            ))}
          </div>

          {action === "suspend" && (
            <input
              type="text"
              placeholder="Capability key to withdraw (e.g. marketplace_participation)"
              value={capabilityKey}
              onChange={(e) => setCapabilityKey(e.target.value)}
              style={{ marginTop: 8, width: "100%" }}
            />
          )}

          <textarea
            className="textarea"
            rows={3}
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ marginTop: 8 }}
          />

          {error && <p className="fineprint" style={{ color: "var(--danger, #b3261e)", justifyContent: "flex-start", marginTop: 6 }}>{error}</p>}

          <button className="btn-primary" style={{ marginTop: 10 }} disabled={!canSubmit || submitting} onClick={handleSubmitClick}>
            {submitting ? "Recording…" : "Record decision"}
          </button>
        </>
      )}

      {confirmingSuspend && (
        <Modal onClose={() => setConfirmingSuspend(false)}>
          <p style={{ marginTop: 8 }}>
            Suspend <strong>{capabilityKey}</strong> on {caseDetail.reportedWorkspaceName || "this workspace"}? This removes
            behaviour immediately — the underlying data is never touched, and the capability can be re-granted later.
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <Button variant="secondary" onClick={() => setConfirmingSuspend(false)} disabled={submitting}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={submitting}>{submitting ? "Suspending…" : "Suspend"}</Button>
          </div>
        </Modal>
      )}
    </Drawer>
  );
}
