// Every request the customer has made — Active first, History on its own segment, and a
// real, direct way to start a new one from every state.
//
// UX redesign, 2026-09-28 — the old single flat list had no header action and no
// segments at all; its empty state read "No requests yet. Go to Discover to request a
// quote" — telling the customer to navigate elsewhere rather than doing the one thing
// this screen exists for. Both fixed here: a real "New request" header action (opens
// AiIntakeSheet directly, the same entry point Ask Klussie's own composer uses — one
// real intake flow, not a second one invented for this screen) and Active/History,
// the same `.segmented` pattern ProJobs.jsx already established for an identical split.
import { useState } from "react";
import { ClipboardList, ChevronRight, Clock, Plus } from "lucide-react";
import { useLang } from "../lib/lang";
import { Button } from "../design-system";
import { StatusPill } from "../requests";
import { OPEN_STATUSES, statusPresentation } from "../lib/requestStatus.js";

export function RequestsList({ requests, onOpen, onCreateRequest }) {
  const { t, fmtDate, serviceInfo, whenLabel } = useLang();
  const [seg, setSeg] = useState("active");

  const active = requests.filter((r) => OPEN_STATUSES.includes(r.status));
  const history = requests.filter((r) => !OPEN_STATUSES.includes(r.status));
  const list = seg === "active" ? active : history;

  return (
    <div className="pad">
      <div className="hello" style={{ marginBottom: 14 }}>
        <div className="h1">{t.myRequestsTitle}</div>
        {onCreateRequest && (
          <Button variant="secondary" icon={Plus} style={{ width: "auto", padding: "9px 14px" }} onClick={onCreateRequest}>
            {t.requestsNewBtn}
          </Button>
        )}
      </div>

      {requests.length > 0 && (
        <div className="segmented" style={{ marginBottom: 16 }}>
          <button className={seg === "active" ? "seg-on" : ""} onClick={() => setSeg("active")}>{t.requestsActiveSeg} ({active.length})</button>
          <button className={seg === "history" ? "seg-on" : ""} onClick={() => setSeg("history")}>{t.requestsHistorySeg} ({history.length})</button>
        </div>
      )}

      {requests.length === 0 && (
        <div className="empty-block">
          <ClipboardList size={26} color="var(--ink-soft)" />
          <p style={{ fontWeight: 600, color: "var(--ink)" }}>{t.requestsEmptyTitle}</p>
          <p>{t.requestsEmptyBody}</p>
          {onCreateRequest && (
            <Button variant="primary" style={{ width: "auto", marginTop: 4, padding: "10px 20px" }} onClick={onCreateRequest}>
              {t.requestsEmptyCta}
            </Button>
          )}
        </div>
      )}

      {requests.length > 0 && list.length === 0 && (
        <div className="empty-block">
          <p>{seg === "active" ? t.requestsActiveEmpty : t.requestsHistoryEmpty}</p>
        </div>
      )}

      {list.map((r) => (
        // Visual-refresh direction, 2026-10-02 — the same card language as the redesigned
        // Today/Messages rows: an icon tile (amber when a decision is waiting on the
        // customer, sage otherwise), the service and when, the status pill, then a
        // quiet footer line. Same data and same click target as the JobCard it replaces.
        <button key={r.id} type="button" className="req-row" onClick={() => onOpen(r.id)}>
          <span className="req-row-head">
            <span className={"req-row-icon" + (statusPresentation(r.status).tone === "amber" ? " req-row-icon-amber" : "")} aria-hidden="true"><ClipboardList size={19} /></span>
            <span className="req-row-text">
              <strong>{serviceInfo(r.serviceId).name}</strong>
              <small>{`${whenLabel(r.answers.when)} · ${fmtDate(r.createdAt)}`}</small>
            </span>
            <StatusPill status={r.status} />
          </span>
          <span className="req-row-foot">
            {r.status === "collecting"
              ? <span className="waiting"><Clock size={12} /> {t.waitingForQuotes}</span>
              : <span>{r.quotes.length} {t.quotesReceived}</span>}
            <ChevronRight className="ticket-foot-chevron" size={16} aria-hidden="true" />
          </span>
        </button>
      ))}
    </div>
  );
}
