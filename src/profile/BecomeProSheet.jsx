// Setting up a professional profile: registration type first, because it decides both
// which fields are asked for (a business has a VAT number, a flexi-job worker doesn't)
// and which work the account is later allowed to take (src/lib/proStatus.js).
import { useState } from "react";
import { useLang } from "../lib/lang";
import { useAuth } from "../lib/auth.jsx";
import { Drawer } from "../design-system";
import { PRO_TYPE_FLEXI } from "../lib/proStatus.js";

export function BecomeProSheet({ onClose, onDone }) {
  const { t } = useLang();
  const { becomePro } = useAuth();
  const [proType, setProType] = useState(PRO_TYPE_FLEXI);
  const [businessName, setBusinessName] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [bio, setBio] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Found by code audit, 2026-09-12: neither this field nor the server actually required
  // these to hold real content. pro_profiles' own `business_requires_details` check
  // constraint (0001) only asserts NOT NULL, and this component sent `businessName ||
  // null` -- a genuinely empty string does become null and does fail that constraint
  // (as a raw-error round trip, not a helpful inline one), but a single space does not:
  // `" " || null` is `" "` in JS, satisfies NOT NULL, and neither this component nor
  // api.become_pro() ever trims it. That used to let a "business" registration through
  // with a blank business name and VAT number -- and api.become_pro()'s own
  // coalesce(p_business_name, v_full_name, 'My Business') then named the new Professional
  // Workspace itself a single space, an effectively invisible workspace name everywhere
  // WorkspaceSwitcher shows it. Required here, trimmed before it ever reaches becomePro().
  const businessDetailsMissing = proType === "business" && (!businessName.trim() || !vatNumber.trim());
  const canSubmit = !businessDetailsMissing && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setError("");
    setBusy(true);
    try {
      const { workspaceId } = await becomePro({
        proType,
        businessName: businessName.trim(),
        vatNumber: vatNumber.trim(),
        bio: bio.trim(),
      });
      onDone(workspaceId);
    } catch {
      // A raw err.message here would be a raw Postgres error from api.become_pro() --
      // documents.js's own header names this anti-pattern and its fix: a generic,
      // localized message, never the backend's own words.
      setError(t.becomeProFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer onClose={onClose} closeLabel={t.closeBtn}>
      <div className="sheet-title">{t.becomeProTitle}</div>

      <label className="field-label">{t.proTypeLabel}</label>
      <div className="segmented segmented-block">
        <button className={proType === "flexi" ? "seg-on" : ""} onClick={() => setProType("flexi")}>{t.proTypeFlexi}</button>
        <button className={proType === "business" ? "seg-on" : ""} onClick={() => setProType("business")}>{t.proTypeBusiness}</button>
      </div>

      {proType === "business" && (
        <>
          <label className="field-label">{t.businessNameLabel}</label>
          <div className="search" style={{ marginBottom: 14 }}>
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </div>
          <label className="field-label">{t.vatNumberLabel}</label>
          <div className="search" style={{ marginBottom: 14 }}>
            <input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} />
          </div>
        </>
      )}

      <label className="field-label">{t.bioLabel}</label>
      <textarea className="textarea" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />

      {error && <div className="fineprint" style={{ color: "#b3432f" }}>{error}</div>}
      <button className="btn-primary" disabled={!canSubmit} onClick={submit}>{t.becomeProSubmit}</button>
    </Drawer>
  );
}
