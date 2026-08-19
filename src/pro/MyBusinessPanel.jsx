// "My Business" — Professional reuse of the same physical-twin surface Customer's My
// Items already has (Platform Activation Slice 1, WP 1.10). Per the Programme's own
// framing: "the same engines, the same components... built as one activation, not two
// independently-timed ones." MyItemsPanel.jsx, ItemFormSheet.jsx, LocationFormSheet.jsx
// and DocumentUploadSheet.jsx are all reused completely unmodified below — none of them
// reference anything customer-specific, all four are already pure functions of the
// propertyId/workspaceId/ownerId props this panel gives them.
//
// OPTION B'S OWN FIRST-USE TRIGGER — THE ONE GENUINELY NEW PIECE
//
// A Professional workspace gets no property at signup (WP 1.0's own Option B, unlike
// Personal workspaces' Option A). The first time this panel resolves a real
// homeProfile with no property on it, it creates one silently — api.create_property()
// (WP 1.10's own migration) — before rendering anything else. attemptedRef, not state,
// guards against a real double-create race: refreshItems() after a successful create
// starts a NEW fetchHomeProfile() call, and until THAT resolves, homeProfile is still
// the stale pre-creation value (property: null) — a state-only guard would see that
// stale value again the instant `creating` flips back to false and fire a second
// create. A ref survives that window without itself triggering a re-run; retryToken is
// the explicit, deliberate way back in after a real failure.
import { useEffect, useRef, useState } from "react";
import { usePropertyTwin } from "../home/usePropertyTwin.js";
import { createPropertyForCaller } from "../lib/homeInventory.js";
import { MyItemsPanel } from "../home/MyItemsPanel.jsx";
import { LoadingScreen } from "../ui/Loading.jsx";

// Not locale-translated, matching workspace.create_personal_workspace()'s own "My Home"
// default (0135) — that name is a plain hardcoded literal too, not a t.* key.
const DEFAULT_PROPERTY_NAME = "My Business";

export function MyBusinessPanel({ t, fmtDate }) {
  const { ownerId, workspaceId, homeProfile, propertyId, items, itemsError, maintenance, refreshItems } =
    usePropertyTwin();
  const attemptedRef = useRef(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!workspaceId || !ownerId || homeProfile === null) return;
    if (homeProfile.property) { attemptedRef.current = false; return; }
    if (attemptedRef.current) return;
    attemptedRef.current = true;
    setCreating(true);
    setCreateError("");
    createPropertyForCaller({ workspaceId, actorRef: ownerId, name: DEFAULT_PROPERTY_NAME })
      .then(() => refreshItems())
      .catch((err) => {
        setCreateError(err.message || String(err));
        attemptedRef.current = false;
      })
      .finally(() => setCreating(false));
  }, [workspaceId, ownerId, homeProfile, refreshItems, retryToken]);

  if (homeProfile === null || creating) {
    return <LoadingScreen />;
  }

  if (createError) {
    return (
      <div className="pad">
        <div className="empty-block">
          <p>{createError}</p>
          <button type="button" className="btn-secondary" onClick={() => setRetryToken((n) => n + 1)}>
            {t.retryBtn}
          </button>
        </div>
      </div>
    );
  }

  return (
    <MyItemsPanel
      t={t}
      ownerId={ownerId}
      items={items}
      itemsError={itemsError}
      onRefresh={refreshItems}
      fmtDate={fmtDate}
      rooms={homeProfile?.rooms}
      documents={homeProfile?.documents}
      maintenance={maintenance}
      propertyId={propertyId}
      workspaceId={workspaceId}
    />
  );
}
