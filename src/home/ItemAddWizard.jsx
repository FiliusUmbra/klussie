// Adding something new — one question per screen, in order: what is it, a photo of its
// own nameplate, brand, model, then whatever else is worth recording. Product remark,
// 2026-09-12: the flat eight-field form (still ItemFormSheet.jsx's own shape, kept for
// editing) asks a first-time capture for everything at once; a person standing in front
// of the appliance benefits more from being walked through it than from a form.
//
// WHY THIS IS A SEPARATE COMPONENT FROM ItemFormSheet.jsx, NOT A MODE OF IT
//
// ItemDetailSheet.jsx's own header set the precedent: a genuinely different task gets
// its own file rather than a growing set of ternaries in one. Editing is a person who
// already knows what the thing is, correcting or filling in a detail — the flat form
// already suits that. Adding, especially standing in front of the object for the first
// time, is the guided case. LocationFormSheet.jsx's own comment ("dual-mode now,
// matching ItemFormSheet.jsx's own [create/edit] shape") describes ItemFormSheet's PAST
// shape — rooms have no comparable step-by-step brief, so LocationFormSheet's own
// dual-mode form is unaffected and unchanged by this split.
//
// ONE PHOTO, NOT THREE
//
// "take a photo again, small icon" on the Brand/Model steps is a way back into the one
// photo slot the Photo step already offers — household_items and property.assets both
// have exactly one photo column (see PhotoField/photo-mini-btn below). It is not a
// second or third photo attached to the item; multiple photos per item would be a real
// schema change, out of scope here.
//
// SAME WRITE CONTRACT ItemFormSheet.jsx'S OWN CREATE PATH USED
//
// createAsset()/createHouseholdItem()/setHouseholdItemPhoto(), chosen by whether a real
// property exists — moved here verbatim from ItemFormSheet.jsx's own submit(), which no
// longer has a create branch at all now that every caller only ever hands it a real item.
import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { Drawer } from "../design-system";
import { ITEM_CATEGORIES, SUGGESTED_ROOMS, DEFAULT_ITEM_CATEGORY, canSaveItem } from "../lib/itemCategories.js";
import { createHouseholdItem, createAsset, setHouseholdItemPhoto } from "../lib/householdItems.js";
import { flattenLocationsForPicker } from "../lib/homeInventory.js";
import { interpolate } from "../lib/homeStrings.js";

const STEPS = ["what", "photo", "brand", "model", "extra"];

// The Photo step's own full-size picker/preview — identical markup to ItemFormSheet.jsx's
// own item-photo-picker, reused here since the two forms show the exact same one-photo
// affordance, just at different points in the flow.
function PhotoField({ t, preview, onPick, onRemove }) {
  return (
    <div className="item-photo-picker">
      {preview ? (
        <div className="item-photo-preview">
          <img src={preview} alt="" />
          <button type="button" className="photo-remove-btn" onClick={onRemove} aria-label={t.itemPhotoRemove}>
            <X size={12} />
          </button>
        </div>
      ) : (
        <button type="button" className="item-photo-add" onClick={onPick}>
          <Camera size={20} aria-hidden="true" />
          <span>{t.itemPhotoAdd}</span>
        </button>
      )}
    </div>
  );
}

// The Brand/Model steps' own "klein pictogram" — a small round button back into the same
// photo slot, not a second photo field. Filled/on once a photo already exists so this
// step honestly shows that state rather than looking like an untouched control.
function PhotoMiniButton({ t, preview, onPick }) {
  // Tapping this always re-opens the picker, whether or not a photo is already attached
  // -- there is one photo slot, so "add" and "replace" are the same action here. The
  // thumbnail itself, once one exists, is the only signal that distinguishes the two.
  return (
    <button
      type="button"
      className={"item-photo-mini-btn" + (preview ? " item-photo-mini-on" : "")}
      onClick={onPick}
      aria-label={t.itemPhotoAdd}
    >
      {preview ? <img src={preview} alt="" /> : <Camera size={15} aria-hidden="true" />}
    </button>
  );
}

export function ItemAddWizard({ t, ownerId, propertyId, rooms, initialLocationId, onClose, onSaved }) {
  // The caller's own auth id doubles as ADR-0019's actor_ref — see ItemFormSheet.jsx's
  // own comment for why no separate prop carries the same id under a second name.
  const usingRealContract = !!propertyId;
  const actorRef = ownerId;
  const roomOptions = flattenLocationsForPicker(rooms || []);
  const initialRoomOption = roomOptions.find((opt) => opt.id === initialLocationId);

  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState("");
  const [category, setCategory] = useState(DEFAULT_ITEM_CATEGORY);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [room, setRoom] = useState(initialRoomOption?.name || "");
  const [locationId, setLocationId] = useState(initialLocationId || "");
  const [purchasedOn, setPurchasedOn] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const photoInputRef = useRef(null);

  const step = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;
  const canAdvance = step !== "what" || canSaveItem({ name });

  const pickPhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  // Same shape as ItemFormSheet.jsx's own removePhoto(): create once on pick, revoke
  // once on remove -- there is always at most one local object URL alive at a time.
  const removePhoto = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const goNext = () => {
    if (!canAdvance) return;
    if (isLastStep) { submit(); return; }
    setStepIndex((i) => i + 1);
  };
  const goBack = () => setStepIndex((i) => Math.max(0, i - 1));
  const skip = () => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1));

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      const fields = { name, category, room, brand, model, purchasedOn, notes };
      if (usingRealContract) {
        await createAsset({ propertyId, ownerId, actorRef, locationId: locationId || null, photoFile, ...fields });
      } else {
        const saved = await createHouseholdItem({ ownerId, ...fields });
        if (photoFile) await setHouseholdItemPhoto(saved.id, ownerId, photoFile, null);
      }
      if (photoFile && photoPreview) URL.revokeObjectURL(photoPreview);
      await onSaved();
      onClose();
    } catch {
      // A raw err.message here would be a raw Postgres/Storage error -- documents.js's
      // own header names this anti-pattern and its fix: a generic, localized message,
      // never the backend's own words. Same key ItemFormSheet.jsx's own save failure uses.
      setError(t.itemSaveFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer onClose={onClose} closeLabel={t.closeBtn}>
      <div className="tour">
        <p className="tour-progress">{interpolate(t.itemWizardStepProgress, { n: stepIndex + 1, total: STEPS.length })}</p>

        {step === "what" && (
          <>
            {/* t.itemNameLabel already reads "What is it?" in every locale (ItemFormSheet.jsx's
                own <label> for this same field) -- no separate step-title string needed. */}
            <h2 className="tour-title">{t.itemNameLabel}</h2>
            <div className="search" style={{ marginTop: 4, marginBottom: 14 }}>
              <input autoFocus aria-label={t.itemNameLabel} value={name} onChange={(e) => setName(e.target.value)} placeholder={t.itemNamePlaceholder} />
            </div>
            <label className="field-label">{t.itemCategoryLabel}</label>
            <div className="chiprow">
              {ITEM_CATEGORIES.map((c) => (
                <button key={c.id} type="button" className={"chip" + (category === c.id ? " chip-on" : "")} onClick={() => setCategory(c.id)}>
                  {t[c.labelKey]}
                </button>
              ))}
            </div>
          </>
        )}

        {step === "photo" && (
          <>
            <h2 className="tour-title">{t.itemWizardPhotoTitle}</h2>
            <p className="tour-body">{t.itemWizardPhotoHint}</p>
            <PhotoField t={t} preview={photoPreview} onPick={() => photoInputRef.current.click()} onRemove={removePhoto} />
          </>
        )}

        {step === "brand" && (
          <>
            <h2 className="tour-title">{t.itemBrandLabel}</h2>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div className="search" style={{ flex: 1, marginTop: 4 }}>
                <input autoFocus aria-label={t.itemBrandLabel} value={brand} onChange={(e) => setBrand(e.target.value)} />
              </div>
              <PhotoMiniButton t={t} preview={photoPreview} onPick={() => photoInputRef.current.click()} />
            </div>
          </>
        )}

        {step === "model" && (
          <>
            <h2 className="tour-title">{t.itemModelLabel}</h2>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div className="search" style={{ flex: 1, marginTop: 4 }}>
                <input autoFocus aria-label={t.itemModelLabel} value={model} onChange={(e) => setModel(e.target.value)} />
              </div>
              <PhotoMiniButton t={t} preview={photoPreview} onPick={() => photoInputRef.current.click()} />
            </div>
          </>
        )}

        {step === "extra" && (
          <>
            <h2 className="tour-title">{t.itemWizardExtraTitle}</h2>

            <label className="field-label" htmlFor="wizard-item-room">{t.itemRoomLabel}</label>
            {roomOptions.length > 0 ? (
              // A real room, once any exist — the exact rooms this same customer already
              // built in My Home, matching ItemFormSheet.jsx's own create-mode picker.
              <div className="search" style={{ marginBottom: 14 }}>
                <select
                  id="wizard-item-room"
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
                  <input id="wizard-item-room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder={t.itemRoomPlaceholder} />
                </div>
              </>
            )}

            <label className="field-label" htmlFor="wizard-item-purchased">{t.itemPurchasedLabel}</label>
            <div className="search" style={{ marginBottom: 14 }}>
              <input id="wizard-item-purchased" type="date" value={purchasedOn || ""} onChange={(e) => setPurchasedOn(e.target.value)} />
            </div>

            <label className="field-label" htmlFor="wizard-item-notes">{t.itemNotesLabel}</label>
            <textarea id="wizard-item-notes" className="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </>
        )}

        <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={pickPhoto} />

        {error && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start" }}>{error}</div>}

        <div className="tour-actions">
          <button className="btn-primary" disabled={busy || !canAdvance} onClick={goNext}>
            {isLastStep ? t.itemSaveNew : t.tourNext}
          </button>
          <div className="tour-nav">
            {stepIndex > 0 && <button type="button" className="tour-link" onClick={goBack}>{t.tourBack}</button>}
            {!isLastStep && step !== "what" && (
              <button type="button" className="tour-link tour-skip" onClick={skip}>{t.tourSkip}</button>
            )}
          </div>
        </div>
      </div>
    </Drawer>
  );
}
