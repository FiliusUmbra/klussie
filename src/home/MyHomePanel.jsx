// "Mijn woning" V1 — the customer's property, as a record of what has actually happened
// to it.
//
// This replaces the placeholder that showed six empty headings and a note saying klussie
// did not save anything yet. That note was true about rooms and documents and wrong about
// everything else: HOME_OPERATING_SYSTEM.md §2 is explicit that History and People "aren't
// hypothetical — every completed request, quote, and review already sitting in the
// database is a home event." My Home's job in those groups is surfacing what is real.
//
// What is shown, and where each piece comes from — all of it via src/lib/homeTimeline.js,
// none of it from a table that does not exist:
//
//   Property information   → the customer's own profile, plus counts of their requests
//   Active requests        → requests still in flight
//   Trusted professionals  → professionals whose booked job actually finished
//   Home history           → finished jobs and the reviews written about them
//   Recent completed jobs  ┐
//   Reviews                ├─ carried on the timeline card of the job they belong to,
//   AI summaries           ┘  rather than as three more flat lists
//   Uploaded photos        → service_request_photos, gathered across every request
//
// Reviews and AI summaries live on their job's card on purpose. The brief asks for a calm
// timeline rather than a dashboard, and a review detached from the work it describes is a
// row in a table; attached to it, it is the end of a story. Both remain reachable as their
// own sections below for a customer who wants to read only those.
//
// Every section renders an honest empty line when it holds nothing, and the panel as a
// whole always renders something — a brand-new account gets an invitation, never a blank
// page.
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { HomeSection } from "./panelParts.jsx";
import {
  PropertyHeader,
  HomeTimelineCard,
  ActiveWorkCard,
  TrustedProsList,
  HomePhotoGallery,
  ReviewRow,
} from "./myHomeParts.jsx";
import { ProPublicProfileSheet } from "../profile/ProPublicProfileSheet.jsx";
import { reviewsGiven, aiSummaries } from "../lib/homeTimeline.js";

export function MyHomePanel({
  t, homeCtx, serviceInfo, fmtDate, onReportProblem, onOpenRequest, requests,
}) {
  const [openProId, setOpenProId] = useState(null);
  const { property, openWork, trustedPros, history, photoSources } = homeCtx;

  const reviews = reviewsGiven(requests);
  const analyses = aiSummaries(requests);

  return (
    <div className="home-panel">
      <h2 className="home-panel-question">{t.myHomeQuestion}</h2>

      <PropertyHeader t={t} property={property} fmtDate={fmtDate} />

      {/* The one action that has always worked here, and still the only way to start
          something new: hand back to the conversation (ADR-0007). */}
      <button type="button" className="home-panel-action" onClick={onReportProblem}>
        <AlertTriangle size={15} aria-hidden="true" /> {t.homeReportProblem}
      </button>

      <HomeSection title={t.myHomeActiveTitle} emptyText={t.myHomeActiveEmpty} isEmpty={openWork.length === 0}>
        <ul className="home-timeline">
          {openWork.map((request) => (
            <ActiveWorkCard
              key={request.id}
              t={t}
              request={request}
              serviceInfo={serviceInfo}
              fmtDate={fmtDate}
              onOpenRequest={onOpenRequest}
            />
          ))}
        </ul>
      </HomeSection>

      <HomeSection title={t.myHomeProsTitle} emptyText={t.myHomeProsEmpty} isEmpty={trustedPros.length === 0}>
        <TrustedProsList t={t} pros={trustedPros} onOpenPro={setOpenProId} />
      </HomeSection>

      <HomeSection title={t.myHomeHistoryTitle} emptyText={t.myHomeHistoryEmpty} isEmpty={history.length === 0}>
        <ul className="home-timeline">
          {history.map((event) => (
            <HomeTimelineCard
              key={event.id}
              t={t}
              event={event}
              serviceInfo={serviceInfo}
              fmtDate={fmtDate}
              onOpenRequest={onOpenRequest}
            />
          ))}
        </ul>
      </HomeSection>

      <HomeSection title={t.myHomeReviewsTitle} emptyText={t.myHomeReviewsEmpty} isEmpty={reviews.length === 0}>
        <ul className="home-reviews">
          {reviews.map((entry) => (
            <ReviewRow key={entry.id} serviceInfo={serviceInfo} entry={entry} />
          ))}
        </ul>
      </HomeSection>

      <HomeSection title={t.myHomeAiTitle} emptyText={t.myHomeAiEmpty} isEmpty={analyses.length === 0}>
        <ul className="home-ai-list">
          {analyses.map((entry) => (
            <li key={entry.id} className="home-ai-row">
              <span className="home-ai-service">{serviceInfo(entry.serviceId).name}</span>
              {entry.analysis.possibleCauses?.length > 0 && (
                <p className="home-ai-line">{t.aiPossibleCausesLabel}: {entry.analysis.possibleCauses.join(" · ")}</p>
              )}
              {entry.analysis.recommendedMaterials?.length > 0 && (
                <p className="home-ai-line">{t.aiRecommendedMaterialsLabel}: {entry.analysis.recommendedMaterials.join(" · ")}</p>
              )}
            </li>
          ))}
        </ul>
      </HomeSection>

      {/* The gallery decides its own emptiness — photos are fetched per request behind
          signed URLs, so nothing above it can know the count in advance. */}
      <section className="home-group">
        <h3 className="home-group-title">{t.myHomePhotosTitle}</h3>
        <HomePhotoGallery t={t} sources={photoSources} />
      </section>

      {openProId && <ProPublicProfileSheet proId={openProId} onClose={() => setOpenProId(null)} />}
    </div>
  );
}
