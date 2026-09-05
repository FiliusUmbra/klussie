// Item Detail — the Home Operating System's real answer to "what does Klussie know about
// this one thing in my home."
//
// WHY THIS IS A NEW, SEPARATE COMPONENT FROM ItemFormSheet.jsx
//
// Tapping an item card used to open the edit FORM directly — everything about the item
// was "how do I change this," never "what is this." The Home Builder follow-up slice
// (0199, PR #144) had already started bolting Documents and Ask Klussie onto that same
// edit form, which worked but kept the wrong thing as the front door: a homeowner opening
// an appliance to check its warranty landed on a form asking them to retype its brand.
// This component is that front door instead — a calm, read-first view — and editing
// becomes one clearly labeled action reached from it, exactly like every other write
// action here (move, retire, add a document). ItemFormSheet.jsx goes back to being a pure
// create/edit form; nothing in its own write logic changed.
//
// IDENTITY USES ICON+FACT ROWS, NOT A LABELED FORM LIST
//
// Matches myHomeParts.jsx's own PropertyHeader precedent (`.property-fact`) rather than
// inventing a second "label: value" convention — a detail view reads calmer as a short
// list of plain facts than as an unfillable form.
//
// MAINTENANCE AND HISTORY ARE READ-ONLY, ON PURPOSE
//
// api.create_manual_maintenance_obligation() (0142) has no client caller anywhere in this
// app, matching MyItemsPanel.jsx's own long-standing restraint ("no client caller is
// named in this work package's scope") — adding one here would be new capability well
// beyond this slice's own "combine what already exists" mandate. History is genuinely
// often empty today: work.requests.asset_id exists but nothing in the current intake flow
// ever sets it, so most real items will show History's honest empty state until a later
// slice teaches intake to ask "which item is this about" — that is correct behaviour for
// what has actually happened, not a bug to hide.
import { useEffect, useState } from "react";
import { Tag, MapPin, Calendar, ShieldCheck, ShieldAlert, ShieldQuestion, Pencil, ArrowLeftRight, Trash2, AlertTriangle, Plus, FileText, ChevronRight } from "lucide-react";
import { Drawer, Modal, Button, Badge } from "../design-system";
import { DocumentRowContent } from "./panelParts.jsx";
import { DocumentUploadSheet } from "./DocumentUploadSheet.jsx";
import { fetchDocumentsForAsset, getDocumentUrl } from "../lib/documents.js";
import { fetchServiceRecordsForAsset } from "../lib/serviceRecords.js";
import { moveAsset, retireAsset } from "../lib/householdItems.js";
import { askAboutItem } from "../lib/askAboutItem.js";
import { flattenLocationsForPicker, resolveItemRoomName } from "../lib/homeInventory.js";
import { interpolate } from "../lib/homeStrings.js";

function WarrantyLine({ t, fmtDate, warrantyExpiresOn }) {
  if (!warrantyExpiresOn) {
    return (
      <span className="property-fact">
        <ShieldQuestion size={13} aria-hidden="true" /> {t.itemDetailWarrantyUnknown}
      </span>
    );
  }
  const expired = new Date(warrantyExpiresOn) < new Date();
  return (
    <span className="property-fact">
      {expired ? <ShieldAlert size={13} aria-hidden="true" /> : <ShieldCheck size={13} aria-hidden="true" />}
      {expired
        ? interpolate(t.itemDetailWarrantyExpired, { date: fmtDate(warrantyExpiresOn) })
        : interpolate(t.itemDetailWarrantyCovered, { date: fmtDate(warrantyExpiresOn) })}
    </span>
  );
}

function MoveItemModal({ t, rooms, currentLocationId, busy, onCancel, onConfirm }) {
  const options = flattenLocationsForPicker(rooms || []);
  const [locationId, setLocationId] = useState(currentLocationId || "");
  return (
    <Modal onClose={onCancel}>
      <div className="sheet-title" style={{ marginTop: 0 }}>{t.itemDetailMoveTitle}</div>
      <label className="field-label" htmlFor="item-move-room">{t.itemRoomLabel}</label>
      <div className="search" style={{ marginBottom: 14 }}>
        <select id="item-move-room" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">{t.itemRoomNone}</option>
          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.label}</option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>{t.cancelBtn}</Button>
        <Button variant="primary" onClick={() => onConfirm(locationId || null)} disabled={busy}>{t.itemDetailMoveSave}</Button>
      </div>
    </Modal>
  );
}

export function ItemDetailSheet({
  t, ownerId, workspaceId, rooms, fmtDate, item, maintenance, onClose, onEdit, onSaved, onReportProblem,
}) {
  const actorRef = ownerId;
  // maintenance is the workspace-wide list MyItemsPanel.jsx/useHomeContext.js already
  // fetch once (src/lib/maintenance.js's own fetchMaintenanceObligations()) — every row
  // already carries its own assetId, so this narrows to one item without a second fetch.
  const itemMaintenance = (maintenance || []).filter((m) => m.assetId === item.id);
  // move_asset_for_caller() (0201) only ever updates location_id, never the free-text
  // room_label — resolving against the real room tree is what makes a moved item show
  // its real new room here, rather than a stale label or "no room selected."
  const roomName = resolveItemRoomName(rooms, item.locationId, item.room);

  // Documents: null while resolving, matching every other lazily-loaded section's own
  // "never show empty prematurely" convention (useHomeContext.js's rooms/documents).
  const [documents, setDocuments] = useState(null);
  const [showDocumentUpload, setShowDocumentUpload] = useState(false);
  const [openingDocId, setOpeningDocId] = useState(null);
  const [documentError, setDocumentError] = useState("");

  const [history, setHistory] = useState(null);

  const [showMove, setShowMove] = useState(false);
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveError, setMoveError] = useState("");

  const [confirmRetire, setConfirmRetire] = useState(false);
  const [retireBusy, setRetireBusy] = useState(false);
  const [retireError, setRetireError] = useState("");

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [groundedIn, setGroundedIn] = useState([]);
  const [askBusy, setAskBusy] = useState(false);
  const [askError, setAskError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchDocumentsForAsset(item.id).then((docs) => { if (!cancelled) setDocuments(docs); });
    fetchServiceRecordsForAsset(workspaceId, item.id).then((records) => { if (!cancelled) setHistory(records); });
    return () => { cancelled = true; };
  }, [item.id, workspaceId]);

  const refreshDocuments = async () => {
    const docs = await fetchDocumentsForAsset(item.id);
    setDocuments(docs);
  };

  const openDocument = async (doc) => {
    setDocumentError("");
    setOpeningDocId(doc.id);
    try {
      const url = await getDocumentUrl(doc.storageBucket, doc.storagePath);
      if (!url) throw new Error("no signed url");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setDocumentError(t.itemDetailDocumentOpenFailed);
    } finally {
      setOpeningDocId(null);
    }
  };

  // Closes the whole detail sheet on success, not just the move modal — `item` is a
  // snapshot passed in by the caller, so keeping this sheet open would keep showing the
  // room it used to be in until the caller re-fetches and re-opens it. Matches
  // LocationFormSheet's own established convention (a save closes back to the list).
  const confirmMove = async (locationId) => {
    setMoveError("");
    setMoveBusy(true);
    try {
      await moveAsset(item.id, locationId, actorRef);
      await onSaved();
      onClose();
    } catch {
      setMoveError(t.itemDetailMoveFailed);
      setMoveBusy(false);
    }
  };

  const confirmedRetire = async () => {
    setRetireError("");
    setRetireBusy(true);
    try {
      await retireAsset(item.id, actorRef);
      await onSaved();
      onClose();
    } catch {
      setRetireError(t.itemDetailRetireFailed);
      setRetireBusy(false);
    }
  };

  const submitQuestion = async () => {
    if (!question.trim() || askBusy) return;
    setAskError("");
    setAnswer("");
    setGroundedIn([]);
    setAskBusy(true);
    try {
      const result = await askAboutItem({ itemId: item.id, question: question.trim(), workspaceId });
      setAnswer(result.answer);
      setGroundedIn(result.groundedIn);
    } catch {
      setAskError(t.itemAskFailed);
    } finally {
      setAskBusy(false);
    }
  };

  // A real citation, not a decorative label — the model itself named which of the given
  // sources it drew from (api/ask-about-item.js's own groundedIn field); "none" means it
  // said plainly it didn't know, which is not a source to cite.
  const GROUND_SOURCE_LABELS = {
    item_details: t.itemAskSourceDetails,
    attached_document: t.itemAskSourceDocument,
    maintenance_records: t.itemAskSourceMaintenance,
    service_history: t.itemAskSourceHistory,
  };
  const citedSources = groundedIn.map((source) => GROUND_SOURCE_LABELS[source]).filter(Boolean);

  return (
    <Drawer onClose={onClose}>
      <div className="sheet-title">{item.name}</div>

      <div className="item-detail-photo">
        {item.photoUrl ? (
          <img src={item.photoUrl} alt="" />
        ) : (
          <span className="item-card-initial" aria-hidden="true">{item.name[0]}</span>
        )}
      </div>

      <div className="property-facts" style={{ marginBottom: 14 }}>
        {(item.brand || item.model) && (
          <span className="property-fact"><Tag size={13} aria-hidden="true" /> {[item.brand, item.model].filter(Boolean).join(" ")}</span>
        )}
        <span className="property-fact"><MapPin size={13} aria-hidden="true" /> {roomName || t.itemRoomNone}</span>
        {item.purchasedOn && (
          <span className="property-fact"><Calendar size={13} aria-hidden="true" /> {fmtDate(item.purchasedOn)}</span>
        )}
        <WarrantyLine t={t} fmtDate={fmtDate} warrantyExpiresOn={item.warrantyExpiresOn} />
      </div>

      <button type="button" className="home-panel-action" style={{ marginBottom: 18 }} onClick={onEdit}>
        <Pencil size={15} aria-hidden="true" /> {t.itemDetailEditAction}
      </button>

      <label className="field-label">{t.itemAskTitle}</label>
      <p className="fineprint" style={{ justifyContent: "flex-start", marginBottom: 8 }}>{t.itemAskHint}</p>
      <div className="search" style={{ marginBottom: 8 }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t.itemAskPlaceholder}
          onKeyDown={(e) => { if (e.key === "Enter") submitQuestion(); }}
        />
      </div>
      <button type="button" className="btn-primary" disabled={askBusy || !question.trim()} onClick={submitQuestion}>
        {askBusy ? t.itemAskThinking : t.itemAskButton}
      </button>
      {answer && (
        <div role="status" style={{ marginTop: 8 }}>
          <p className="home-group-empty" style={{ color: "var(--ink)" }}>{answer}</p>
          {citedSources.length > 0 && (
            <p className="fineprint" style={{ justifyContent: "flex-start" }}>
              {t.itemAskSourceLabel}: {citedSources.join(", ")}
            </p>
          )}
        </div>
      )}
      {askError && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start" }}>{askError}</div>}

      <label className="field-label" style={{ marginTop: 22 }}>{t.itemDocumentsTitle}</label>
      {documents === null ? (
        <p className="home-group-empty">{t.myItemsLoading}</p>
      ) : documents.length === 0 ? (
        <p className="home-group-empty">{t.itemDocumentsEmpty}</p>
      ) : (
        <ul className="document-list">
          {documents.map((doc) => (
            <li key={doc.id} className="document-row">
              <button
                type="button"
                className="item-detail-document-open"
                onClick={() => openDocument(doc)}
                disabled={openingDocId === doc.id}
              >
                <FileText size={14} aria-hidden="true" className="item-detail-document-icon" />
                <span className="item-detail-document-content"><DocumentRowContent t={t} fmtDate={fmtDate} doc={doc} /></span>
                <ChevronRight size={14} aria-hidden="true" className="item-detail-document-chevron" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {documentError && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start" }}>{documentError}</div>}
      <button type="button" className="home-panel-action" style={{ marginTop: 10, marginBottom: 18 }} onClick={() => setShowDocumentUpload(true)}>
        <Plus size={15} aria-hidden="true" /> {t.documentFormAddTitle}
      </button>

      <label className="field-label">{t.myItemsMaintenanceTitle}</label>
      {maintenance === null || maintenance === undefined ? (
        <p className="home-group-empty">{t.myItemsLoading}</p>
      ) : itemMaintenance.length === 0 ? (
        <p className="home-group-empty">{t.myItemsMaintenanceEmpty}</p>
      ) : (
        <ul className="maintenance-list">
          {itemMaintenance.map((row) => (
            <li key={row.id} className="maintenance-row">
              <span className="maintenance-row-title">{row.title}</span>
              {row.status === "open" && row.dueOn && (
                <span className="maintenance-row-due">
                  {row.isOverdue ? (
                    <Badge tone="amber">{t.myItemsMaintenanceOverdue}</Badge>
                  ) : (
                    interpolate(t.myItemsMaintenanceDueOn, { date: fmtDate(row.dueOn) })
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <label className="field-label" style={{ marginTop: 18 }}>{t.itemDetailHistoryTitle}</label>
      {history === null ? (
        <p className="home-group-empty">{t.myItemsLoading}</p>
      ) : history.length === 0 ? (
        <p className="home-group-empty">{t.itemDetailHistoryEmpty}</p>
      ) : (
        <ul className="home-timeline" style={{ paddingInlineStart: 0 }}>
          {history.map((record) => (
            <li key={record.id} className="home-review-row">
              <span className="home-review-service">{fmtDate(record.performedAt)}</span>
              <p className="home-ai-line">{record.workPerformed}</p>
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 8 }}>
        <button type="button" className="btn-secondary" onClick={() => setShowMove(true)}>
          <ArrowLeftRight size={13} aria-hidden="true" /> {t.itemDetailMoveAction}
        </button>
        {onReportProblem && (
          <button type="button" className="btn-secondary" onClick={onReportProblem}>
            <AlertTriangle size={13} aria-hidden="true" /> {t.itemDetailReportProblem}
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={() => setConfirmRetire(true)}>
          <Trash2 size={13} aria-hidden="true" /> {t.itemDetailRetireAction}
        </button>
      </div>

      {showMove && (
        <MoveItemModal
          t={t}
          rooms={rooms}
          currentLocationId={item.locationId}
          busy={moveBusy}
          onCancel={() => setShowMove(false)}
          onConfirm={confirmMove}
        />
      )}
      {moveError && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start" }}>{moveError}</div>}

      {confirmRetire && (
        <Modal onClose={() => setConfirmRetire(false)}>
          <p style={{ marginTop: 8 }}>{t.itemDetailRetireConfirm}</p>
          {retireError && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start" }}>{retireError}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <Button variant="secondary" onClick={() => setConfirmRetire(false)} disabled={retireBusy}>{t.cancelBtn}</Button>
            <Button variant="primary" onClick={confirmedRetire} disabled={retireBusy}>{t.itemDetailRetireAction}</Button>
          </div>
        </Modal>
      )}

      {showDocumentUpload && (
        <DocumentUploadSheet
          t={t}
          assetId={item.id}
          workspaceId={workspaceId}
          actorRef={actorRef}
          onClose={() => setShowDocumentUpload(false)}
          onSaved={refreshDocuments}
        />
      )}
    </Drawer>
  );
}
