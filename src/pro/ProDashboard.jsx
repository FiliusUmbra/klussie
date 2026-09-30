// A professional's landing screen: their own availability, then the leads matching the
// services they offer. Each lead carries everything needed to quote without opening
// anything — structured answers, the AI's read of the job, and the customer's photos.
//
// UX redesign, 2026-09-28/29 — real fixes, not a relayout:
//
// 1. The rating/review/trust stat row is gone from here — moved conceptually to
//    Profile.jsx (Account), which already renders the identical TrustBadge/StatRow pair
//    for a pro's own public standing (Profile.jsx:433-453). It was genuinely duplicated
//    across both screens before this; Today now leads with the one thing this screen is
//    actually for — deciding the next useful action — not vanity metrics repeated from
//    elsewhere.
// 2. The "New" badge used to be unconditional — every lead, forever, even one seen an
//    hour ago on a previous visit. useSeenLeadIds below is a real (if minimal) fix: a
//    lead's id is remembered in this browser once its card has actually been rendered
//    to this pro, so a later visit shows the badge only for what's genuinely arrived
//    since. Deliberately not a backend column — this is real per-viewer state with no
//    cross-device or audit value, the same class of thing localStorage is for elsewhere
//    in this app (langPreference.js).
// 3. Pause/resume moved here from Profile.jsx (Account) — UX_TAB_SCOPE.md P5's own
//    instruction ("move availability to Today"). Whether new leads reach this pro at all
//    is the single most consequential thing this screen decides; burying the control in a
//    settings page a scroll away from the leads it affects was the actual bug, not a
//    layout preference.
import { useEffect, useState } from "react";
import { ClipboardList, TrendingUp, BadgeCheck } from "lucide-react";
import { useLang } from "../lib/lang";
import { useAuth } from "../lib/auth.jsx";
import { Avatar, Badge, JobCard } from "../design-system";
import { JobDetailsSummary, AiAnalysisSummary, RequestPhotosStrip } from "../requests";
import { PRO_TYPE_FLEXI } from "../lib/proStatus.js";
import { updateProProfile } from "../lib/pros";

function seenLeadsKey(proId) {
  return `klussie.seenLeadIds.${proId}`;
}

// Returns a function `isNew(id)` — true only the first time this pro's session has ever
// seen this lead id. Reads once on mount (whatever was already known from a previous
// visit), and persists the CURRENT full set back so the next visit's own "new" set
// starts from here, not from what was new relative to an even older visit.
function useSeenLeadIds(proId, leadIds) {
  const [seen] = useState(() => {
    try {
      const raw = localStorage.getItem(seenLeadsKey(proId));
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      // Private browsing, storage disabled, or corrupt JSON — every lead reads as new
      // this visit, which is honest (this browser genuinely has no memory of any
      // earlier one), not a fabricated "not new" claim.
      return new Set();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(seenLeadsKey(proId), JSON.stringify(leadIds));
    } catch {
      // Best-effort; the badge is simply wrong (everything reads "new" again) on the
      // next visit if this fails, never a crash.
    }
    // Runs once per real leads list, not per render — the effect's own job is
    // "remember what's on screen now," not "recompute `seen` from itself."
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proId, leadIds.join(",")]);

  return (id) => !seen.has(id);
}

export function ProDashboard({ leads, onQuote, proInfo, onPauseToggled }) {
  const { t, serviceInfo, whenLabel } = useLang();
  const { proProfile, user, refreshProfile } = useAuth();
  const isNewLead = useSeenLeadIds(user.id, leads.map((r) => r.id));
  const [pausing, setPausing] = useState(false);
  const [pauseError, setPauseError] = useState("");

  // Found by code audit, 2026-09-11 (Profile.jsx, moved here 2026-09-29): refreshProfile()
  // and onPauseToggled() both used to sit inside the same try as updateProProfile() itself.
  // togglePaused() is a TOGGLE, not an idempotent write — a pro who saw a false
  // togglePausedFailed and, believing their first tap never took effect, tapped Pause/Resume
  // again would flip the real, already-applied change straight back, silently leaving them
  // un-paused (still receiving new leads) while believing the opposite. Both refreshes are
  // best-effort once the real toggle is confirmed.
  const togglePaused = async () => {
    setPausing(true);
    setPauseError("");
    try {
      await updateProProfile(user.id, { paused: !proProfile.paused });
    } catch {
      setPauseError(t.togglePausedFailed);
      setPausing(false);
      return;
    }
    try {
      await refreshProfile();
    } catch {
      // Best-effort; the pause toggle itself already succeeded regardless.
    }
    try {
      if (onPauseToggled) await onPauseToggled();
    } catch {
      // Best-effort; same as refreshProfile() above.
    }
    setPausing(false);
  };

  return (
    <div className="pad">
      <div className="hello"><div><div className="eyebrow">{t.proWelcome}</div><div className="h1">{proInfo.name || t.proFallbackName}</div></div><Avatar url={proInfo.avatarUrl} initials={proInfo.initials} /></div>

      {proProfile.paused ? (
        <div className="empty-block" style={{ marginBottom: 16 }}>
          <ClipboardList size={22} color="var(--ink-soft)" />
          <p><b>{t.pausedBannerTitle}</b><br />{t.pausedBannerMsg}</p>
          <button className="btn-primary" disabled={pausing} onClick={togglePaused}>{t.resumeProfileBtn}</button>
        </div>
      ) : (
        <button className="btn-secondary" style={{ marginBottom: pauseError ? 6 : 16 }} disabled={pausing} onClick={togglePaused}>
          {t.pauseProfileBtn}
        </button>
      )}
      {pauseError && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start", marginBottom: 16 }}>{pauseError}</div>}

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
            badge={isNewLead(r.id) && <Badge tone="amber">{t.newBadge}</Badge>}
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
