// Editing something the household already owns.
//
// Eight fields, one of them required. That asymmetry is the whole design: a person often
// genuinely does not know the brand of the boiler that came with the house, and a form
// that refuses to save until they do teaches them to type something plausible instead —
// which would poison the record this table exists to be. Only the name is asked for.
//
// EDIT-ONLY NOW — ADDING SOMETHING NEW LIVES IN ItemAddWizard.jsx
//
// Product remark, 2026-09-12: a first-time capture benefits from being walked through
// one question at a time (what is it, a photo of its own nameplate, brand, model, then
// whatever else); editing is a person who already knows what the thing is, correcting or
// filling in a detail, which this flat form already suited. Every caller now only ever
// hands this component a real `item` — creation went to ItemAddWizard.jsx, its own file,
// matching the precedent ItemDetailSheet.jsx's own header already set (a genuinely
// different task gets its own component rather than a growing set of ternaries in one).
// The room field keeps its edit-time behaviour exactly as it was: free text with
// suggested chips, never the real-room picker — that stayed a create-only affordance
// even before this split (see the comment on that below).
//
// Platform Activation Slice 1, WP 1.8 — TWO WRITE PATHS, CHOSEN BY WHETHER A REAL
// PROPERTY EXISTS
//
// `propertyId` present means the real contract (api.update_asset()/retire_asset(), WP
// 1.4) is used — every account WP 1.0 provisions. Its absence falls back to the legacy
// household_items functions, the same two-tier shape fetchHouseholdItems() already
// established for reads. "Delete" on the real path is retire_asset() (active -> retired,
// never a hard delete) rather than deleteHouseholdItem — api.my_assets() excludes
// retired assets (0054, silently regressed by 0161's own rewrite of the same WHERE
// clause, restored in 0200), so the item disappears from this list exactly as a delete
// would, while its history is kept.
//
// THE ROOM FIELD STAYS FREE TEXT ON EDIT
//
// property.create_asset() always accepted a real location_id, and ItemAddWizard.jsx's
// own "extra" step now offers the customer's own actual rooms on create. Editing keeps
// today's behaviour exactly as it was for THIS field specifically, even though real
// rooms exist — property.move_asset_for_caller() (Item Detail slice, 0201) now exists
// for that, reached from ItemDetailSheet.jsx as its own "Move item" action instead,
// matching this whole slice's own separation of "what this item is" (this form) from
// "what to do with it" (Item Detail's actions).
//
// PURE FORM AGAIN — DOCUMENTS AND ASK KLUSSIE MOVED TO ItemDetailSheet.jsx
//
// The Home Builder follow-up slice (0199) bolted a Documents section and "Ask Klussie"
// onto this form directly. The Item Detail slice reconsiders that: tapping an item now
// opens ItemDetailSheet.jsx first — a calm, read-first view — and "Edit details" is one
// action reached from there, matching how Move/Retire/Add-a-document/Ask all work. This
// file goes back to being only the form; nothing about its own update/retire write logic
// changed by either that slice or this one.
import { useState, useRef } from "react";
import { Camera, X, Trash2 } from "lucide-react";
import { Drawer, Modal, Button } from "../design-system";
import { ITEM_CATEGORIES, SUGGESTED_ROOMS, DEFAULT_ITEM_CATEGORY, canSaveItem } from "../lib/itemCategories.js";
import { updateHouseholdItem, deleteHouseholdItem, updateAsset, retireAsset } from "../lib/householdItems.js";

export function ItemFormSheet({ t, ownerId, propertyId, item, onClose, onSaved }) {
  // The caller's own auth id doubles as ADR-0019's actor_ref — public.profiles.id
  // references auth.users.id directly (0001), so ownerId already IS that value; no
  // separate prop is threaded down just to carry the same id under a second name.
  const usingRealContract = !!propertyId;
  const actorRef = ownerId;
  const [name, setName] = useState(item.name || "");
  const [category, setCategory] = useState(item.category || DEFAULT_ITEM_CATEGORY);
  const [room, setRoom] = useState(item.room || "");
  const [brand, setBrand] = useState(item.brand || "");
  const [model, setModel] = useState(item.model || "");
  const [purchasedOn, setPurchasedOn] = useState(item.purchasedOn || "");
  const [notes, setNotes] = useState(item.notes || "");
  // A picked file is held until save so an abandoned form uploads nothing.
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(item.photoUrl || null);
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

  // Found by code audit: this cleared photoFile/photoPreview without ever revoking the
  // object URL pickPhoto() just created for it -- a real, unbounded memory leak on every
  // "remove photo" tap, ServiceRecordEditorSheet.jsx's own header names this file as
  // already getting right (create once on pick, revoke once on remove) alongside
  // QuoteFormSheet.jsx -- true there, not here. Only revokes when photoFile is set: a
  // photoPreview carrying the item's own existing photoUrl (no local file picked yet) is
  // a real server URL, not a blob, and revoking that would do nothing useful and log a
  // console warning for no reason.
  const removePhoto = () => {
    if (photoFile && photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const submit = async () => {
    if (!canSaveItem({ name })) return;
    setError("");
    setBusy(true);
    try {
      const fields = { name, category, room, brand, model, purchasedOn, notes };
      if (usingRealContract) {
        // This form has no inputs for serial number/installed date/expected service
        // life/warranty end/condition — passing the item's OWN current values for them
        // (rather than leaving updateAsset()'s null defaults) is what stops an ordinary
        // rename or note edit from silently erasing a fact the Document Understanding
        // slice's own suggestion-confirmation flow (or any future capability) has set.
        await updateAsset(item.id, {
          ownerId, actorRef, previousPhotoPath: item.photoPath, photoFile,
          serialNumber: item.serialNumber, installedOn: item.installedOn,
          expectedServiceLifeMonths: item.expectedServiceLifeMonths,
          warrantyExpiresOn: item.warrantyExpiresOn, condition: item.condition,
          ...fields,
        });
      } else {
        await updateHouseholdItem(item.id, { ownerId, ...fields });
      }
      await onSaved();
      onClose();
    } catch {
      // A raw err.message here would be a raw Postgres/Storage error -- documents.js's
      // own header names this anti-pattern and its fix: a generic, localized message,
      // never the backend's own words.
      setError(t.itemSaveFailed);
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
    } catch {
      // The same action ItemDetailSheet.jsx's own confirmedRetire() performs -- reusing
      // its key rather than declaring a second one for the identical failure.
      setError(t.itemDetailRetireFailed);
      setBusy(false);
    }
  };

  return (
    <Drawer onClose={onClose} closeLabel={t.closeBtn}>
      <div className="sheet-title">{t.itemEditTitle}</div>

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
      {/* Free text with suggestions, always — the column itself has always accepted
          anything, so a fixed vocabulary would still refuse "zolderkamer" here
          regardless. See this file's own header for why edit never offers the real-room
          picker ItemAddWizard.jsx's create flow does. */}
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
              onClick={removePhoto}
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
        {t.itemSaveChanges}
      </button>

      <button className="btn-secondary" style={{ marginTop: 8 }} disabled={busy} onClick={() => setConfirmDelete(true)}>
        <Trash2 size={13} aria-hidden="true" /> {t.itemDelete}
      </button>

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(false)} closeLabel={t.closeBtn}>
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
