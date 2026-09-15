// Extracted out of ServiceLocationField.jsx (Home foundation slice) so Profile's own
// "Add property" (AddPropertySheet.jsx) can reuse the identical street/house
// number/postcode/municipality/property-type/quote-prep-notes fields, instead of a second
// copy of this markup drifting out of sync with the request-flow version. PROPERTY_TYPES
// lives in addressFields.js, a plain .js sibling — see that file's own header for why.
import { PROPERTY_TYPES } from "./addressFields.js";

export function AddressSubForm({ t, address, onChange }) {
  const set = (key) => (e) => onChange({ ...address, [key]: e.target.value });
  return (
    <div className="job-field" style={{ marginTop: 8 }}>
      <div className="search" style={{ marginBottom: 8 }}>
        <input aria-label={t.addressStreetLabel} placeholder={t.addressStreetLabel} value={address.street} onChange={set("street")} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <div className="search" style={{ flex: 2 }}>
          <input aria-label={t.addressHouseNumberLabel} placeholder={t.addressHouseNumberLabel} value={address.houseNumber} onChange={set("houseNumber")} />
        </div>
        <div className="search" style={{ flex: 3 }}>
          <input aria-label={t.addressPostcodeLabel} placeholder={t.addressPostcodeLabel} value={address.postcode} onChange={set("postcode")} />
        </div>
      </div>
      <div className="search" style={{ marginBottom: 10 }}>
        <input aria-label={t.addressMunicipalityLabel} placeholder={t.addressMunicipalityLabel} value={address.municipality} onChange={set("municipality")} />
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
        aria-label={t.addressQuotePrepNotesPlaceholder}
        placeholder={t.addressQuotePrepNotesPlaceholder}
        value={address.quotePrepNotes}
        onChange={set("quotePrepNotes")}
      />
    </div>
  );
}
