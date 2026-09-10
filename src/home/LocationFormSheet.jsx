// Adding, renaming, moving, or removing a real room (property.locations).
//
// Home Builder vertical slice — dual-mode now, matching ItemFormSheet.jsx's own
// create/edit shape: no `room` prop means "add a new room" (api.create_location(),
// unchanged from WP 1.8); a `room` prop means "this existing room," which can be
// renamed (api.rename_location()) or retired (api.retire_location()) — the two real
// gaps 0140_location_write_contract.sql's own header named and deferred, now closed by
// 0198_location_lifecycle_contract.sql.
//
// MOVE ROOM UI SLICE — THE THIRD GAP, NOW CLOSED
//
// api.reparent_location()'s own backend contract (0198, and 0047 underneath it) has
// been real, complete, and tested since Home Builder shipped rename/retire — the one
// thing missing was a picker UI, blocked on buildLocationTree() not carrying each
// node's own parent id (this file's own prior header named exactly this gap). Fixed by
// giving every tree node a scalar parentId (src/lib/homeInventory.js). Moving is its
// own independent action here, mirroring MoveItemModal's own established shape in
// ItemDetailSheet.jsx exactly (a labeled "Move" button opens a small Modal with one
// picker, confirms with its own call, closes the whole sheet on success) — never
// combined with "Save changes" the way a name edit is. Deliberately kept separate:
// combining them into one submit would mean a rename that succeeds followed by a move
// that fails leaves a real, silent partial result with no established atomic-editing
// contract to fall back on; keeping them as two genuinely independent actions (the same
// shape this exact sheet already uses for retire and "add something here") means there
// is no combined operation to leave partially done in the first place.
//
// THE DESTINATION PICKER'S OWN CLIENT-SIDE FILTER IS UX, NOT THE SECURITY BOUNDARY
//
// property.reparent_location() (0047) refuses a cross-property move and a cycle
// (moving a room under itself or its own descendant) unconditionally, server-side,
// regardless of anything filtered out here; property.reparent_location_for_caller()
// (0198) checks the caller's own membership, and — since this slice's own audit found
// and closed it (0211) — refuses a retired destination too. subtreeIds() below exists
// so a homeowner is never even OFFERED an invalid choice, not because the client is
// trusted to be the only thing enforcing it. A retired room is excluded from the picker
// for a simpler reason: property.locations_for_property() (0136/0170) never returns one
// to `rooms` in the first place, so there is nothing here to specifically filter for it.
//
// RETIRING SHOWS *WHY* IT WAS REFUSED, NOT A GENERIC FAILURE
//
// property.retire_location_for_caller() (0198) refuses with errcode
// object_not_in_prerequisite_state and a `hint` of 'active_children' or 'active_assets'
// when the room still holds something — surfaced here as the specific, plain-language
// reason ("this room still has X in it"), never a raw database message.
import { useState } from "react";
import { ArrowLeftRight, Trash2 } from "lucide-react";
import { Drawer, Modal, Button } from "../design-system";
import { createLocation, renameLocation, retireLocation, moveLocation } from "../lib/locations.js";
import { flattenLocationsForPicker, subtreeIds } from "../lib/homeInventory.js";
import { interpolate } from "../lib/homeStrings.js";

// Mirrors MoveItemModal (ItemDetailSheet.jsx) exactly: one labeled picker, a live plain-
// language summary of where the room will end up (accessible via aria-live, not just a
// sighted reading of the select's own current option), Cancel/Move actions. `room`'s own
// id and every one of its descendants (subtreeIds()) are excluded from the offered
// choices — a room can never be offered as its own new home, at any depth.
function MoveRoomModal({ t, rooms, room, busy, error, onCancel, onConfirm }) {
  // subtreeIds() already includes room.id itself once found in the tree; adding it here
  // too is a defensive no-op in the normal case, and keeps the room's own id excluded
  // even in the unreached edge case where `room` was somehow not found in `rooms`.
  const excludedIds = subtreeIds(rooms || [], room.id);
  excludedIds.add(room.id);
  const options = flattenLocationsForPicker(rooms || []).filter((opt) => !excludedIds.has(opt.id));
  const [parentId, setParentId] = useState(room.parentId || "");

  const selectedOption = parentId ? options.find((opt) => opt.id === parentId) : null;
  const summaryLocation = parentId ? (selectedOption?.name || "") : t.locationMoveTopLevel;

  return (
    <Modal onClose={onCancel}>
      <div className="sheet-title" style={{ marginTop: 0 }}>{t.locationMoveTitle}</div>
      <label className="field-label" htmlFor="location-move-parent">{t.locationMoveFieldLabel}</label>
      <div className="search" style={{ marginBottom: 8 }}>
        <select id="location-move-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">{t.locationMoveTopLevel}</option>
          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.label}</option>
          ))}
        </select>
      </div>
      <p className="fineprint" style={{ justifyContent: "flex-start", marginBottom: 14 }} role="status">
        {interpolate(t.locationMoveSummary, { location: summaryLocation })}
      </p>
      {error && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start", marginBottom: 8 }} role="alert">{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>{t.cancelBtn}</Button>
        <Button variant="primary" onClick={() => onConfirm(parentId || null)} disabled={busy}>{t.locationMoveSave}</Button>
      </div>
    </Modal>
  );
}

export function LocationFormSheet({ t, propertyId, actorRef, rooms, room, onClose, onSaved, onAddItemHere }) {
  const editing = !!room;
  const [name, setName] = useState(room?.name || "");
  const [type, setType] = useState("");
  const [parentId, setParentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmRetire, setConfirmRetire] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveError, setMoveError] = useState("");

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
    } catch {
      // A raw err.message here would be a raw Postgres error -- documents.js's own
      // header names this anti-pattern and its fix: a generic, localized message,
      // never the backend's own words. locationFormSaveFailed already existed and was
      // never actually used here.
      setError(t.locationFormSaveFailed);
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
      // Same anti-pattern/fix as submit()'s own catch above, for whatever isn't one of
      // the two specific, known refusal reasons already handled.
      else setError(t.locationRetireFailed);
      setBusy(false);
      setConfirmRetire(false);
    }
  };

  // Its own independent action, deliberately never folded into submit()'s "Save
  // changes" — see this file's own header for why. Closes the whole sheet on success,
  // matching retire()'s own convention immediately above and MoveItemModal's own
  // (ItemDetailSheet.jsx) for the identical reason: `room` is a snapshot prop, so
  // leaving this sheet open would keep showing the room under its old parent until the
  // caller re-fetches and re-opens it.
  const confirmMove = async (newParentId) => {
    setMoveError("");
    setMoveBusy(true);
    try {
      await moveLocation({ locationId: room.id, newParentId, actorRef });
      await onSaved();
      onClose();
    } catch {
      // Always the generic, translated message — matching MoveItemModal's own
      // convention exactly. The picker already excludes every invalid destination it
      // knows about; a rejection reaching here is a rare race (someone else changed the
      // tree moments ago) or a genuine transient failure, never something a raw
      // database message would explain better to a homeowner.
      setMoveError(t.locationMoveFailed);
      setMoveBusy(false);
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
          <button className="btn-secondary" style={{ marginTop: 8 }} disabled={busy} onClick={() => { setMoveError(""); setShowMove(true); }}>
            <ArrowLeftRight size={13} aria-hidden="true" /> {t.locationMoveAction}
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

      {showMove && (
        <MoveRoomModal
          t={t}
          rooms={rooms}
          room={room}
          busy={moveBusy}
          error={moveError}
          onCancel={() => setShowMove(false)}
          onConfirm={confirmMove}
        />
      )}
    </Drawer>
  );
}
