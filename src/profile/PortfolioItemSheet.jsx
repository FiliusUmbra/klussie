// Editing or deleting one portfolio photo. Deletion goes through a confirmation modal
// rather than deleting on tap: the image is also removed from storage, so there is
// nothing to undo afterwards.
import { useState } from "react";
import { useLang } from "../lib/lang";
import { Button, Drawer, Modal } from "../design-system";
import { updatePortfolioCaption, deletePortfolioItem } from "../lib/portfolio";

export function PortfolioItemSheet({ item, onClose, onChanged }) {
  const { t } = useLang();
  const [caption, setCaption] = useState(item.caption || "");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  // Neither write ever had a catch — a real failure (RLS, network, the Storage remove in
  // deletePortfolioItem()) threw straight out of the handler, `busy` never went back to
  // false, and the sheet was left open with its buttons permanently disabled and nothing
  // telling the pro anything went wrong. A raw err.message is never shown, matching
  // documents.js's own "generic, localized error, never a raw one" convention.
  // Found by code audit, 2026-09-11: onChanged() (Profile.jsx's own refreshPortfolio(),
  // which re-fetches and can genuinely reject) used to sit inside both of these same
  // try blocks, the same bug shape already fixed in ServiceRecordEditorSheet.jsx/
  // AddTestimonialSheet.jsx — a failure in that CALLER-side refresh, after the real
  // write had already succeeded, showed the same save/delete-failed message a genuine
  // failure would, even though the caption was already updated or the photo already
  // gone. onChanged()'s own failure is now caught separately in both handlers and never
  // blocks the sheet from closing on a write that genuinely succeeded.
  const save = async () => {
    setError("");
    setBusy(true);
    try {
      await updatePortfolioCaption(item.id, caption);
      try {
        await onChanged();
      } catch {
        // Best-effort refresh; the caption itself is already saved regardless.
      }
      onClose();
    } catch {
      setError(t.portfolioSaveFailed);
      setBusy(false);
    }
  };

  const remove = async () => {
    setError("");
    setBusy(true);
    try {
      await deletePortfolioItem(item.id, item.storage_path);
      try {
        await onChanged();
      } catch {
        // Best-effort refresh; the photo itself is already gone regardless.
      }
      onClose();
    } catch {
      setError(t.portfolioDeleteFailed);
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  return (
    <Drawer onClose={onClose} closeLabel={t.closeBtn}>
      <img src={item.image_url} alt="" style={{ width: "100%", borderRadius: 12, marginBottom: 14 }} />
      <label className="field-label">{t.captionLabel}</label>
      <div className="search" style={{ marginBottom: 16 }}>
        <input value={caption} onChange={(e) => setCaption(e.target.value)} />
      </div>
      {error && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start", marginBottom: 8 }}>{error}</div>}
      <button className="btn-primary" disabled={busy} onClick={save}>{t.saveChangesBtn}</button>
      <button className="btn-secondary" style={{ marginTop: 8 }} disabled={busy} onClick={() => setConfirmDelete(true)}>{t.deletePhotoBtn}</button>
      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(false)} closeLabel={t.closeBtn}>
          <p style={{ marginTop: 8 }}>{t.confirmDeleteMsg}</p>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>{t.cancelBtn}</Button>
            <Button variant="primary" disabled={busy} onClick={remove}>{t.deletePhotoBtn}</Button>
          </div>
        </Modal>
      )}
    </Drawer>
  );
}
