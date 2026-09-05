// Platform Activation Slice 1, WP 1.8 — adding a real document (property.documents, via
// api.create_document(), WP 1.6). Read-only since WP 1.3; this is its first write
// surface. typeKey is a closed choice — the four values 0141 actually seeded
// (warranty/certificate/manual/other) — never free text, since type_key is a real
// foreign key (0141's own header). validFrom is not collected: WP 1.3's own DocumentList
// only ever renders validUntil for its expiry badge, and the contract itself treats it as
// optional.
//
// "Ask Klussie" slice (0199) — an `assetId` prop attaches the document to one specific
// appliance/item instead of the property as a whole (the two are exclusive, matching
// create_document()'s own "exactly one subject" contract). Every existing property-only
// call site is unchanged; the generic error handling below already covers both paths'
// failures identically, so no extra branching was needed there.
import { useState } from "react";
import { FileText } from "lucide-react";
import { Drawer } from "../design-system";
import { createDocument, documentTypeLabelKey } from "../lib/documents.js";

// The four values 0141 actually seeded for a customer-authored upload — narrower than
// documentTypeLabelKey()'s own full set (also portfolio_photo/request_photo, which are
// system-attached, never picked from this dropdown).
const DOCUMENT_TYPES = ["warranty", "certificate", "manual", "other"];

export function DocumentUploadSheet({ t, propertyId, assetId, workspaceId, actorRef, onClose, onSaved }) {
  const [file, setFile] = useState(null);
  const [typeKey, setTypeKey] = useState(DOCUMENT_TYPES[0]);
  const [issuer, setIssuer] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canSave = !!file;

  const pickFile = (e) => {
    setFile(e.target.files?.[0] || null);
    e.target.value = "";
  };

  const submit = async () => {
    if (!canSave) return;
    setError("");
    setBusy(true);
    try {
      await createDocument({ propertyId, assetId, workspaceId, actorRef, typeKey, issuer, validUntil: validUntil || null, file });
      await onSaved();
      onClose();
    } catch (err) {
      // A raw err.message here is a raw Postgres/Storage error -- "new row violates
      // row-level security policy" for the RLS gap found live 2026-08-31, but the same
      // idiom every other failure would hit too. t.documentFormSaveFailed already existed,
      // fully localized in all 10 languages, and was never used. See aiIntake.js's own
      // header (2026-08-31) for the identical pattern found and fixed there first.
      console.warn("createDocument failed:", err.message);
      setError(t.documentFormSaveFailed);
      setBusy(false);
    }
  };

  return (
    <Drawer onClose={onClose}>
      <div className="sheet-title">{t.documentFormAddTitle}</div>

      <label className="field-label" htmlFor="document-file">{t.documentFormFileLabel}</label>
      <div className="item-photo-picker">
        {file ? (
          <div className="document-file-picked">
            <FileText size={16} aria-hidden="true" />
            <span>{file.name}</span>
          </div>
        ) : (
          <label className="item-photo-add" style={{ cursor: "pointer" }}>
            <FileText size={20} aria-hidden="true" />
            <span>{t.documentFormFileAdd}</span>
            <input id="document-file" type="file" hidden onChange={pickFile} />
          </label>
        )}
      </div>

      <label className="field-label" htmlFor="document-type">{t.documentFormTypeLabel}</label>
      <div className="search" style={{ marginBottom: 14 }}>
        <select id="document-type" value={typeKey} onChange={(e) => setTypeKey(e.target.value)}>
          {DOCUMENT_TYPES.map((key) => (
            <option key={key} value={key}>{t[documentTypeLabelKey(key)]}</option>
          ))}
        </select>
      </div>

      <label className="field-label" htmlFor="document-issuer">{t.documentFormIssuerLabel}</label>
      <div className="search" style={{ marginBottom: 14 }}>
        <input id="document-issuer" value={issuer} onChange={(e) => setIssuer(e.target.value)} />
      </div>

      <label className="field-label" htmlFor="document-valid-until">{t.documentFormValidUntilLabel}</label>
      <div className="search" style={{ marginBottom: 14 }}>
        <input
          id="document-valid-until"
          type="date"
          value={validUntil}
          onChange={(e) => setValidUntil(e.target.value)}
        />
      </div>

      {error && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start" }}>{error}</div>}

      <button className="btn-primary" disabled={busy || !canSave} onClick={submit}>
        {t.documentFormSaveNew}
      </button>
    </Drawer>
  );
}
