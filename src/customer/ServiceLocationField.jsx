// Beta-completion slice (0182/0185, PLATFORM_ACTIVATION_PROGRAMME.md's own Beta priority
// #1) — "select My Home, another saved property, or a one-time service location," the
// customer-side half of the founder's mandatory-disclosure-consent decision. Every request
// now needs a real property behind it: matching_requests_for_pro() (0183) reads
// municipality/property type/prep notes off it during quoting, and
// approve_location_disclosure() (0183) is what shares the exact address with the
// accepted pro later. No location, no address to ever disclose.
//
// Deliberately scoped: "another saved property" today means whatever
// fetchMyProperties() returns — real, multi-property support already exists at the
// contract level (homeInventory.js's own createPropertyForCaller() comment: "§9.1 permits
// many properties"), just not a dedicated management screen yet. This field renders
// whatever list comes back; a workspace with exactly one property (today's common case)
// simply shows one saved-property choice alongside "one-time address."
//
// Self-fetching, like RequestPhotosStrip.jsx — every request-creation surface (AiIntake,
// the manual form) gets this without threading property state through each of them.
import { useState, useEffect } from "react";
import { MapPin, Plus, Loader2 } from "lucide-react";
import { useLang } from "../lib/lang";
import { fetchMyProperties, hasConfirmedAddress } from "../lib/homeInventory.js";
import { AddressSubForm } from "./AddressSubForm.jsx";
import { EMPTY_ADDRESS, isAddressComplete } from "./addressFields.js";

/**
 * `onChange(locationPayload | null)` fires whenever the selection changes — null while
 * incomplete, so the caller (AiIntakeSheet/QuoteFormSheet) can gate its own submit button
 * on it exactly like every other required field there already does.
 */
export function ServiceLocationField({ workspaceId, onChange }) {
  const { t } = useLang();
  const [properties, setProperties] = useState(null);
  const [selectedId, setSelectedId] = useState(null); // a real property id, or "one_time"
  const [address, setAddress] = useState(EMPTY_ADDRESS);

  useEffect(() => {
    let cancelled = false;
    fetchMyProperties()
      .then((props) => { if (!cancelled) setProperties(props); })
      .catch(() => { if (!cancelled) setProperties([]); });
    return () => { cancelled = true; };
  }, [workspaceId]);

  useEffect(() => {
    if (!properties || selectedId === null) { onChange(null); return; }

    if (selectedId === "one_time") {
      onChange(isAddressComplete(address) ? { type: "one_time_address", address } : null);
      return;
    }

    const property = properties.find((p) => p.id === selectedId);
    if (!property) { onChange(null); return; }

    if (hasConfirmedAddress(property)) {
      onChange({ type: properties[0]?.id === selectedId ? "home" : "saved_property", propertyId: selectedId });
      return;
    }
    onChange(isAddressComplete(address) ? { type: "home", propertyId: selectedId, address } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties, selectedId, address]);

  const selectProperty = (id) => {
    setSelectedId(id);
    setAddress(EMPTY_ADDRESS);
  };

  if (properties === null) {
    return (
      <div className="fineprint" style={{ justifyContent: "flex-start", marginBottom: 14 }}>
        <Loader2 size={12} className="spin" /> {t.serviceLocationLoading}
      </div>
    );
  }

  const selectedProperty = properties.find((p) => p.id === selectedId);
  const needsAddressForm = selectedId === "one_time" || (selectedProperty && !hasConfirmedAddress(selectedProperty));

  return (
    <div style={{ marginBottom: 14 }}>
      <label className="field-label">{t.serviceLocationLabel}</label>
      <div className="chiprow">
        {properties.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className={"chip" + (selectedId === p.id ? " chip-on" : "")}
            onClick={() => selectProperty(p.id)}
          >
            {/* Found by code audit, 2026-09-11: marginRight was physical -- for an
                Arabic/Persian reader, the icon (still visually first, .chip's own
                display:flex already reorders per reading direction) had its gap pushed
                to its own outer edge instead of toward the label. marginInlineEnd
                always means "toward the next item," in either direction. */}
            <MapPin size={13} style={{ marginInlineEnd: 4 }} />
            {i === 0 ? t.serviceLocationHome : p.name}
          </button>
        ))}
        <button
          type="button"
          className={"chip" + (selectedId === "one_time" ? " chip-on" : "")}
          onClick={() => selectProperty("one_time")}
        >
          <Plus size={13} style={{ marginInlineEnd: 4 }} />
          {t.serviceLocationOneTime}
        </button>
      </div>

      {needsAddressForm && (
        <>
          <div className="fineprint" style={{ justifyContent: "flex-start", marginTop: 6 }}>
            {selectedId === "one_time" ? t.serviceLocationOneTimeHint : t.serviceLocationHomeNeedsAddress}
          </div>
          <AddressSubForm t={t} address={address} onChange={setAddress} />
        </>
      )}
    </div>
  );
}
