// Adding, renaming, or removing a real room (property.locations).
//
// Home Builder vertical slice — dual-mode now, matching ItemFormSheet.jsx's own
// create/edit shape: no `room` prop means "add a new room" (api.create_location(),
// unchanged from WP 1.8); a `room` prop means "this existing room," which can be
// renamed (api.rename_location()) or retired (api.retire_location()) — the two real
// gaps 0140_location_write_contract.sql's own header named and deferred, now closed by
// 0198_location_lifecycle_contract.sql.
//
// MOVING A ROOM (api.reparent_location()) IS NOT WIRED IN HERE YET, DELIBERATELY
//
// The backend contract exists and is exposed (0198) — a real, complete, tested
// capability, not a placeholder — but drawing its own picker UI needs each room's
// current parent, which buildLocationTree() (src/lib/homeInventory.js) does not carry
// on its own node shape (it only builds the children direction, not each node's own
// parent back-reference). Adding that is a real, separate piece of work, not named in
// this slice's own "at minimum" list (only rename and retire are) — recommended as a
// follow-up rather than rushed in here.
//
// RETIRING SHOWS *WHY* IT WAS REFUSED, NOT A GENERIC FAILURE
//
// property.retire_location_for_caller() (0198) refuses with errcode
// object_not_in_prerequisite_state and a `hint` of 'active_children' or 'active_assets'
// when the room still holds something — surfaced here as the specific, plain-language
// reason ("this room still has X in it"), never a raw database message.
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Drawer, Modal, Button } from "../design-system";
import { createLocation, renameLocation, retireLocation } from "../lib/locations.js";
import { flattenLocationsForPicker } from "../lib/homeInventory.js";

export function LocationFormSheet({ t, propertyId, actorRef, rooms, room, onClose, onSaved, onAddItemHere }) {
  const editing = !!room;
  const [name, setName] = useState(room?.name || "");
  const [type, setType] = useState("");
  const [parentId, setParentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmRetire, setConfirmRetire] = useState(false);

  const parentOptions = flattenLocationsForPicker(rooms || []);
  const trimmedName = name.trim();
  const canSave = trimmedName.length > 0;

  const submit = async () => {
    if (!canSave) return;
    setError("");
    setBusy(true);
    try {
      if (editing) {
        if (trimmedName !== room.name) {
          await renameLocation({ locationId: room.id, name: trimmedName, actorRef });
        }
      } else {
        await createLocation({ propertyId, parentId: parentId || null, name, type, actorRef });
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(err.message || String(err));
      setBusy(false);
    }
  };

  const retire = async () => {
    setError("");
    setBusy(true);
    try {
      await retireLocation({ locationId: room.id, actorRef });
      await onSaved();
      onClose();
    } catch (err) {
      if (err.hint === "active_children") setError(t.locationRetireBlockedChildren);
      else if (err.hint === "active_assets") setError(t.locationRetireBlockedItems);
      else setError(err.message || String(err));
      setBusy(false);
      setConfirmRetire(false);
    }
  };

  return (
    <Drawer onClose={onClose}>
      <div className="sheet-title">{editing ? t.locationEditTitle : t.locationFormAddTitle}</div>

      <label className="field-label" htmlFor="location-name">{t.locationFormNameLabel}</label>
      <div className="search" style={{ marginBottom: 14 }}>
        <input
          id="location-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.locationFormNamePlaceholder}
        />
      </div>

      {!editing && (
        <>
          <label className="field-label" htmlFor="location-type">{t.locationFormTypeLabel}</label>
          <div className="search" style={{ marginBottom: 14 }}>
            <input
              id="location-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder={t.locationFormTypePlaceholder}
            />
          </div>

          <label className="field-label" htmlFor="location-parent">{t.locationFormParentLabel}</label>
          <div className="search" style={{ marginBottom: 14 }}>
            <select id="location-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">{t.locationFormParentNone}</option>
              {parentOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </div>
        </>
      )}

      {error && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start" }}>{error}</div>}

      <button className="btn-primary" disabled={busy || !canSave} onClick={submit}>
        {editing ? t.locationSaveChanges : t.locationFormSaveNew}
      </button>

      {editing && (
        <>
          <button className="btn-secondary" style={{ marginTop: 8 }} disabled={busy} onClick={() => onAddItemHere(room)}>
            {t.locationAddItemHere}
          </button>
          <button className="btn-secondary" style={{ marginTop: 8 }} disabled={busy} onClick={() => setConfirmRetire(true)}>
            <Trash2 size={13} aria-hidden="true" /> {t.locationRemove}
          </button>
        </>
      )}

      {confirmRetire && (
        <Modal onClose={() => setConfirmRetire(false)}>
          <p style={{ marginTop: 8 }}>{t.locationRemoveConfirm}</p>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <Button variant="secondary" onClick={() => setConfirmRetire(false)}>{t.cancelBtn}</Button>
            <Button variant="primary" disabled={busy} onClick={retire}>{t.locationRemove}</Button>
          </div>
        </Modal>
      )}
    </Drawer>
  );
}
