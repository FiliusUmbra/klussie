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
import { AlertTriangle, Plus } from "lucide-react";
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
import { LocationTree } from "./MyItemsPanel.jsx";
import { LocationFormSheet } from "./LocationFormSheet.jsx";
import { ItemFormSheet } from "./ItemFormSheet.jsx";
import { reviewsGiven, aiSummaries } from "../lib/homeTimeline.js";

// Home Builder vertical slice — "building your home" belongs here, in My Home, not
// tucked inside My Items where a homeowner has no reason to look for it (found live:
// the only entry point was a bare, unlabeled "+" beside a "Rooms" heading in My Items).
// ADR-0008 still holds — no new bottom-nav destination — this is a new section of the
// same existing "My Home" tab, exactly the shape that ADR already sanctions.
function HomeBuilderSection({ t, homeCtx, ownerId, onAddItem }) {
  const [activeSheet, setActiveSheet] = useState(null); // null | { room: existingRoom | null }
  const { homeProfile, propertyId, refreshItems } = homeCtx;
  const rooms = homeProfile?.rooms || [];
  const loading = homeProfile === null;
  const hasProperty = !!propertyId;

  if (loading) {
    return (
      <section className="home-group home-builder">
        <h3 className="home-group-title">{t.homeBuilderTitle}</h3>
        <p className="home-group-empty">{t.homeBuilderLoading}</p>
      </section>
    );
  }

  // A real, useful recovery state, never a bare empty room list indistinguishable from
  // "you haven't added anything yet" — the two mean very different things, and only one
  // of them is fixed by adding a room.
  if (!hasProperty) {
    return (
      <section className="home-group home-builder">
        <h3 className="home-group-title">{t.homeBuilderTitle}</h3>
        <p className="home-group-empty" role="status">{t.homeBuilderNoPropertyYet}</p>
      </section>
    );
  }

  return (
    <section className="home-group home-builder">
      <h3 className="home-group-title">{t.homeBuilderTitle}</h3>

      {rooms.length === 0 ? (
        <div className="home-builder-empty">
          <p className="home-builder-empty-line">{t.homeBuilderEmptyTitle}</p>
          <p className="home-builder-empty-hint">{t.homeBuilderEmptyHint}</p>
          <button type="button" className="btn-primary" onClick={() => setActiveSheet({ room: null })}>
            <Plus size={16} aria-hidden="true" /> {t.homeBuilderAddFirstRoom}
          </button>
        </div>
      ) : (
        <>
          <LocationTree rooms={rooms} onEdit={(room) => setActiveSheet({ room })} />
          <button type="button" className="home-panel-action" style={{ marginTop: 10 }} onClick={() => setActiveSheet({ room: null })}>
            <Plus size={15} aria-hidden="true" /> {t.homeBuilderAddAnotherRoom}
          </button>
        </>
      )}

      {activeSheet && (
        <LocationFormSheet
          t={t}
          propertyId={propertyId}
          actorRef={ownerId}
          rooms={rooms}
          room={activeSheet.room}
          onClose={() => setActiveSheet(null)}
          onSaved={refreshItems}
          onAddItemHere={(room) => { setActiveSheet(null); onAddItem(room); }}
        />
      )}
    </section>
  );
}

export function MyHomePanel({
  t, homeCtx, ownerId, serviceInfo, fmtDate, onReportProblem, onOpenRequest, requests,
}) {
  const [openProId, setOpenProId] = useState(null);
  // null | existingRoom — opens ItemFormSheet pre-filled with that room, the direct
  // "add something to this room" next action a freshly-built room needs.
  const [addItemToRoom, setAddItemToRoom] = useState(undefined);
  const { property, openWork, trustedPros, history, photoSources, propertyId, refreshItems } = homeCtx;

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

      <HomeBuilderSection t={t} homeCtx={homeCtx} ownerId={ownerId} onAddItem={setAddItemToRoom} />

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

      {addItemToRoom !== undefined && (
        <ItemFormSheet
          t={t}
          ownerId={ownerId}
          propertyId={propertyId}
          rooms={homeCtx.homeProfile?.rooms || []}
          initialLocationId={addItemToRoom?.id}
          item={null}
          onClose={() => setAddItemToRoom(undefined)}
          onSaved={refreshItems}
        />
      )}
    </div>
  );
}
