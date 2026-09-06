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
// MAINTENANCE GAINED A REAL "ADD" ACTION; HISTORY STAYS READ-ONLY
//
// api.create_maintenance_obligation() (0142) got its first real client caller in the
// Document Understanding slice (confirming a suggested maintenance interval), but only
// reachable behind reading a document — this slice adds the plain, unconditional "Add
// maintenance" action the comment here used to say was out of scope. Marking a task
// complete or cancelling one is a real, separate gap: work.complete_maintenance_
// obligation()/work.cancel_maintenance_obligation() (0074) both exist with zero api.*
// delegates anywhere — unreachable from any client, named here rather than silently
// worked around, and deliberately not built as part of adding creation. History is
// genuinely often empty today: work.requests.asset_id exists but nothing in the current
// intake flow ever sets it, so most real items will show History's honest empty state
// until a later slice teaches intake to ask "which item is this about" — that is correct
// behaviour for what has actually happened, not a bug to hide.
import { useEffect, useState } from "react";
import { Tag, MapPin, Calendar, ShieldCheck, ShieldAlert, ShieldQuestion, Pencil, ArrowLeftRight, Trash2, AlertTriangle, Plus, FileText, ChevronRight, Sparkles, Check, X } from "lucide-react";
import { Drawer, Modal, Button, Badge } from "../design-system";
import { DocumentRowContent } from "./panelParts.jsx";
import { DocumentUploadSheet } from "./DocumentUploadSheet.jsx";
import { fetchDocumentsForAsset, getDocumentUrl } from "../lib/documents.js";
import { fetchServiceRecordsForAsset } from "../lib/serviceRecords.js";
import { moveAsset, retireAsset, updateAsset } from "../lib/householdItems.js";
import { askAboutItem } from "../lib/askAboutItem.js";
import { createMaintenanceObligation, completeMaintenanceObligation, cancelMaintenanceObligation } from "../lib/maintenance.js";
import { suggestItemDetailsFromDocument, DOCUMENT_UNREADABLE } from "../lib/documentUnderstanding.js";
import { flattenLocationsForPicker, resolveItemRoomName } from "../lib/homeInventory.js";
import { interpolate } from "../lib/homeStrings.js";

// Document Understanding slice — maps the suggestion tool's own field names
// (api/suggest-item-details.js's SUGGEST_TOOL) to the asset field updateAsset() expects,
// and to the translated label/current-value each shows in the confirmation list.
const SUGGEST_DATE_FIELDS = ["purchaseDate", "installDate", "warrantyEndDate"];
const SUGGEST_FIELD_TO_ASSET_KEY = {
  manufacturer: "brand",
  model: "model",
  serialNumber: "serialNumber",
  purchaseDate: "purchasedOn",
  installDate: "installedOn",
  warrantyEndDate: "warrantyExpiresOn",
};
const SUGGEST_FIELD_LABEL_KEYS = {
  manufacturer: "itemDetailSuggestFieldManufacturer",
  model: "itemDetailSuggestFieldModel",
  serialNumber: "itemDetailSuggestFieldSerialNumber",
  purchaseDate: "itemDetailSuggestFieldPurchaseDate",
  installDate: "itemDetailSuggestFieldInstallDate",
  warrantyEndDate: "itemDetailSuggestFieldWarrantyEndDate",
};

// The confirmation list itself — no Modal of its own (ItemDetailSheet's single Modal
// wraps this and its loading/error siblings, one open/close lifecycle instead of two).
// Every checkbox starts UNCHECKED: "never treat model output as authoritative" means
// opt-in per field, not opt-out from a batch.
function SuggestDetailsFields({ t, fmtDate, item, suggestions, busy, error, onCancel, onConfirm }) {
  const fieldKeys = Object.keys(SUGGEST_FIELD_LABEL_KEYS).filter((key) => suggestions[key]);
  const maintenanceSuggestion = suggestions.maintenanceSuggestion || null;
  const [checked, setChecked] = useState({});
  const toggle = (key) => setChecked((c) => ({ ...c, [key]: !c[key] }));
  const anyChecked = fieldKeys.some((key) => checked[key]) || (!!maintenanceSuggestion && checked.maintenance);

  if (fieldKeys.length === 0 && !maintenanceSuggestion) {
    return (
      <>
        <p className="home-group-empty">{t.itemDetailSuggestEmpty}</p>
        <Button variant="secondary" onClick={onCancel}>{t.cancelBtn}</Button>
      </>
    );
  }

  return (
    <>
      <p className="fineprint" style={{ justifyContent: "flex-start", marginBottom: 10 }}>{t.itemDetailSuggestIntro}</p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {fieldKeys.map((key) => {
          const currentValue = item[SUGGEST_FIELD_TO_ASSET_KEY[key]];
          const isDate = SUGGEST_DATE_FIELDS.includes(key);
          return (
            <li key={key} style={{ marginBottom: 10 }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <input type="checkbox" checked={!!checked[key]} onChange={() => toggle(key)} style={{ marginTop: 3, minWidth: 20, minHeight: 20 }} />
                <span>
                  <strong>{t[SUGGEST_FIELD_LABEL_KEYS[key]]}:</strong> {isDate ? fmtDate(suggestions[key]) : suggestions[key]}
                  {currentValue && (
                    <span className="fineprint" style={{ display: "block", justifyContent: "flex-start" }}>
                      {interpolate(t.itemDetailSuggestCurrentValue, { value: isDate ? fmtDate(currentValue) : currentValue })}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
        {maintenanceSuggestion && (
          <li style={{ marginBottom: 10 }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <input type="checkbox" checked={!!checked.maintenance} onChange={() => toggle("maintenance")} style={{ marginTop: 3, minWidth: 20, minHeight: 20 }} />
              <span>
                <strong>{t.itemDetailSuggestMaintenanceTitle}:</strong> {maintenanceSuggestion.title}
                <span className="fineprint" style={{ display: "block", justifyContent: "flex-start" }}>
                  {interpolate(t.myItemsMaintenanceDueOn, { date: fmtDate(maintenanceSuggestion.dueOn) })}
                </span>
              </span>
            </label>
          </li>
        )}
      </ul>
      {error && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start" }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>{t.cancelBtn}</Button>
        <Button
          variant="primary"
          disabled={busy || !anyChecked}
          onClick={() => {
            const selectedFields = {};
            for (const key of fieldKeys) if (checked[key]) selectedFields[key] = suggestions[key];
            onConfirm(selectedFields, !!maintenanceSuggestion && !!checked.maintenance);
          }}
        >
          {t.itemDetailSuggestSave}
        </Button>
      </div>
    </>
  );
}

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

// The error renders INSIDE the modal itself. It used to render as a sibling after
// {showMove && <MoveItemModal/>} instead, which sits behind Modal's own fixed,
// full-viewport overlay (z-index 60) and so was invisible for as long as the modal
// stayed open on a failure (the modal does not close on failure, only `busy` resets) —
// a real bug, found while building the Add Maintenance slice and fixed here. Matches
// every modal built since (AddMaintenanceModal, CancelMaintenanceModal,
// SuggestDetailsFields), which all rendered their own error correctly from the start.
function MoveItemModal({ t, rooms, currentLocationId, busy, error, onCancel, onConfirm }) {
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
      {error && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start", marginBottom: 8 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>{t.cancelBtn}</Button>
        <Button variant="primary" onClick={() => onConfirm(locationId || null)} disabled={busy}>{t.itemDetailMoveSave}</Button>
      </div>
    </Modal>
  );
}

// A due date is required at the contract level (work.maintenance_obligations.due_on is
// not-null, 0072) — "someday" is not a real task Save can express, so the button stays
// disabled until one is actually picked, the same honest-validation idiom canSaveItem()
// already holds for a name.
// failure) — a real, pre-existing placement bug, flagged separately rather than
// replicated here or fixed as a drive-by in an unrelated PR.
function AddMaintenanceModal({ t, busy, error, onCancel, onConfirm }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueOn, setDueOn] = useState("");
  const canSave = !!title.trim() && !!dueOn;
  return (
    <Modal onClose={onCancel}>
      <div className="sheet-title" style={{ marginTop: 0 }}>{t.itemDetailAddMaintenanceAction}</div>
      <label className="field-label" htmlFor="maintenance-title">{t.itemDetailAddMaintenanceTitleLabel}</label>
      <div className="search" style={{ marginBottom: 14 }}>
        <input
          id="maintenance-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t.itemDetailAddMaintenanceTitlePlaceholder}
        />
      </div>
      <label className="field-label" htmlFor="maintenance-description">{t.itemDetailAddMaintenanceDescriptionLabel}</label>
      <div className="search" style={{ marginBottom: 14 }}>
        <input id="maintenance-description" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <label className="field-label" htmlFor="maintenance-due">{t.itemDetailAddMaintenanceDueLabel}</label>
      <div className="search" style={{ marginBottom: 14 }}>
        <input id="maintenance-due" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
      </div>
      {error && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start", marginBottom: 8 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>{t.cancelBtn}</Button>
        <Button
          variant="primary"
          disabled={busy || !canSave}
          onClick={() => onConfirm({ title: title.trim(), description: description.trim(), dueOn })}
        >
          {t.itemDetailAddMaintenanceSave}
        </Button>
      </div>
    </Modal>
  );
}

// Maintenance resolution slice — work.cancel_maintenance_obligation() (0074) requires a
// non-blank reason before it will touch the row at all (raising before ever reaching the
// table's own not-null-when-cancelled check); Confirm stays disabled until one is typed,
// the same required-field idiom AddMaintenanceModal's own due date already holds.
function CancelMaintenanceModal({ t, busy, error, onCancel, onConfirm }) {
  const [reason, setReason] = useState("");
  return (
    <Modal onClose={onCancel}>
      <div className="sheet-title" style={{ marginTop: 0 }}>{t.itemDetailMaintenanceCancelTask}</div>
      <label className="field-label" htmlFor="maintenance-cancel-reason">{t.itemDetailMaintenanceCancelReasonLabel}</label>
      <div className="search" style={{ marginBottom: 14 }}>
        <input
          id="maintenance-cancel-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t.itemDetailMaintenanceCancelReasonPlaceholder}
        />
      </div>
      {error && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start", marginBottom: 8 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>{t.cancelBtn}</Button>
        <Button variant="primary" disabled={busy || !reason.trim()} onClick={() => onConfirm(reason.trim())}>
          {t.itemDetailMaintenanceCancelTask}
        </Button>
      </div>
    </Modal>
  );
}

export function ItemDetailSheet({
  t, ownerId, workspaceId, rooms, fmtDate, item, maintenance, onClose, onEdit, onSaved, onReportProblem,
}) {
  const actorRef = ownerId;
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

  const [showAddMaintenance, setShowAddMaintenance] = useState(false);
  const [addMaintenanceBusy, setAddMaintenanceBusy] = useState(false);
  const [addMaintenanceError, setAddMaintenanceError] = useState("");

  // Maintenance resolution slice. Unlike Move/Retire/Add (which close the whole sheet on
  // success, since `maintenance` is a prop the parent fetches once for the workspace),
  // marking several tasks done or cancelled in one visit is a real, repeatable action --
  // closing the sheet after each one would be real friction. `maintenanceOverrides`
  // reflects a just-confirmed server change locally (applied only AFTER the RPC
  // succeeds, never before) so the sheet can stay open; onSaved() still fires in the
  // background so the parent's own next fetch eventually agrees too.
  const [maintenanceOverrides, setMaintenanceOverrides] = useState({});
  const [resolveBusyId, setResolveBusyId] = useState(null);
  const [resolveError, setResolveError] = useState("");
  const [cancellingId, setCancellingId] = useState(null);

  // maintenance is the workspace-wide list MyItemsPanel.jsx/useHomeContext.js already
  // fetch once (src/lib/maintenance.js's own fetchMaintenanceObligations()) — every row
  // already carries its own assetId, so this narrows to one item without a second fetch.
  const itemMaintenance = (maintenance || [])
    .filter((m) => m.assetId === item.id)
    .map((m) => (maintenanceOverrides[m.id] ? { ...m, ...maintenanceOverrides[m.id] } : m));

  // Document Understanding slice. suggestDoc is which document row triggered this (null
  // = modal closed); suggestions stays null while loading or after a load failure, so
  // "loading" and "loaded with nothing found" are never confused with each other.
  const [suggestDoc, setSuggestDoc] = useState(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [suggestLoadError, setSuggestLoadError] = useState("");
  const [suggestSaveError, setSuggestSaveError] = useState("");
  const [suggestSaving, setSuggestSaving] = useState(false);

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

  const closeSuggest = () => {
    setSuggestDoc(null);
    setSuggestions(null);
    setSuggestLoadError("");
    setSuggestSaveError("");
  };

  const startSuggest = async (doc) => {
    setSuggestDoc(doc);
    setSuggestions(null);
    setSuggestLoadError("");
    setSuggestSaveError("");
    setSuggestLoading(true);
    try {
      const result = await suggestItemDetailsFromDocument({ itemId: item.id, documentId: doc.id });
      setSuggestions(result.suggestions);
    } catch (err) {
      setSuggestLoadError(err.message === DOCUMENT_UNREADABLE ? t.itemDetailSuggestUnreadable : t.itemDetailSuggestFailed);
    } finally {
      setSuggestLoading(false);
    }
  };

  // Closes the whole detail sheet on success, same as Move/Retire below -- `item` is a
  // snapshot prop, so the confirmed brand/model/dates would otherwise keep showing their
  // pre-confirmation values until the caller re-fetches and re-opens it anyway.
  const confirmSuggestions = async (selectedFields, includeMaintenance) => {
    setSuggestSaving(true);
    setSuggestSaveError("");
    try {
      const merged = { ...item };
      for (const [field, value] of Object.entries(selectedFields)) {
        merged[SUGGEST_FIELD_TO_ASSET_KEY[field]] = value;
      }
      await updateAsset(item.id, {
        ownerId, actorRef, previousPhotoPath: item.photoPath,
        name: merged.name, category: merged.category, room: merged.room,
        brand: merged.brand, model: merged.model, purchasedOn: merged.purchasedOn, notes: merged.notes,
        serialNumber: merged.serialNumber, installedOn: merged.installedOn,
        expectedServiceLifeMonths: merged.expectedServiceLifeMonths,
        warrantyExpiresOn: merged.warrantyExpiresOn, condition: merged.condition,
      });
      if (includeMaintenance && suggestions?.maintenanceSuggestion) {
        await createMaintenanceObligation({
          workspaceId, assetId: item.id, actorRef,
          title: suggestions.maintenanceSuggestion.title,
          description: suggestions.maintenanceSuggestion.description,
          dueOn: suggestions.maintenanceSuggestion.dueOn,
        });
      }
      await onSaved();
      onClose();
    } catch {
      setSuggestSaveError(t.itemDetailSuggestSaveFailed);
      setSuggestSaving(false);
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

  // Closes the whole detail sheet on success, same reasoning as confirmMove() above --
  // unlike documents (its own local state, refreshed in place by refreshDocuments()),
  // `maintenance` is a prop the parent fetches once for the whole workspace and passes
  // down; there is no "refresh just this one list" call to make from here.
  const confirmAddMaintenance = async ({ title, description, dueOn }) => {
    setAddMaintenanceError("");
    setAddMaintenanceBusy(true);
    try {
      await createMaintenanceObligation({ workspaceId, assetId: item.id, actorRef, title, description, dueOn });
      await onSaved();
      onClose();
    } catch {
      setAddMaintenanceError(t.itemDetailAddMaintenanceFailed);
      setAddMaintenanceBusy(false);
    }
  };

  // Stays open on success, unlike every other maintenance action here -- see
  // maintenanceOverrides' own comment above for why. onSaved() is fired but not awaited:
  // its own refresh must not gate the local reflection of a change the server has already
  // confirmed.
  const markMaintenanceDone = async (obligationId) => {
    setResolveError("");
    setResolveBusyId(obligationId);
    try {
      await completeMaintenanceObligation(obligationId, actorRef);
      setMaintenanceOverrides((prev) => ({ ...prev, [obligationId]: { status: "completed", isOverdue: false } }));
      onSaved();
    } catch {
      setResolveError(t.itemDetailMaintenanceActionFailed);
    } finally {
      setResolveBusyId(null);
    }
  };

  const openCancelPrompt = (obligationId) => {
    setResolveError("");
    setCancellingId(obligationId);
  };

  const confirmCancelMaintenance = async (reason) => {
    setResolveError("");
    setResolveBusyId(cancellingId);
    try {
      await cancelMaintenanceObligation(cancellingId, reason, actorRef);
      setMaintenanceOverrides((prev) => ({
        ...prev,
        [cancellingId]: { status: "cancelled", isOverdue: false, cancellationReason: reason },
      }));
      setCancellingId(null);
      onSaved();
    } catch {
      setResolveError(t.itemDetailMaintenanceActionFailed);
    } finally {
      setResolveBusyId(null);
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
              <button type="button" className="item-detail-document-suggest" onClick={() => startSuggest(doc)}>
                <Sparkles size={13} aria-hidden="true" /> {t.itemDetailSuggestAction}
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
            <li key={row.id} className="maintenance-row-item">
              <div className="maintenance-row">
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
              </div>
              {row.status === "open" ? (
                <div className="maintenance-row-actions">
                  <button
                    type="button"
                    className="maintenance-row-action"
                    disabled={resolveBusyId === row.id}
                    onClick={() => markMaintenanceDone(row.id)}
                  >
                    <Check size={13} aria-hidden="true" /> {t.itemDetailMaintenanceMarkDone}
                  </button>
                  <button
                    type="button"
                    className="maintenance-row-action"
                    disabled={resolveBusyId === row.id}
                    onClick={() => openCancelPrompt(row.id)}
                  >
                    <X size={13} aria-hidden="true" /> {t.itemDetailMaintenanceCancelTask}
                  </button>
                </div>
              ) : row.status === "completed" ? (
                <Badge tone="sage">{t.itemDetailMaintenanceCompleted}</Badge>
              ) : (
                <p className="fineprint" style={{ justifyContent: "flex-start" }}>
                  {interpolate(t.itemDetailMaintenanceCancelledReason, { reason: row.cancellationReason || "" })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {resolveError && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start" }}>{resolveError}</div>}
      <button type="button" className="home-panel-action" style={{ marginTop: 10, marginBottom: 18 }} onClick={() => setShowAddMaintenance(true)}>
        <Plus size={15} aria-hidden="true" /> {t.itemDetailAddMaintenanceAction}
      </button>

      {cancellingId && (
        <CancelMaintenanceModal
          t={t}
          busy={resolveBusyId === cancellingId}
          error={resolveError}
          onCancel={() => setCancellingId(null)}
          onConfirm={confirmCancelMaintenance}
        />
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
        <button type="button" className="btn-secondary" onClick={() => { setMoveError(""); setShowMove(true); }}>
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

      {suggestDoc && (
        <Modal onClose={closeSuggest}>
          <div className="sheet-title" style={{ marginTop: 0 }}>{t.itemDetailSuggestTitle}</div>
          {suggestLoading ? (
            <p className="home-group-empty">{t.myItemsLoading}</p>
          ) : suggestLoadError ? (
            <>
              <p className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start" }}>{suggestLoadError}</p>
              <Button variant="secondary" onClick={closeSuggest}>{t.cancelBtn}</Button>
            </>
          ) : (
            <SuggestDetailsFields
              t={t}
              fmtDate={fmtDate}
              item={item}
              suggestions={suggestions}
              busy={suggestSaving}
              error={suggestSaveError}
              onCancel={closeSuggest}
              onConfirm={confirmSuggestions}
            />
          )}
        </Modal>
      )}

      {showAddMaintenance && (
        <AddMaintenanceModal
          t={t}
          busy={addMaintenanceBusy}
          error={addMaintenanceError}
          onCancel={() => setShowAddMaintenance(false)}
          onConfirm={confirmAddMaintenance}
        />
      )}

      {showMove && (
        <MoveItemModal
          t={t}
          rooms={rooms}
          currentLocationId={item.locationId}
          busy={moveBusy}
          error={moveError}
          onCancel={() => setShowMove(false)}
          onConfirm={confirmMove}
        />
      )}

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
