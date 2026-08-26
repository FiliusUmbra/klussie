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

const PROPERTY_TYPES = ["apartment", "house", "commercial", "other"];

function AddressSubForm({ t, address, onChange }) {
  const set = (key) => (e) => onChange({ ...address, [key]: e.target.value });
  return (
    <div className="job-field" style={{ marginTop: 8 }}>
      <div className="search" style={{ marginBottom: 8 }}>
        <input placeholder={t.addressStreetLabel} value={address.street} onChange={set("street")} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <div className="search" style={{ flex: 2 }}>
          <input placeholder={t.addressHouseNumberLabel} value={address.houseNumber} onChange={set("houseNumber")} />
        </div>
        <div className="search" style={{ flex: 3 }}>
          <input placeholder={t.addressPostcodeLabel} value={address.postcode} onChange={set("postcode")} />
        </div>
      </div>
      <div className="search" style={{ marginBottom: 10 }}>
        <input placeholder={t.addressMunicipalityLabel} value={address.municipality} onChange={set("municipality")} />
      </div>
      <div className="job-field-label" style={{ marginBottom: 4 }}>{t.addressPropertyTypeLabel}</div>
      <div className="chiprow" style={{ marginBottom: 10 }}>
        {PROPERTY_TYPES.map((pt) => (
          <button
            key={pt}
            type="button"
            className={"chip" + (address.propertyType === pt ? " chip-on" : "")}
            onClick={() => onChange({ ...address, propertyType: pt })}
          >
            {t[`propertyType_${pt}`]}
          </button>
        ))}
      </div>
      <textarea
        className="textarea"
        rows={2}
        placeholder={t.addressQuotePrepNotesPlaceholder}
        value={address.quotePrepNotes}
        onChange={set("quotePrepNotes")}
      />
    </div>
  );
}

const EMPTY_ADDRESS = { street: "", houseNumber: "", postcode: "", municipality: "", propertyType: null, quotePrepNotes: "" };

function isAddressComplete(address) {
  return Boolean(address.street.trim() && address.postcode.trim() && address.municipality.trim());
}

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
            <MapPin size={13} style={{ marginRight: 4 }} />
            {i === 0 ? t.serviceLocationHome : p.name}
          </button>
        ))}
        <button
          type="button"
          className={"chip" + (selectedId === "one_time" ? " chip-on" : "")}
          onClick={() => selectProperty("one_time")}
        >
          <Plus size={13} style={{ marginRight: 4 }} />
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
