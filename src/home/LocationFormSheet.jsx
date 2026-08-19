// Platform Activation Slice 1, WP 1.8 — adding a real location (property.locations, via
// api.create_location(), WP 1.5). Read-only since WP 1.3; this is its first write
// surface. Deliberately minimal, matching ItemFormSheet.jsx's own "one required field"
// philosophy and create_location()'s own contract shape (WP 1.5's own scope: create
// only — no edit, no retire, both named as deferred in 0140's own header).
import { useState } from "react";
import { Drawer } from "../design-system";
import { createLocation } from "../lib/locations.js";

// Flattens the tree (src/lib/homeInventory.js's buildLocationTree()) into a picker list,
// indented by depth so a nested room still reads as nested — the tree's own shape is
// pure display data here, never re-walked by id.
function flattenForPicker(rooms, depth = 0) {
  return rooms.flatMap((node) => [
    { id: node.id, label: `${"— ".repeat(depth)}${node.name}` },
    ...flattenForPicker(node.children, depth + 1),
  ]);
}

export function LocationFormSheet({ t, propertyId, actorRef, rooms, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [parentId, setParentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const parentOptions = flattenForPicker(rooms || []);
  const canSave = name.trim().length > 0;

  const submit = async () => {
    if (!canSave) return;
    setError("");
    setBusy(true);
    try {
      await createLocation({ propertyId, parentId: parentId || null, name, type, actorRef });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err.message || String(err));
      setBusy(false);
    }
  };

  return (
    <Drawer onClose={onClose}>
      <div className="sheet-title">{t.locationFormAddTitle}</div>

      <label className="field-label" htmlFor="location-name">{t.locationFormNameLabel}</label>
      <div className="search" style={{ marginBottom: 14 }}>
        <input
          id="location-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.locationFormNamePlaceholder}
        />
      </div>

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

      {error && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start" }}>{error}</div>}

      <button className="btn-primary" disabled={busy || !canSave} onClick={submit}>
        {t.locationFormSaveNew}
      </button>
    </Drawer>
  );
}
