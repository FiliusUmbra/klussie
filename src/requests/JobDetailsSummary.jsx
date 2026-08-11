// The structured answers on a request, as a compact label:value list — shown to both the
// customer (their own request) and professionals (leads, quote review) alongside the
// freeform details text.
//
// Which rows exist is decided by src/lib/serviceFields.js; this only renders them.
import { useLang } from "../lib/lang";
import { jobDetailRows } from "../lib/serviceFields.js";

export function JobDetailsSummary({ serviceId, fields }) {
  const { t } = useLang();
  const rows = jobDetailRows(serviceId, fields, t);
  if (rows.length === 0) return null;
  return (
    <div className="job-details-summary">
      {rows.map((r) => (
        <div key={r.label} className="job-details-row"><span>{r.label}</span><b>{r.value}</b></div>
      ))}
    </div>
  );
}
