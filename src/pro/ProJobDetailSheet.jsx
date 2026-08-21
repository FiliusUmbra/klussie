// Platform Activation Slice 2, WP 2.4's own real acceptance bar, finally reachable: a
// professional's own detail view of a booked job — none existed before this (ProJobs.jsx
// was a flat list with no drill-in at all) — showing the timeline, a direct link into the
// conversation this booking already opened (0148), and, once the scoped grant 0161/0162
// created resolves, the customer's own Location/Asset/Document twin for the property
// concerned.
//
// PROGRESSIVE DISCLOSURE, NOT A DASHBOARD — a "sent" (quoted, not yet booked) job never
// reaches this sheet at all: there is no engagement, no conversation, no twin to show, and
// ProJobs.jsx only wires onOpen for booked/completed segments. Nothing here ever asks a
// pro to understand "engagement," "workspace," or "scope" — those stay internal; what a
// pro sees is a job, a customer, and (if it exists) what that customer's home looks like.
import { useEffect, useState } from "react";
import { MessageCircle, MapPin, Wrench, FileText, Home } from "lucide-react";
import { useLang } from "../lib/lang";
import { Badge, PriceTag, Timeline, Button, Drawer } from "../design-system";
import { timelineSteps, statusPresentation } from "../lib/requestStatus.js";
import { documentTypeLabelKey } from "../lib/documents.js";
import { fetchPropertyTwin } from "../lib/propertyTwin.js";

export function ProJobDetailSheet({ job, customerName, onMessage, onClose }) {
  const { t, fmt, serviceInfo } = useLang();
  const [twin, setTwin] = useState(null);
  const [twinLoading, setTwinLoading] = useState(Boolean(job.propertyId));

  useEffect(() => {
    // No property attached to this job at all: the initial state above (twin = null,
    // twinLoading = false) is already the correct, final state — nothing to fetch, and
    // nothing to reset synchronously from inside the effect.
    if (!job.propertyId) return;

    let cancelled = false;
    fetchPropertyTwin(job.propertyId).then((result) => {
      if (!cancelled) {
        setTwin(result);
        setTwinLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [job.propertyId]);

  const info = serviceInfo(job.serviceId);
  const steps = timelineSteps(job.status);
  const status = statusPresentation(job.status);
  const myQuote = job.quotes[0];
  const hasTwinData = twin && (twin.locations.length > 0 || twin.assets.length > 0 || twin.documents.length > 0);

  return (
    <Drawer onClose={onClose}>
      <div className="sheet-title">{info.name}</div>
      <div className="sheet-sub">{customerName || t.navMyJobs}</div>

      {steps && <Timeline steps={steps.map((s) => ({ ...s, label: t[s.labelKey] }))} />}

      <div className="quote-top" style={{ marginTop: 12 }}>
        <div style={{ flex: 1 }}>
          {status.labelKey && <Badge tone={status.tone}>{t[status.labelKey]}</Badge>}
        </div>
        {myQuote && <PriceTag amount={myQuote.price} fmt={fmt} />}
      </div>

      {onMessage && (
        <Button variant="secondary" icon={MessageCircle} style={{ marginTop: 12, width: "100%" }} onClick={onMessage}>
          {t.messageCustomerBtn}
        </Button>
      )}

      <div className="section-title" style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 6 }}>
        <Home size={15} />
        {t.propertyTwinTitle}
      </div>

      {!job.propertyId && (
        <div className="empty-block"><p>{t.twinUnavailableMsg}</p></div>
      )}

      {job.propertyId && !twinLoading && !twin?.property && (
        <div className="empty-block"><p>{t.twinUnavailableMsg}</p></div>
      )}

      {job.propertyId && !twinLoading && twin?.property && !hasTwinData && (
        <div className="empty-block"><p>{t.twinNoDataMsg}</p></div>
      )}

      {job.propertyId && !twinLoading && twin?.property && hasTwinData && (
        <>
          {twin.locations.length > 0 && (
            <TwinSection icon={MapPin} label={t.twinLocationsLabel}>
              {twin.locations.map((l) => (
                <div key={l.id} className="ticket-sub">{l.name}</div>
              ))}
            </TwinSection>
          )}
          {twin.assets.length > 0 && (
            <TwinSection icon={Wrench} label={t.twinAssetsLabel}>
              {twin.assets.map((a) => (
                <div key={a.id} className="ticket-sub">
                  {a.name}
                  {(a.make || a.model) && <span style={{ color: "var(--ink-soft)" }}> — {[a.make, a.model].filter(Boolean).join(" ")}</span>}
                </div>
              ))}
            </TwinSection>
          )}
          {twin.documents.length > 0 && (
            <TwinSection icon={FileText} label={t.twinDocumentsLabel}>
              {twin.documents.map((d) => {
                const labelKey = documentTypeLabelKey(d.type_key);
                return <div key={d.id} className="ticket-sub">{labelKey ? t[labelKey] : d.type_key}</div>;
              })}
            </TwinSection>
          )}
        </>
      )}
    </Drawer>
  );
}

function TwinSection({ icon: Icon, label, children }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
        <Icon size={14} color="var(--ink-soft)" />
        {label}
      </div>
      {children}
    </div>
  );
}
