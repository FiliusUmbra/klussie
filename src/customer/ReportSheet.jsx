// Reporting a problem with a booked professional. The reason codes are contract with
// safety.cases.category (Slice 5, WP 5.1 — cut over from the legacy reports table), so
// they come from src/lib/reportReasons.js rather than being spelled out here.
// Confirmation replaces the form rather than closing the sheet: a report that vanishes
// on submit leaves the customer unsure it was sent.
import { useState } from "react";
import { Check } from "lucide-react";
import { useLang } from "../lib/lang";
import { Drawer } from "../design-system";
import { submitReport } from "../lib/reports";
import { REPORT_REASONS, reportReasonLabelKey } from "../lib/reportReasons.js";

export function ReportSheet({ reporterId, reportedWorkspaceId, requestId, onClose }) {
  const { t } = useLang();
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      await submitReport({ reporterId, reportedWorkspaceId, requestId, reason, details });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer onClose={onClose}>
      <div className="sheet-title">{t.reportIssueBtn}</div>
      {sent ? (
        <div className="empty-block"><Check size={22} color="var(--forest)" /><p>{t.reportSentMsg}</p></div>
      ) : (
        <>
          <label className="field-label">{t.reportReasonLabel}</label>
          <div className="chiprow">
            {REPORT_REASONS.map((r) => (
              <button key={r} className={"chip" + (reason === r ? " chip-on" : "")} onClick={() => setReason(r)}>{t[reportReasonLabelKey(r)]}</button>
            ))}
          </div>

          <label className="field-label">{t.reportDetailsLabel}</label>
          <textarea className="textarea" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} />

          {error && <div className="fineprint" style={{ color: "#b3432f" }}>{error}</div>}
          <button className="btn-primary" disabled={busy} onClick={submit}>{t.reportSubmitBtn}</button>
        </>
      )}
    </Drawer>
  );
}
