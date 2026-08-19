// The physical twin — property, rooms, documents, items and maintenance — resolved once,
// for whichever workspace is currently active.
//
// Platform Activation Slice 1, WP 1.10 — extracted out of useHomeContext.js so
// ProApp.jsx's own "My Business" tab can reuse the exact same read/write surface
// MyItemsPanel.jsx already gives the customer, per the Programme's own framing: "the
// same engines, the same components... built as one activation." useHomeContext.js now
// calls this hook internally and spreads its own result; nothing about the customer-
// facing shape changes — the fetches below are the identical ones that lived inline
// there before this extraction.
//
// TRUST STATS STAYED BEHIND, DELIBERATELY
//
// useHomeContext.js's own `trust`/`trustItems` (verified-pro count, rating average) are
// a customer-facing marketing signal about the PLATFORM, not a fact about a property or
// workspace — a professional's own "My Business" tab has no reason to carry it. Splitting
// it out here is also an incidental correction: trust shared one effect with homeProfile
// before this, which meant WP 1.8's own reloadToken addition made trust refetch every
// time a room or item was added, a coupling that was never intended. useHomeContext.js
// now fetches trust in its own effect, mount-only again, as it was before that coupling.
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import { fetchHomeProfile } from "../lib/homeInventory.js";
import { fetchHouseholdItems } from "../lib/householdItems.js";
import { fetchMaintenanceObligations } from "../lib/maintenance.js";

export function usePropertyTwin() {
  const { profile, activeWorkspace } = useAuth();
  const ownerId = profile?.id;
  const workspaceId = activeWorkspace?.workspace_id;

  const [homeProfile, setHomeProfile] = useState(null);
  // null means "not loaded yet" and [] means "genuinely nothing recorded" — My Items
  // renders a different thing for each, so they must not collapse into one value.
  const [items, setItems] = useState(null);
  const [itemsError, setItemsError] = useState(null);
  const [maintenance, setMaintenance] = useState(null);

  // Items/homeProfile/maintenance all reload on the same token rather than by calling a
  // fetch function directly, so each read lives in one effect with one cancellation
  // path. `refreshItems` only asks for another pass; it never sets state itself.
  const [reloadToken, setReloadToken] = useState(0);
  const refreshItems = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetchHomeProfile()
      .then((p) => { if (!cancelled) setHomeProfile(p); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [reloadToken]);

  const propertyId = homeProfile?.property?.id;

  useEffect(() => {
    if (!ownerId) return undefined;
    let cancelled = false;
    fetchHouseholdItems(ownerId, workspaceId, propertyId)
      .then((rows) => { if (!cancelled) { setItems(rows); setItemsError(null); } })
      // Surfaced rather than swallowed: an inventory that silently shows nothing after a
      // failed read looks exactly like an inventory nobody filled in, and would invite
      // entering everything a second time.
      .catch((err) => { if (!cancelled) setItemsError(err.message || String(err)); });
    return () => { cancelled = true; };
    // propertyId resolves shortly after mount (a separate effect, above); this intentionally
    // re-fetches once it does, the same way a resolved workspaceId already re-fetches under
    // Epic 03 WP11 — both are "add without switching" until the value exists, then switch.
  }, [ownerId, workspaceId, propertyId, reloadToken]);

  useEffect(() => {
    if (!workspaceId) return undefined;
    let cancelled = false;
    fetchMaintenanceObligations(workspaceId).then((rows) => {
      if (!cancelled) setMaintenance(rows);
    });
    return () => { cancelled = true; };
  }, [workspaceId, reloadToken]);

  return {
    ownerId,
    workspaceId,
    homeProfile,
    propertyId,
    items,
    itemsError,
    maintenance,
    refreshItems,
  };
}
