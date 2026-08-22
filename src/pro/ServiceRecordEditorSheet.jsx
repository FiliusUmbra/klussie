// Platform Activation Slice 3, WP 3.3 — the Service Record editor. Built against
// WP_3_3_SERVICE_RECORD_EDITOR_DESIGN.md; every section below traces to a numbered
// section there rather than a fresh decision made here.
//
// ONE CREATION CALL, NO DRAFT (design note §5) — work.create_service_record()'s own
// comment: "records are created already complete... never drafted then finalised."
// Local form state IS the only draft; closing before Save discards it, the same way
// ItemFormSheet.jsx already behaves. Save calls createServiceRecord() exactly once.
//
// TIERS (design note §3) — grounded in the real schema, not §13.2's full conceptual
// six-group table: Tier 0 (workPerformed, performedAt) is always visible, nothing to
// expand — the true minimum record the schema allows. Tier 1 (agreedPrice pre-filled
// from the job's own quote, recommendations, warrantyUntil) sits visible, uncollapsed.
// The performing annex renders in its own visually distinct container (design note §3's
// own "never a checkbox" instruction) — see appStyles.js's own .private-annex, amber
// rather than this app's usual sage, deliberately.
import { useState, useRef } from "react";
import { Camera, X, DollarSign } from "lucide-react";
import { Drawer, Button } from "../design-system";
import { useLang } from "../lib/lang";
import { createServiceRecord, writePerformingAnnex, uploadServiceRecordEvidence } from "../lib/serviceRecords.js";

const today = () => new Date().toISOString().slice(0, 10);

export function ServiceRecordEditorSheet({ job, workspaceId, actorRef, onClose, onSaved }) {
  const { t } = useLang();
  const [workPerformed, setWorkPerformed] = useState("");
  const [performedAt, setPerformedAt] = useState(today());
  const [agreedPrice, setAgreedPrice] = useState(job.quotes?.[0]?.price ?? "");
  const [recommendations, setRecommendations] = useState("");
  const [warrantyUntil, setWarrantyUntil] = useState("");
  const [showAnnex, setShowAnnex] = useState(false);
  const [internalCost, setInternalCost] = useState("");
  const [margin, setMargin] = useState("");
  const [supplierUsed, setSupplierUsed] = useState("");
  const [supplierPrice, setSupplierPrice] = useState("");
  const [schedulingNotes, setSchedulingNotes] = useState("");
  const [internalCommentary, setInternalCommentary] = useState("");
  const [photoFiles, setPhotoFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const photoInputRef = useRef(null);

  const canSave = workPerformed.trim().length > 0 && !busy;

  const pickPhotos = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length > 0) setPhotoFiles((prev) => [...prev, ...files]);
  };

  const hasAnnexContent = [internalCost, margin, supplierUsed, supplierPrice, schedulingNotes, internalCommentary]
    .some((v) => String(v).trim().length > 0);

  const submit = async () => {
    if (!canSave) return;
    setError("");
    setBusy(true);
    try {
      const serviceRecordId = await createServiceRecord({
        engagementId: job.engagementId,
        actorRef,
        performedAt: new Date(performedAt).toISOString(),
        workPerformed: workPerformed.trim(),
        agreedPrice: agreedPrice === "" ? null : Number(agreedPrice),
        priceCurrency: agreedPrice === "" ? null : "EUR",
        warrantyUntil: warrantyUntil || null,
        recommendations: recommendations.trim() || null,
      });

      // Optional, separate write — §13.2's own two-table split, never merged into the
      // core creation call above.
      if (hasAnnexContent) {
        await writePerformingAnnex({
          serviceRecordId,
          internalCost: internalCost === "" ? null : Number(internalCost),
          margin: margin === "" ? null : Number(margin),
          supplierUsed: supplierUsed.trim() || null,
          supplierPrice: supplierPrice === "" ? null : Number(supplierPrice),
          schedulingNotes: schedulingNotes.trim() || null,
          internalCommentary: internalCommentary.trim() || null,
        });
      }

      // Sequential, not parallel — a failed photo upload after the record is already
      // saved must not look like the whole save failed (the record itself is real and
      // already written); each is independent and best-effort past the first.
      for (const file of photoFiles) {
        await uploadServiceRecordEvidence(serviceRecordId, workspaceId, actorRef, file);
      }

      await onSaved();
      onClose();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer onClose={onClose}>
      <div className="sheet-title">{t.srEditorTitle}</div>
      <div className="sheet-sub">{t.srEditorSub}</div>

      <label className="field-label" htmlFor="sr-work-performed">{t.srWorkPerformedLabel}</label>
      <textarea
        id="sr-work-performed"
        className="textarea"
        rows={4}
        autoFocus
        value={workPerformed}
        onChange={(e) => setWorkPerformed(e.target.value)}
        placeholder={t.srWorkPerformedPlaceholder}
      />

      <label className="field-label" htmlFor="sr-performed-at">{t.srPerformedAtLabel}</label>
      <div className="search" style={{ marginBottom: 14 }}>
        <input id="sr-performed-at" type="date" value={performedAt} onChange={(e) => setPerformedAt(e.target.value)} />
      </div>

      <label className="field-label" htmlFor="sr-agreed-price">{t.srAgreedPriceLabel}</label>
      <div className="search" style={{ marginBottom: 14 }}>
        <DollarSign size={14} color="var(--ink-soft)" aria-hidden="true" />
        <input id="sr-agreed-price" type="number" step="0.01" min="0" value={agreedPrice} onChange={(e) => setAgreedPrice(e.target.value)} />
      </div>

      <label className="field-label" htmlFor="sr-recommendations">{t.serviceRecordRecommendationsLabel}</label>
      <textarea
        id="sr-recommendations"
        className="textarea"
        rows={2}
        value={recommendations}
        onChange={(e) => setRecommendations(e.target.value)}
        placeholder={t.srRecommendationsPlaceholder}
      />

      <label className="field-label" htmlFor="sr-warranty">{t.serviceRecordWarrantyLabel}</label>
      <div className="search" style={{ marginBottom: 14 }}>
        <input id="sr-warranty" type="date" value={warrantyUntil} onChange={(e) => setWarrantyUntil(e.target.value)} />
      </div>

      <label className="field-label">{t.srEvidenceLabel}</label>
      <div className="item-photo-picker">
        {photoFiles.map((f, i) => (
          <div key={i} className="item-photo-preview">
            <img src={URL.createObjectURL(f)} alt="" />
            <button
              type="button"
              className="photo-remove-btn"
              onClick={() => setPhotoFiles((prev) => prev.filter((_, idx) => idx !== i))}
              aria-label={t.itemPhotoRemove}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <button type="button" className="item-photo-add" onClick={() => photoInputRef.current.click()}>
          <Camera size={20} aria-hidden="true" />
          <span>{t.itemPhotoAdd}</span>
        </button>
        <input ref={photoInputRef} type="file" accept="image/*" multiple hidden onChange={pickPhotos} />
      </div>

      <div className="private-annex">
        <button
          type="button"
          className="private-annex-label"
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", width: "100%", textAlign: "left" }}
          onClick={() => setShowAnnex((v) => !v)}
          aria-expanded={showAnnex}
        >
          {showAnnex ? t.srAnnexCollapse : t.srAnnexExpand}
        </button>
        {showAnnex && (
          <>
            <label className="field-label" htmlFor="sr-internal-cost">{t.srInternalCostLabel}</label>
            <div className="search" style={{ marginBottom: 14 }}>
              <input id="sr-internal-cost" type="number" step="0.01" min="0" value={internalCost} onChange={(e) => setInternalCost(e.target.value)} />
            </div>
            <label className="field-label" htmlFor="sr-margin">{t.srMarginLabel}</label>
            <div className="search" style={{ marginBottom: 14 }}>
              <input id="sr-margin" type="number" step="0.01" value={margin} onChange={(e) => setMargin(e.target.value)} />
            </div>
            <label className="field-label" htmlFor="sr-supplier-used">{t.srSupplierUsedLabel}</label>
            <div className="search" style={{ marginBottom: 14 }}>
              <input id="sr-supplier-used" value={supplierUsed} onChange={(e) => setSupplierUsed(e.target.value)} />
            </div>
            <label className="field-label" htmlFor="sr-supplier-price">{t.srSupplierPriceLabel}</label>
            <div className="search" style={{ marginBottom: 14 }}>
              <input id="sr-supplier-price" type="number" step="0.01" min="0" value={supplierPrice} onChange={(e) => setSupplierPrice(e.target.value)} />
            </div>
            <label className="field-label" htmlFor="sr-scheduling-notes">{t.srSchedulingNotesLabel}</label>
            <textarea id="sr-scheduling-notes" className="textarea" rows={2} value={schedulingNotes} onChange={(e) => setSchedulingNotes(e.target.value)} />
            <label className="field-label" htmlFor="sr-internal-commentary">{t.srInternalCommentaryLabel}</label>
            <textarea id="sr-internal-commentary" className="textarea" rows={2} value={internalCommentary} onChange={(e) => setInternalCommentary(e.target.value)} />
          </>
        )}
      </div>

      {error && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start" }}>{error}</div>}

      <Button variant="primary" style={{ width: "100%" }} disabled={!canSave} onClick={submit}>
        {busy ? t.srSaving : t.srSaveBtn}
      </Button>
    </Drawer>
  );
}
