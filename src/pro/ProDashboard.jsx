// A professional's landing screen: their standing, then the leads matching the services
// they offer. Each lead carries everything needed to quote without opening anything —
// structured answers, the AI's read of the job, and the customer's photos.
import { ClipboardList, TrendingUp, BadgeCheck } from "lucide-react";
import { useLang } from "../lib/lang";
import { useAuth } from "../lib/auth.jsx";
import { Avatar, Badge, Rating, JobCard } from "../design-system";
import { trustScore } from "../lib/pros";
import { JobDetailsSummary, AiAnalysisSummary, RequestPhotosStrip } from "../requests";
import { PRO_TYPE_FLEXI } from "../lib/proStatus.js";

export function ProDashboard({ leads, onQuote, proInfo }) {
  const { t, fmt, serviceInfo, whenLabel } = useLang();
  const { proProfile } = useAuth();
  return (
    <div className="pad">
      <div className="hello"><div><div className="eyebrow">{t.proWelcome}</div><div className="h1">{proInfo.name}</div></div><Avatar url={proInfo.avatarUrl} initials={proInfo.initials} /></div>

      <div className="stat-row">
        <div className="stat"><div className="stat-num"><Rating value={proInfo.rating} size={12} /></div><div className="stat-label">{proInfo.rating} {t.statScore}</div></div>
        <div className="stat"><div className="stat-num">{fmt(proInfo.reviews)}</div><div className="stat-label">{t.statReviewsLabel}</div></div>
        <div className="stat"><div className="stat-num">{trustScore(proInfo)}</div><div className="stat-label">{t.trustScoreLabel}</div></div>
      </div>

      {proProfile.paused && (
        <div className="empty-block" style={{ marginBottom: 16 }}>
          <ClipboardList size={22} color="var(--ink-soft)" />
          <p><b>{t.pausedBannerTitle}</b><br />{t.pausedBannerMsg}</p>
        </div>
      )}

      <div className="section-title">{t.newLeadsTitle}</div>
      {leads.length === 0 && <div className="empty-block"><TrendingUp size={22} color="var(--ink-soft)" /><p>{t.noLeadsMsg}</p></div>}
      {leads.map((r) => {
        // Beta priority: approximate location during quoting (migration 0187) —
        // r.location.municipality, when a correlated work.requests row with a real
        // property exists, takes precedence over legacy's own free-text city. Never
        // street, postcode or coordinates — this data never reaches the client with
        // more precision than that (api.matching_request_locations_for_pro()'s own
        // select list is the enforcement, not this component).
        const municipality = r.location?.municipality || r.answers.city;
        const propertyTypeLabel = r.location?.propertyType && t[`propertyType_${r.location.propertyType}`];
        return (
          <JobCard
            key={r.id}
            title={serviceInfo(r.serviceId).name}
            badge={<Badge tone="amber">{t.newBadge}</Badge>}
            subtitle={`${whenLabel(r.answers.when)} · ${r.answers.budget ? `€${r.answers.budget}` : t.budgetFlexible}${municipality ? ` · ${municipality}` : ""}`}
            footer={<button className="btn-secondary" onClick={() => onQuote(r)}>{t.sendQuoteBtn}</button>}
          >
            <p className="quote-msg" style={{ margin: "8px 0" }}>"{r.answers.details}"</p>
            {(propertyTypeLabel || r.location?.quotePrepNotes) && (
              <p className="fineprint" style={{ justifyContent: "flex-start" }}>
                {[propertyTypeLabel, r.location?.quotePrepNotes].filter(Boolean).join(" · ")}
              </p>
            )}
            <JobDetailsSummary serviceId={r.serviceId} fields={r.answers.fields} />
            <AiAnalysisSummary aiAnalysis={r.answers.aiAnalysis} />
            <RequestPhotosStrip requestId={r.id} legacy />
          </JobCard>
        );
      })}
      {proProfile.pro_type === PRO_TYPE_FLEXI && (
        <div className="fineprint" style={{ marginTop: 4 }}><BadgeCheck size={12} /> {t.flexiHiddenNote}</div>
      )}
    </div>
  );
}
