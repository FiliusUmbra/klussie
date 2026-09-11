// Intake item-association slice — "which item is this about," closing the gap
// ItemDetailSheet.jsx's own header names: "work.requests.asset_id exists but nothing in
// the current intake flow ever sets it, so most real items will show History's honest
// empty state until a later slice teaches intake to ask 'which item is this about.'"
//
// UNLIKE ServiceLocationField.jsx, THIS IS NEVER REQUIRED
//
// A service location gates disclosure consent — every request needs one. Most real
// requests genuinely aren't about one tracked appliance ("unclog my drain," "paint the
// hallway"), so "not about a specific item" is a completely valid, common, honest
// answer here. This never disables the submit button the way ServiceLocationField does.
//
// SELF-FETCHING, SAME PATTERN AS ServiceLocationField.jsx
//
// Resolves the workspace's own property first (fetchMyProperties(), the same call
// ServiceLocationField already makes independently), then reads its items through the
// same three-tier fallback fetchHouseholdItems() already gives every other caller
// (property.assets when a property resolves, legacy household_items otherwise) — never
// a second, parallel item list.
//
// RENDERS NOTHING WHEN THERE IS NOTHING TO PICK FROM
//
// No loading spinner, no empty-state message — an optional field with zero real choices
// is not worth a line of UI. It appears the moment a real item does.
import { useState, useEffect } from "react";
import { Package } from "lucide-react";
import { useLang } from "../lib/lang";
import { fetchMyProperties } from "../lib/homeInventory.js";
import { fetchHouseholdItems } from "../lib/householdItems.js";

/** `onChange(assetId | null)` fires whenever the selection changes. */
export function ItemAssociationField({ ownerId, workspaceId, onChange }) {
  const { t } = useLang();
  const [items, setItems] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyProperties()
      .then((props) => fetchHouseholdItems(ownerId, workspaceId, props[0]?.id))
      .then((rows) => { if (!cancelled) setItems(rows); })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [ownerId, workspaceId]);

  useEffect(() => {
    onChange(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  if (!items || items.length === 0) return null;

  return (
    <div style={{ marginBottom: 14 }}>
      <label className="field-label">{t.itemAssociationLabel}</label>
      <div className="chiprow">
        <button
          type="button"
          className={"chip" + (selectedId === null ? " chip-on" : "")}
          onClick={() => setSelectedId(null)}
        >
          {t.itemAssociationNone}
        </button>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={"chip" + (selectedId === item.id ? " chip-on" : "")}
            onClick={() => setSelectedId(item.id)}
          >
            {/* Found by code audit, 2026-09-11: marginRight was physical -- see
                ServiceLocationField.jsx's own identical .chip icon fix, same pass. */}
            <Package size={13} style={{ marginInlineEnd: 4 }} />
            {item.name}
          </button>
        ))}
      </div>
    </div>
  );
}
