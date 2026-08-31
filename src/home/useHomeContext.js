// Everything the homepage needs to know, resolved once, outside the view.
//
// Moved out of the component so the panels stay presentational and so the pieces that
// are genuinely testable — greeting band, trust-signal eligibility, today's priority —
// are testable without rendering anything (ENGINEERING_STANDARDS.md, "no business
// logic in UI").
import { useEffect, useMemo, useState } from "react";
import { fetchPlatformTrustStats } from "../lib/pros";
import { knownFactsFrom } from "../lib/homeInventory.js";
import { usePropertyTwin } from "./usePropertyTwin.js";
import { pickTodayItem, activeRequests, completedWork } from "../lib/homeToday.js";
import {
  propertySummary,
  openWork,
  finishedWork,
  trustedProfessionals,
  homeHistory,
  requestsWithPossiblePhotos,
} from "../lib/homeTimeline.js";
import { interpolate } from "../lib/homeStrings.js";

const MORNING_ENDS_AT = 12;
const AFTERNOON_ENDS_AT = 18;

// Local device time, three bands — deliberately not a data-driven "personalization,"
// just the time of day. `now` is injectable so a test can pin the band without
// mocking the global clock.
export function timeGreeting(t, now = new Date()) {
  const hour = now.getHours();
  if (hour < MORNING_ENDS_AT) return t.greetMorning;
  if (hour < AFTERNOON_ENDS_AT) return t.greetAfternoon;
  return t.greetEvening;
}

// "Goedemiddag, Cathy" — and just "Goedemiddag" when no name is on the profile, since
// an empty slot reads worse than a shorter greeting.
export function greetingLine(t, fullName, now) {
  const firstName = (fullName || "").trim().split(/\s+/)[0];
  const greeting = timeGreeting(t, now);
  return firstName
    ? interpolate(t.homeGreetName, { greeting, name: firstName })
    : interpolate(t.homeGreetNoName, { greeting });
}

// Only signals with real data behind them (ADR-0011). Transparent pricing is a
// property of how quoting works, not a claim about a dataset, so it always holds;
// verified pros and the rating average appear only when the numbers exist.
export function trustItemsFrom(t, trust) {
  const items = [];
  if (trust && trust.verifiedProCount > 0) items.push(t.trustVerifiedPros);
  if (trust && trust.ratingAvg != null) items.push(`${trust.ratingAvg.toFixed(1)}★ ${t.trustAvgRating}`);
  items.push(t.trustTransparentPricing);
  return items;
}

export function useHomeContext({ t, profile, requests }) {
  const [trust, setTrust] = useState(null);
  // Platform Activation Slice 1, WP 1.10 — the physical twin (property/rooms/documents/
  // items/maintenance) is now usePropertyTwin.js's own concern, shared with ProApp.jsx's
  // "My Business" tab. See that hook's own header for why trust stayed behind here
  // instead of moving with it.
  const { workspaceId, homeProfile, propertyId, items, itemsError, maintenance, refreshItems } =
    usePropertyTwin();

  useEffect(() => {
    let cancelled = false;
    // A failed trust fetch leaves `trust` null, which simply drops the data-backed
    // items from the strip — never a broken or fabricated signal. Mount-only: trust is a
    // platform-wide signal, not something a room or item save should ever refetch.
    fetchPlatformTrustStats()
      .then((stats) => { if (!cancelled) setTrust(stats); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const today = useMemo(() => pickTodayItem(requests), [requests]);
  const active = useMemo(() => activeRequests(requests, today?.request?.id), [requests, today]);
  const previousWork = useMemo(() => completedWork(requests), [requests]);
  const knownFacts = useMemo(() => knownFactsFrom(homeProfile), [homeProfile]);

  // My Home V1: everything below is derived from requests the customer already has.
  // Nothing here reads a table that does not exist (HOME_OPERATING_SYSTEM.md §2).
  const property = useMemo(
    () => propertySummary(profile, requests, homeProfile?.property),
    [profile, requests, homeProfile]
  );
  const open = useMemo(() => openWork(requests), [requests]);
  const finished = useMemo(() => finishedWork(requests), [requests]);
  const trustedPros = useMemo(() => trustedProfessionals(requests), [requests]);
  const history = useMemo(() => homeHistory(requests), [requests]);
  const photoSources = useMemo(() => requestsWithPossiblePhotos(requests), [requests]);

  return {
    greeting: greetingLine(t, profile?.full_name),
    trustItems: trustItemsFrom(t, trust),
    homeProfile,
    knownFacts,
    today,
    activeRequests: active,
    previousWork,
    property,
    openWork: open,
    finishedWork: finished,
    trustedPros,
    history,
    photoSources,
    items,
    itemsError,
    maintenance,
    refreshItems,
    // Platform Activation Slice 1, WP 1.8 — both already resolved above; re-exposed so
    // MyItemsPanel.jsx's new write surfaces (ItemFormSheet/LocationFormSheet/
    // DocumentUploadSheet) can reach them without re-deriving workspaceId from
    // useAuth() a second time or reaching into homeProfile.property.id themselves.
    workspaceId,
    propertyId,
  };
}
