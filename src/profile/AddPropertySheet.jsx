// Home foundation slice — Profile's own "Add property," the entry point that makes
// PropertySwitcher.jsx (My Home) and the multi-property read path (migration 0225)
// reachable by a real customer for the first time, not just by data an operator might
// insert directly.
//
// A short confirmation, not a multi-step flow (Modal, not Drawer — this codebase's own
// "no sliding sheets for new UI" rule, and Modal's own header: "for short confirmations,"
// which this is). Reuses createPropertyForCaller()/setPropertyAddress() unchanged — the
// exact write path MyBusinessPanel.jsx already established for a professional's own first
// property, and AddressSubForm.jsx (just extracted out of ServiceLocationField.jsx) for
// the address fields, so a second copy of that markup never has the chance to drift.
import { useState } from "react";
import { Modal } from "../design-system";
import { AddressSubForm } from "../customer/AddressSubForm.jsx";
import { EMPTY_ADDRESS, isAddressComplete } from "../customer/addressFields.js";
import { createPropertyForCaller, setPropertyAddress } from "../lib/homeInventory.js";

export function AddPropertySheet({ t, workspaceId, actorRef, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = name.trim() && isAddressComplete(address) && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    try {
      const { id: propertyId } = await createPropertyForCaller({ workspaceId, actorRef, name: name.trim() });
      await setPropertyAddress({ propertyId, ...address });
    } catch {
      setError(t.addPropertyFailed);
      setSaving(false);
      return;
    }
    // Best-effort from here — the property itself is already saved regardless of whether
    // the caller's own refresh succeeds, the same shape this codebase already holds itself
    // to everywhere else a write is followed by a refresh (e.g. Profile.jsx's own boost()).
    try {
      await onSaved();
    } catch {
      // Best-effort; the property itself already saved.
    }
    setSaving(false);
    onClose();
  };

  return (
    <Modal onClose={onClose} closeLabel={t.closeBtn}>
      <div className="sheet-title">{t.addPropertyTitle}</div>

      <label className="field-label" htmlFor="add-property-name">{t.addPropertyNameLabel}</label>
      <div className="search" style={{ marginBottom: 14 }}>
        <input
          id="add-property-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.addPropertyNamePlaceholder}
        />
      </div>

      <AddressSubForm t={t} address={address} onChange={setAddress} />

      {error && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start", marginTop: 8 }}>{error}</div>}

      <button className="btn-primary" style={{ marginTop: 14 }} disabled={!canSubmit} onClick={submit}>
        {t.addPropertySubmitBtn}
      </button>
    </Modal>
  );
}
