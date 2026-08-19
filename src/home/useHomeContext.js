// Everything the homepage needs to know, resolved once, outside the view.
//
// Moved out of the component so the panels stay presentational and so the pieces that
// are genuinely testable — greeting band, trust-signal eligibility, today's priority —
// are testable without rendering anything (ENGINEERING_STANDARDS.md, "no business
// logic in UI").
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import { fetchPlatformTrustStats } from "../lib/pros";
import { fetchHomeProfile, knownFactsFrom } from "../lib/homeInventory.js";
import { fetchHouseholdItems } from "../lib/householdItems.js";
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
  const [homeProfile, setHomeProfile] = useState(null);
  // null means "not loaded yet" and [] means "genuinely nothing recorded" — My Items
  // renders a different thing for each, so they must not collapse into one value.
  const [items, setItems] = useState(null);
  const [itemsError, setItemsError] = useState(null);
  const ownerId = profile?.id;
  // Epic 03 WP11 — see fetchHouseholdItems for the fallback this depends on.
  const { activeWorkspace } = useAuth();
  const workspaceId = activeWorkspace?.workspace_id;

  useEffect(() => {
    let cancelled = false;
    // A failed trust fetch leaves `trust` null, which simply drops the data-backed
    // items from the strip — never a broken or fabricated signal.
    fetchPlatformTrustStats()
      .then((stats) => { if (!cancelled) setTrust(stats); })
      .catch(() => {});
    fetchHomeProfile()
      .then((p) => { if (!cancelled) setHomeProfile(p); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Items reload on a token rather than by calling a fetch function directly, so the
  // read lives in one effect with one cancellation path. `refreshItems` only asks for
  // another pass; it never sets item state itself.
  const [reloadToken, setReloadToken] = useState(0);
  const refreshItems = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    fetchHouseholdItems(ownerId, workspaceId)
      .then((rows) => { if (!cancelled) { setItems(rows); setItemsError(null); } })
      // Surfaced rather than swallowed: an inventory that silently shows nothing after a
      // failed read looks exactly like an inventory the customer never filled in, and
      // would invite them to enter everything a second time.
      .catch((err) => { if (!cancelled) setItemsError(err.message || String(err)); });
    return () => { cancelled = true; };
  }, [ownerId, workspaceId, reloadToken]);

  const today = useMemo(() => pickTodayItem(requests), [requests]);
  const active = useMemo(() => activeRequests(requests, today?.request?.id), [requests, today]);
  const previousWork = useMemo(() => completedWork(requests), [requests]);
  const knownFacts = useMemo(() => knownFactsFrom(homeProfile), [homeProfile]);

  // My Home V1: everything below is derived from requests the customer already has.
  // Nothing here reads a table that does not exist (HOME_OPERATING_SYSTEM.md §2).
  const property = useMemo(() => propertySummary(profile, requests), [profile, requests]);
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
    refreshItems,
  };
}
