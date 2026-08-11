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

  const save = async () => {
    setBusy(true);
    await updatePortfolioCaption(item.id, caption);
    await onChanged();
    setBusy(false);
    onClose();
  };

  const remove = async () => {
    setBusy(true);
    await deletePortfolioItem(item.id, item.storage_path);
    await onChanged();
    setBusy(false);
    onClose();
  };

  return (
    <Drawer onClose={onClose}>
      <img src={item.image_url} alt="" style={{ width: "100%", borderRadius: 12, marginBottom: 14 }} />
      <label className="field-label">{t.captionLabel}</label>
      <div className="search" style={{ marginBottom: 16 }}>
        <input value={caption} onChange={(e) => setCaption(e.target.value)} />
      </div>
      <button className="btn-primary" disabled={busy} onClick={save}>{t.saveChangesBtn}</button>
      <button className="btn-secondary" style={{ marginTop: 8 }} disabled={busy} onClick={() => setConfirmDelete(true)}>{t.deletePhotoBtn}</button>
      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(false)}>
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
