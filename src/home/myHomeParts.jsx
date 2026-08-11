// The pieces My Home is built from: the property header, a timeline card, the trusted-pro
// list, and the photo gallery.
//
// Split out of MyHomePanel.jsx so that file stays a composition and each piece stays under
// the size where it needs scrolling to read (ENGINEERING_STANDARDS.md).
//
// Everything here is presentational. What is real and what is absent was already decided
// by src/lib/homeTimeline.js; these components render one or the other and never guess.
import { MapPin, Clock, ChevronRight, Camera } from "lucide-react";
import { useState, useEffect } from "react";
import { Avatar, Rating } from "../design-system";
import { fetchRequestPhotos } from "../lib/requestPhotos";
import { interpolate } from "../lib/homeStrings.js";
import { statusPresentation } from "../lib/requestStatus.js";

/**
 * What klussie knows about the property, as a calm header rather than a stat dashboard.
 *
 * A brand-new account gets a sentence inviting them to start, not an empty card with three
 * zeroes in it — the brief's "never show a blank page", and the difference between a
 * record that hasn't begun and a product that looks broken.
 */
export function PropertyHeader({ t, property, fmtDate }) {
  if (property.isEmpty) {
    return (
      <div className="property-header property-header-empty">
        <p className="property-empty-line">{t.myHomeNoPropertyYet}</p>
      </div>
    );
  }

  return (
    <div className="property-header">
      <div className="property-facts">
        {property.city && (
          <span className="property-fact"><MapPin size={13} aria-hidden="true" /> {property.city}</span>
        )}
        {property.since && (
          <span className="property-fact">
            <Clock size={13} aria-hidden="true" /> {interpolate(t.myHomeKnownSince, { date: fmtDate(property.since) })}
          </span>
        )}
      </div>
      {property.totalJobs > 0 && (
        <p className="property-summary-line">
          {interpolate(t.myHomeJobsSummary, { total: property.totalJobs, completed: property.completedJobs })}
        </p>
      )}
    </div>
  );
}

/**
 * One moment in the home's history.
 *
 * `event.kind` is "job" or "review" — the same request can produce both, because they
 * happened at different times and mean different things to the household. A job card
 * carries whatever else is genuinely attached to it: the professional who did it, the AI's
 * read of the problem, and the photos the customer took.
 */
export function HomeTimelineCard({ t, event, serviceInfo, fmtDate, onOpenRequest }) {
  const { request } = event;
  const analysis = request.answers?.aiAnalysis;
  const hasAnalysis = analysis && (analysis.possibleCauses?.length > 0 || analysis.recommendedMaterials?.length > 0);
  const bookedQuote = request.quotes?.find((q) => q.proId === request.bookedProId);

  return (
    <li className="timeline-card-wrap">
      <span className="timeline-card-dot" aria-hidden="true" />
      <button type="button" className="timeline-card" onClick={() => onOpenRequest(request.id)}>
        <div className="timeline-card-head">
          <span className="timeline-card-title">{serviceInfo(request.serviceId).name}</span>
          <span className="timeline-card-date">{fmtDate(request.createdAt)}</span>
        </div>

        {event.kind === "review" ? (
          <div className="timeline-card-review">
            <Rating value={request.review.stars} size={12} />
            <p className="timeline-card-quote">"{request.review.text}"</p>
          </div>
        ) : (
          <>
            {bookedQuote?.pro && (
              <span className="timeline-card-pro">
                <Avatar url={bookedQuote.pro.avatarUrl} initials={bookedQuote.pro.initials} />
                <span>{interpolate(t.myHomeDoneBy, { name: bookedQuote.pro.name })}</span>
              </span>
            )}
            {request.answers?.details && (
              <p className="timeline-card-detail">"{request.answers.details}"</p>
            )}
            {hasAnalysis && (
              <p className="timeline-card-ai">
                {t.myHomeAiRead}: {(analysis.possibleCauses || analysis.recommendedMaterials).slice(0, 2).join(" · ")}
              </p>
            )}
          </>
        )}
        <ChevronRight className="timeline-card-chevron" size={15} aria-hidden="true" />
      </button>
    </li>
  );
}

/** A request still in progress. Same card language as history, with its live status. */
export function ActiveWorkCard({ t, request, serviceInfo, fmtDate, onOpenRequest }) {
  const { labelKey } = statusPresentation(request.status);
  return (
    <li className="timeline-card-wrap timeline-card-active">
      <span className="timeline-card-dot" aria-hidden="true" />
      <button type="button" className="timeline-card" onClick={() => onOpenRequest(request.id)}>
        <div className="timeline-card-head">
          <span className="timeline-card-title">{serviceInfo(request.serviceId).name}</span>
          <span className="timeline-card-date">{fmtDate(request.createdAt)}</span>
        </div>
        <span className="timeline-card-status">{labelKey ? t[labelKey] : request.status}</span>
        <ChevronRight className="timeline-card-chevron" size={15} aria-hidden="true" />
      </button>
    </li>
  );
}

/**
 * The professionals this household has actually worked with.
 *
 * The job count is the point — it is what turns a marketplace match into "the family's
 * plumber" (HOME_OPERATING_SYSTEM.md §5), and it is a real count of finished jobs, not a
 * loyalty score klussie invented.
 */
export function TrustedProsList({ t, pros, onOpenPro }) {
  return (
    <ul className="trusted-pros">
      {pros.map(({ pro, jobCount }) => (
        <li key={pro.id}>
          <button type="button" className="trusted-pro" onClick={() => onOpenPro(pro.id)}>
            <Avatar url={pro.avatarUrl} initials={pro.initials} />
            <span className="trusted-pro-text">
              <span className="trusted-pro-name">{pro.name}</span>
              <span className="trusted-pro-count">
                {jobCount === 1 ? t.myHomeOneJobTogether : interpolate(t.myHomeJobsTogether, { count: jobCount })}
              </span>
            </span>
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Every photo the household has attached to a job, as one gallery.
 *
 * Photos live behind signed URLs per request (src/lib/requestPhotos.js), so this fetches
 * across the requests it was given and flattens the result. A request that turns out to
 * have none simply contributes nothing — which is why this component decides its own
 * emptiness rather than being told, and reports it upward through `onLoaded`.
 */
export function HomePhotoGallery({ t, sources }) {
  const [photos, setPhotos] = useState(null);
  // One string, so the effect re-runs when the set of requests changes rather than on
  // every render that hands it a fresh array.
  const sourceKey = sources.map((s) => s.id).join(",");

  useEffect(() => {
    if (!sourceKey) return;
    let cancelled = false;
    // A request whose photos fail to load contributes none rather than failing the
    // gallery — one unreachable request should not blank the whole wall.
    Promise.all(sources.map((s) => fetchRequestPhotos(s.id).catch(() => [])))
      .then((results) => { if (!cancelled) setPhotos(results.flat()); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  // Derived rather than stored: with no requests there is nothing to fetch and nothing to
  // wait for, so this is a render-time answer and never a state update.
  if (!sourceKey) return <p className="home-group-empty">{t.myHomePhotosEmpty}</p>;
  if (photos === null) return <p className="home-group-empty">{t.myHomePhotosLoading}</p>;
  if (photos.length === 0) return <p className="home-group-empty">{t.myHomePhotosEmpty}</p>;

  return (
    <div className="home-photo-grid">
      {photos.map((photo) => (
        <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="home-photo">
          {photo.url ? <img src={photo.url} alt="" /> : <span className="home-photo-missing" aria-hidden="true"><Camera size={16} /></span>}
        </a>
      ))}
    </div>
  );
}

/** A review the household wrote, outside the timeline — used by the reviews section. */
export function ReviewRow({ serviceInfo, entry }) {
  return (
    <li className="home-review-row">
      <span className="home-review-service">{serviceInfo(entry.serviceId).name}</span>
      <Rating value={entry.review.stars} size={12} />
      <p className="timeline-card-quote">"{entry.review.text}"</p>
    </li>
  );
}
