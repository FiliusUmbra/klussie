// Every request the customer has made, newest handling first. The status badge and the
// quote count are the two things worth seeing without opening anything.
import { ClipboardList, ChevronRight, Clock } from "lucide-react";
import { useLang } from "../lib/lang";
import { JobCard } from "../design-system";
import { StatusPill } from "../requests";

export function RequestsList({ requests, onOpen }) {
  const { t, fmtDate, serviceInfo, whenLabel } = useLang();
  return (
    <div className="pad">
      <div className="h1" style={{ marginBottom: 14 }}>{t.myRequestsTitle}</div>
      {requests.length === 0 && (
        <div className="empty-block"><ClipboardList size={26} color="var(--ink-soft)" /><p>{t.noRequestsYet}</p></div>
      )}
      {requests.map((r) => (
        <JobCard
          key={r.id}
          onClick={() => onOpen(r.id)}
          title={serviceInfo(r.serviceId).name}
          badge={<StatusPill status={r.status} />}
          subtitle={`${whenLabel(r.answers.when)} · ${fmtDate(r.createdAt)}`}
          footer={
            <>
              {r.status === "collecting" && <span className="waiting"><Clock size={12} /> {t.waitingForQuotes}</span>}
              {r.status !== "collecting" && <span>{r.quotes.length} {t.quotesReceived}</span>}
              <ChevronRight size={16} color="var(--ink-soft)" />
            </>
          }
        />
      ))}
    </div>
  );
}
