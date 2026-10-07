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
import { TrendingUp, BadgeCheck, Pause, Play, HelpCircle, Check, Circle } from "lucide-react";
import { useLang } from "../lib/lang";
import { useAuth } from "../lib/auth.jsx";
import { Avatar, Badge, JobCard } from "../design-system";
import { JobDetailsSummary, AiAnalysisSummary, RequestPhotosStrip } from "../requests";
import { PRO_TYPE_FLEXI } from "../lib/proStatus.js";
import { updateProProfile } from "../lib/pros";
import { greetingLine } from "../home/useHomeContext.js";
import { PageTour } from "../ui/PageTour.jsx";
import { usePageTour } from "../ui/usePageTour.js";
import { requestTitle } from "../lib/requestTitle.js";

// PageTour.jsx steps (2026-10-03) — the availability control and the lead list.
const PRO_TODAY_TOUR_STEPS = [
  { id: "pro-pause", titleKey: "pageTourProTodayStep1Title", bodyKey: "pageTourProTodayStep1Body" },
  { id: "pro-leads", titleKey: "pageTourProTodayStep2Title", bodyKey: "pageTourProTodayStep2Body" },
];

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

export function ProDashboard({ leads, onQuote, proInfo, onPauseToggled, offeredServiceCount, onSetupServices, onSetupCity }) {
  const { t, serviceInfo, whenLabel } = useLang();
  const { proProfile, user, refreshProfile, profile } = useAuth();
  // New-professional setup (live review 2026-10-04, item 11): leads only ever appear for a
  // professional with at least one service AND an operating city, and the dashboard used to
  // tell a new one to "request a service as a customer" instead. `offeredServiceCount` is
  // optional so every existing caller is unaffected; the card only shows when it is known to
  // be incomplete.
  const hasServices = offeredServiceCount === undefined ? true : offeredServiceCount > 0;
  const hasCity = !!profile?.city?.trim();
  const setupIncomplete = !hasServices || !hasCity;
  const tour = usePageTour("proToday");
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
      {/* Visual-refresh direction, 2026-10-03 — the same greeting header Today has (time of
          day + first name), with the pause control as a status card instead of a bare button.
          Same toggle, same copy; only the presentation moved. */}
      <div className="hello pro-hello"><div><div className="eyebrow">{t.proWelcome}</div><div className="h1">{greetingLine(t, proInfo.name)}</div></div><div className="daily-heading-actions"><button type="button" className="icon-btn" aria-label={t.helpReplayTour} onClick={tour.replay}><HelpCircle size={18} aria-hidden="true" /></button><Avatar url={proInfo.avatarUrl} initials={proInfo.initials} /></div></div>

      {setupIncomplete && (
        <div className="pro-setup" data-testid="pro-setup">
          <div className="pro-setup-title">{t.proSetupTitle}</div>
          <ul className="pro-setup-list">
            <li className={hasServices ? "pro-setup-done" : ""}>
              {hasServices ? <Check size={15} aria-hidden="true" /> : <Circle size={15} aria-hidden="true" />}
              <span>{t.proSetupServices}</span>
              {!hasServices && onSetupServices && <button type="button" className="maintenance-row-action" onClick={onSetupServices}>{t.proSetupGoServices}</button>}
            </li>
            <li className={hasCity ? "pro-setup-done" : ""}>
              {hasCity ? <Check size={15} aria-hidden="true" /> : <Circle size={15} aria-hidden="true" />}
              <span>{t.proSetupCity}</span>
              {!hasCity && onSetupCity && <button type="button" className="maintenance-row-action" onClick={onSetupCity}>{t.proSetupGoCity}</button>}
            </li>
          </ul>
        </div>
      )}

      {proProfile.paused ? (
        <div className="pro-availability pro-availability-paused" data-tour="pro-pause" style={{ marginBottom: 16 }}>
          <span className="pro-availability-icon" aria-hidden="true"><Pause size={18} /></span>
          <p><b>{t.pausedBannerTitle}</b><br />{t.pausedBannerMsg}</p>
          <button className="btn-primary" disabled={pausing} onClick={togglePaused}><Play size={14} aria-hidden="true" /> {t.resumeProfileBtn}</button>
        </div>
      ) : (
        <button className="btn-secondary pro-pause-btn" data-tour="pro-pause" style={{ marginBottom: pauseError ? 6 : 16 }} disabled={pausing} onClick={togglePaused}>
          <Pause size={14} aria-hidden="true" /> {t.pauseProfileBtn}
        </button>
      )}
      {pauseError && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start", marginBottom: 16 }}>{pauseError}</div>}

      {tour.open && <PageTour steps={PRO_TODAY_TOUR_STEPS} onFinish={tour.finish} />}
      <div className="section-title" data-tour="pro-leads">{t.newLeadsTitle}</div>
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
            title={requestTitle(r, serviceInfo, t.navRequests)}
            badge={isNewLead(r.id) && <Badge tone="amber">{t.newBadge}</Badge>}
            subtitle={`${whenLabel(r.answers.when)} · ${r.answers.budget ? `${r.answers.aiAnalysis?.budgetIsEstimate ? "≈" : ""}€${r.answers.budget}` : t.budgetFlexible}${municipality ? ` · ${municipality}` : ""}`}
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
