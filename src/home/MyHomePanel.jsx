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
// Reviews and AI summaries live on their job's card ONLY — UX_TAB_SCOPE.md C4, 2026-09-29:
// "basic records are findable without scrolling through unrelated reviews or AI summaries."
// This used to also render both as two more flat, fully duplicate sections below (every
// review and every AI read a history event already carries — src/lib/homeTimeline.js's own
// homeHistory() pushes a "review" event alongside its "job" event for the same request, and
// HomeTimelineCard already renders both inline). Removed rather than kept "reachable for a
// customer who wants to read only those" (this file's own former claim) — a genuine
// duplicate is clutter, not a real alternate reading, and the spec names this scrolling
// exactly as the problem to fix.
//
// Every section renders an honest empty line when it holds nothing, and the panel as a
// whole always renders something — a brand-new account gets an invitation, never a blank
// page.
import { useState } from "react";
import { AlertTriangle, Camera, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { HomeSection } from "./panelParts.jsx";
import {
  PropertyHeader,
  PropertyHealthCard,
  HomeTimelineCard,
  ActiveWorkCard,
  TrustedProsList,
  HomePhotoGallery,
} from "./myHomeParts.jsx";
import { ProPublicProfileSheet } from "../profile/ProPublicProfileSheet.jsx";
import { LocationTree } from "./MyItemsPanel.jsx";
import { LocationFormSheet } from "./LocationFormSheet.jsx";
import { ItemAddWizard } from "./ItemAddWizard.jsx";
import { propertyHealthStatus } from "../lib/maintenance.js";

// Home Builder vertical slice — "building your home" belongs here, in My Home, not
// tucked inside My Items where a homeowner has no reason to look for it (found live:
// the only entry point was a bare, unlabeled "+" beside a "Rooms" heading in My Items).
// ADR-0008 still holds — no new bottom-nav destination — this is a new section of the
// same existing "My Home" tab, exactly the shape that ADR already sanctions.
function HomeBuilderSection({ t, homeCtx, ownerId, onAddItem }) {
  const [activeSheet, setActiveSheet] = useState(null); // null | { room: existingRoom | null }
  const { homeProfile, homeProfileError, propertyId, refreshItems } = homeCtx;
  const rooms = homeProfile?.rooms || [];
  const loading = homeProfile === null;
  const hasProperty = !!propertyId;

  // Found by code audit: usePropertyTwin()'s own fetchHomeProfile() failure used to be
  // swallowed entirely, leaving homeProfile stuck at null forever -- `loading` above
  // used to be the only thing this section checked, which read that stuck null as
  // "still loading" and showed that line permanently, with no error and no way back
  // short of reloading the whole app. Reuses the existing "still setting up your home"
  // recovery line below rather than a new one -- from a customer's point of view, "not
  // resolved yet" and "failed to resolve" both mean the same honest thing here: come
  // back soon (or tap to try now).
  if (loading && homeProfileError) {
    return (
      <section className="home-group home-builder">
        <h3 className="home-group-title">{t.homeBuilderTitle}</h3>
        <p className="home-group-empty" role="status">{t.homeBuilderNoPropertyYet}</p>
        <button type="button" className="home-panel-action" onClick={refreshItems}>{t.retryBtn}</button>
      </section>
    );
  }

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
  t, homeCtx, ownerId, serviceInfo, fmtDate, onReportProblem, onOpenRequest,
}) {
  const [openProId, setOpenProId] = useState(null);
  // null | existingRoom — opens ItemAddWizard pre-filled with that room, the direct
  // "add something to this room" next action a freshly-built room needs.
  const [addItemToRoom, setAddItemToRoom] = useState(undefined);
  // UX_TAB_SCOPE.md C4 — "photos belong with their source, with an optional gallery
  // route." Collapsed by default rather than eagerly rendered in the main scroll (the
  // spec's own "findable without scrolling through unrelated... summaries" acceptance
  // criterion applies just as much to a wall of thumbnails as to a text list); still the
  // same HomePhotoGallery, just opt-in.
  const [photosOpen, setPhotosOpen] = useState(false);
  const {
    property, openWork, trustedPros, history, photoSources, propertyId, refreshItems, maintenance,
  } = homeCtx;

  const health = propertyHealthStatus(maintenance);

  return (
    <div className="home-panel">
      <h2 className="home-panel-question">{t.myHomeQuestion}</h2>

      <PropertyHeader t={t} property={property} fmtDate={fmtDate} />

      <PropertyHealthCard t={t} health={health} />

      {/* The one action that has always worked here, and still the only way to start
          something new: hand back to the conversation (ADR-0007). */}
      <button type="button" className="home-panel-action" onClick={onReportProblem}>
        <AlertTriangle size={15} aria-hidden="true" /> {t.homeReportProblem}
      </button>

      {/* UX_TAB_SCOPE.md C4's own layout order from here: active work → rooms/items
          summary → recent history → trusted professionals. Active work used to render
          after the room builder; swapped to match — what needs a decision (open work)
          outranks what's just inventory. History and trusted pros were swapped for the
          same reason: what happened is more load-bearing than who did it. */}
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

      <HomeBuilderSection t={t} homeCtx={homeCtx} ownerId={ownerId} onAddItem={setAddItemToRoom} />

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

      <HomeSection title={t.myHomeProsTitle} emptyText={t.myHomeProsEmpty} isEmpty={trustedPros.length === 0}>
        <TrustedProsList t={t} pros={trustedPros} onOpenPro={setOpenProId} />
      </HomeSection>

      <section className="home-group">
        <button type="button" className="home-photos-toggle" onClick={() => setPhotosOpen((v) => !v)} aria-expanded={photosOpen}>
          <Camera size={15} aria-hidden="true" />
          <span className="home-group-title" style={{ margin: 0 }}>{t.myHomePhotosTitle}</span>
          {photosOpen ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
        </button>
        {photosOpen && <HomePhotoGallery t={t} sources={photoSources} />}
      </section>

      {openProId && <ProPublicProfileSheet proId={openProId} onClose={() => setOpenProId(null)} />}

      {addItemToRoom !== undefined && (
        <ItemAddWizard
          t={t}
          ownerId={ownerId}
          propertyId={propertyId}
          rooms={homeCtx.homeProfile?.rooms || []}
          initialLocationId={addItemToRoom?.id}
          onClose={() => setAddItemToRoom(undefined)}
          onSaved={refreshItems}
        />
      )}
    </div>
  );
}
