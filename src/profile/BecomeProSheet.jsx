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

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      const { workspaceId } = await becomePro({ proType, businessName, vatNumber, bio });
      onDone(workspaceId);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer onClose={onClose}>
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
      <button className="btn-primary" disabled={busy} onClick={submit}>{t.becomeProSubmit}</button>
    </Drawer>
  );
}
