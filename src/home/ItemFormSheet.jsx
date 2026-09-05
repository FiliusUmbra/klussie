// Adding or editing something the household owns.
//
// Eight fields, one of them required. That asymmetry is the whole design: a person often
// genuinely does not know the brand of the boiler that came with the house, and a form
// that refuses to save until they do teaches them to type something plausible instead —
// which would poison the record this table exists to be. Only the name is asked for.
//
// The photo is uploaded after the row exists, because storage paths are keyed by item id.
// A failed upload therefore leaves a real item without a picture rather than losing the
// whole entry.
//
// Platform Activation Slice 1, WP 1.8 — TWO WRITE PATHS, CHOSEN BY WHETHER A REAL
// PROPERTY EXISTS
//
// `propertyId` present means the real contract (api.create_asset()/update_asset()/
// retire_asset(), WP 1.4) is used — every account WP 1.0 provisions. Its absence falls
// back to the legacy household_items functions, the same two-tier shape
// fetchHouseholdItems() already established for reads. "Delete" on the real path is
// retire_asset() (active -> retired, never a hard delete) rather than deleteHouseholdItem
// — api.my_assets() (0054) already excludes retired assets, so the item disappears from
// this list exactly as a delete would, while its history is kept.
//
// Home Builder slice — THE ROOM FIELD IS A REAL PICKER ON CREATE, UNCHANGED FREE TEXT ON
// EDIT
//
// property.create_asset() always accepted a real location_id; only this form ever
// hardcoded it to null (see createAsset()'s own header). Creating now offers the
// customer's own actual rooms, when any real ones exist, alongside the free-text field
// for anyone without one yet (or the legacy path, which has no rooms concept at all).
// Editing keeps today's behaviour exactly as it was — property.update_asset() has no
// location_id parameter yet, a real, separate gap this slice does not extend (see
// householdItems.js's own note), so changing which real room an item sits in is not a
// promise this form can keep once the row already exists.
import { useState, useRef } from "react";
import { Camera, X, Trash2 } from "lucide-react";
import { Drawer, Modal, Button } from "../design-system";
import { ITEM_CATEGORIES, SUGGESTED_ROOMS, DEFAULT_ITEM_CATEGORY, canSaveItem } from "../lib/itemCategories.js";
import { createHouseholdItem, updateHouseholdItem, setHouseholdItemPhoto, deleteHouseholdItem, createAsset, updateAsset, retireAsset } from "../lib/householdItems.js";
import { flattenLocationsForPicker } from "../lib/homeInventory.js";

export function ItemFormSheet({ t, ownerId, propertyId, rooms, initialLocationId, item, onClose, onSaved }) {
  const editing = !!item;
  // The caller's own auth id doubles as ADR-0019's actor_ref — public.profiles.id
  // references auth.users.id directly (0001), so ownerId already IS that value; no
  // separate prop is threaded down just to carry the same id under a second name.
  const usingRealContract = !!propertyId;
  const actorRef = ownerId;
  const roomOptions = flattenLocationsForPicker(rooms || []);
  const initialRoomOption = roomOptions.find((opt) => opt.id === initialLocationId);
  const [name, setName] = useState(item?.name || "");
  const [category, setCategory] = useState(item?.category || DEFAULT_ITEM_CATEGORY);
  const [room, setRoom] = useState(item?.room || initialRoomOption?.name || "");
  const [locationId, setLocationId] = useState(editing ? null : initialLocationId || "");
  const [brand, setBrand] = useState(item?.brand || "");
  const [model, setModel] = useState(item?.model || "");
  const [purchasedOn, setPurchasedOn] = useState(item?.purchasedOn || "");
  const [notes, setNotes] = useState(item?.notes || "");
  // A picked file is held until save so an abandoned form uploads nothing.
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(item?.photoUrl || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const photoInputRef = useRef(null);

  const pickPhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (photoPreview && photoFile) URL.revokeObjectURL(photoPreview);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const submit = async () => {
    if (!canSaveItem({ name })) return;
    setError("");
    setBusy(true);
    try {
      const fields = { name, category, room, brand, model, purchasedOn, notes };
      if (usingRealContract) {
        if (editing) {
          await updateAsset(item.id, { ownerId, actorRef, previousPhotoPath: item.photoPath, photoFile, ...fields });
        } else {
          await createAsset({ propertyId, ownerId, actorRef, locationId: locationId || null, photoFile, ...fields });
        }
      } else {
        const saved = editing
          ? await updateHouseholdItem(item.id, { ownerId, ...fields })
          : await createHouseholdItem({ ownerId, ...fields });
        if (photoFile) {
          await setHouseholdItemPhoto(saved.id, ownerId, photoFile, item?.photoPath || null);
        }
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setError("");
    setBusy(true);
    try {
      if (usingRealContract) {
        await retireAsset(item.id, actorRef);
      } else {
        await deleteHouseholdItem(item.id, item.photoPath);
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(err.message || String(err));
      setBusy(false);
    }
  };

  return (
    <Drawer onClose={onClose}>
      <div className="sheet-title">{editing ? t.itemEditTitle : t.itemAddTitle}</div>

      <label className="field-label" htmlFor="item-name">{t.itemNameLabel}</label>
      <div className="search" style={{ marginBottom: 14 }}>
        <input id="item-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t.itemNamePlaceholder} />
      </div>

      <label className="field-label">{t.itemCategoryLabel}</label>
      <div className="chiprow">
        {ITEM_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={"chip" + (category === c.id ? " chip-on" : "")}
            onClick={() => setCategory(c.id)}
          >
            {t[c.labelKey]}
          </button>
        ))}
      </div>

      <label className="field-label" htmlFor="item-room">{t.itemRoomLabel}</label>
      {!editing && roomOptions.length > 0 ? (
        // A real room, once any exist — the exact rooms this same customer just built
        // in My Home, not a fixed suggestion list standing in for them.
        <div className="search" style={{ marginBottom: 14 }}>
          <select
            id="item-room"
            value={locationId}
            onChange={(e) => {
              const picked = roomOptions.find((opt) => opt.id === e.target.value);
              setLocationId(e.target.value);
              setRoom(picked?.name || "");
            }}
          >
            <option value="">{t.itemRoomNone}</option>
            {roomOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
        </div>
      ) : (
        <>
          {/* No real rooms yet, or editing an existing item: free text, with suggestions
              — the column itself has always accepted anything, so a fixed vocabulary
              would still refuse "zolderkamer" here regardless. */}
          <div className="chiprow">
            {SUGGESTED_ROOMS.map((r) => (
              <button
                key={r.id}
                type="button"
                className={"chip" + (room === t[r.labelKey] ? " chip-on" : "")}
                onClick={() => setRoom(room === t[r.labelKey] ? "" : t[r.labelKey])}
              >
                {t[r.labelKey]}
              </button>
            ))}
          </div>
          <div className="search" style={{ marginBottom: 14 }}>
            <input id="item-room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder={t.itemRoomPlaceholder} />
          </div>
        </>
      )}

      <label className="field-label" htmlFor="item-brand">{t.itemBrandLabel}</label>
      <div className="search" style={{ marginBottom: 14 }}>
        <input id="item-brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
      </div>

      <label className="field-label" htmlFor="item-model">{t.itemModelLabel}</label>
      <div className="search" style={{ marginBottom: 14 }}>
        <input id="item-model" value={model} onChange={(e) => setModel(e.target.value)} />
      </div>

      <label className="field-label">{t.itemPhotoLabel}</label>
      <div className="item-photo-picker">
        {photoPreview ? (
          <div className="item-photo-preview">
            <img src={photoPreview} alt="" />
            <button
              type="button"
              className="photo-remove-btn"
              onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
              aria-label={t.itemPhotoRemove}
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button type="button" className="item-photo-add" onClick={() => photoInputRef.current.click()}>
            <Camera size={20} aria-hidden="true" />
            <span>{t.itemPhotoAdd}</span>
          </button>
        )}
        <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={pickPhoto} />
      </div>

      <label className="field-label" htmlFor="item-purchased">{t.itemPurchasedLabel}</label>
      <div className="search" style={{ marginBottom: 14 }}>
        <input id="item-purchased" type="date" value={purchasedOn || ""} onChange={(e) => setPurchasedOn(e.target.value)} />
      </div>

      <label className="field-label" htmlFor="item-notes">{t.itemNotesLabel}</label>
      <textarea id="item-notes" className="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />

      {error && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start" }}>{error}</div>}

      <button className="btn-primary" disabled={busy || !canSaveItem({ name })} onClick={submit}>
        {editing ? t.itemSaveChanges : t.itemSaveNew}
      </button>

      {editing && (
        <button className="btn-secondary" style={{ marginTop: 8 }} disabled={busy} onClick={() => setConfirmDelete(true)}>
          <Trash2 size={13} aria-hidden="true" /> {t.itemDelete}
        </button>
      )}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(false)}>
          <p style={{ marginTop: 8 }}>{t.itemDeleteConfirm}</p>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>{t.cancelBtn}</Button>
            <Button variant="primary" disabled={busy} onClick={remove}>{t.itemDelete}</Button>
          </div>
        </Modal>
      )}
    </Drawer>
  );
}
