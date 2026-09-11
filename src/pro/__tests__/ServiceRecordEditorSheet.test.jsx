// Platform Activation Slice 3, WP 3.3 — the Service Record editor itself. Covers the
// design note's own real constraints: one creation call (no draft), the performing
// annex as a separate optional write never sent empty, and evidence photos uploaded
// after the record exists.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../lib/serviceRecords.js", () => ({
  createServiceRecord: vi.fn(),
  writePerformingAnnex: vi.fn(),
  uploadServiceRecordEvidence: vi.fn(),
}));

import { createServiceRecord, writePerformingAnnex, uploadServiceRecordEvidence } from "../../lib/serviceRecords.js";
import { ServiceRecordEditorSheet } from "../ServiceRecordEditorSheet.jsx";
import { LangContext } from "../../lib/lang";

const t = new Proxy({}, { get: (_, key) => String(key) });
const ctx = { t };

const JOB = { id: "req-1", engagementId: "eng-1", quotes: [{ id: "q-1", price: 240 }] };

function renderEditor(overrides = {}) {
  return render(
    <LangContext.Provider value={ctx}>
      <ServiceRecordEditorSheet job={JOB} workspaceId="ws-pro" actorRef="pro-1" onClose={vi.fn()} onSaved={vi.fn()} {...overrides} />
    </LangContext.Provider>
  );
}

beforeEach(() => {
  createServiceRecord.mockReset();
  createServiceRecord.mockResolvedValue("rec-1");
  writePerformingAnnex.mockReset();
  writePerformingAnnex.mockResolvedValue(undefined);
  uploadServiceRecordEvidence.mockReset();
  uploadServiceRecordEvidence.mockResolvedValue(undefined);
});

describe("ServiceRecordEditorSheet", () => {
  it("pre-fills the price from the job's own accepted quote", () => {
    renderEditor();
    expect(screen.getByDisplayValue("240")).toBeTruthy();
  });

  it("disables Save until work performed has real content — the one required field", () => {
    renderEditor();
    expect(screen.getByText("srSaveBtn").closest("button").disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("srWorkPerformedPlaceholder"), { target: { value: "Replaced the valve." } });
    expect(screen.getByText("srSaveBtn").closest("button").disabled).toBe(false);
  });

  it("saves with exactly one call to createServiceRecord, resolving the engagement id from the job", async () => {
    renderEditor();
    fireEvent.change(screen.getByPlaceholderText("srWorkPerformedPlaceholder"), { target: { value: "Replaced the valve." } });
    fireEvent.click(screen.getByText("srSaveBtn"));

    await waitFor(() => expect(createServiceRecord).toHaveBeenCalledTimes(1));
    expect(createServiceRecord).toHaveBeenCalledWith(expect.objectContaining({
      engagementId: "eng-1", actorRef: "pro-1", workPerformed: "Replaced the valve.", agreedPrice: 240,
    }));
  });

  it("never calls writePerformingAnnex when the private section was left untouched — optional means optional", async () => {
    renderEditor();
    fireEvent.change(screen.getByPlaceholderText("srWorkPerformedPlaceholder"), { target: { value: "Replaced the valve." } });
    fireEvent.click(screen.getByText("srSaveBtn"));

    await waitFor(() => expect(createServiceRecord).toHaveBeenCalled());
    expect(writePerformingAnnex).not.toHaveBeenCalled();
  });

  it("calls writePerformingAnnex as a separate write when the private section has real content", async () => {
    renderEditor();
    fireEvent.change(screen.getByPlaceholderText("srWorkPerformedPlaceholder"), { target: { value: "Replaced the valve." } });
    fireEvent.click(screen.getByText("srAnnexExpand"));
    fireEvent.change(screen.getByLabelText("srInternalCostLabel"), { target: { value: "80" } });
    fireEvent.click(screen.getByText("srSaveBtn"));

    await waitFor(() => expect(writePerformingAnnex).toHaveBeenCalledTimes(1));
    expect(writePerformingAnnex).toHaveBeenCalledWith(expect.objectContaining({ serviceRecordId: "rec-1", internalCost: 80 }));
  });

  it("calls onSaved and onClose once the save completes", async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    renderEditor({ onSaved, onClose });
    fireEvent.change(screen.getByPlaceholderText("srWorkPerformedPlaceholder"), { target: { value: "Replaced the valve." } });
    fireEvent.click(screen.getByText("srSaveBtn"));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  // Found by code audit, 2026-09-11: onSaved() used to sit inside the same try as the
  // real writes, so a failure in the CALLER's own post-save refresh (a second network
  // round-trip after createServiceRecord() already succeeded) showed "could not save
  // this" and kept the sheet open -- even though the record was already real. A pro
  // trusting that message and tapping Save again would call createServiceRecord() a
  // second time for the same job.
  it("still closes on a real, successful save even when the caller's own onSaved() refresh fails", async () => {
    const onSaved = vi.fn().mockRejectedValue(new Error("network blip refetching the record"));
    const onClose = vi.fn();
    renderEditor({ onSaved, onClose });
    fireEvent.change(screen.getByPlaceholderText("srWorkPerformedPlaceholder"), { target: { value: "Replaced the valve." } });
    fireEvent.click(screen.getByText("srSaveBtn"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(createServiceRecord).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("srSaveFailed")).toBeNull();
  });

  // Found by code audit: this used to assert the raw backend error ("insufficient_
  // privilege") rendered verbatim — the exact anti-pattern documents.js's own header
  // names and fixes elsewhere. Updated to pin the fix instead: a real, generic, localized
  // message, never the backend's own words, on the single highest-leverage screen in
  // either roadmap (PLATFORM_ACTIVATION_PROGRAMME.md's own description of this sheet).
  it("shows a generic localized error, never the raw backend message, and keeps the sheet open when the save is refused", async () => {
    createServiceRecord.mockRejectedValue(new Error("insufficient_privilege"));
    const onClose = vi.fn();
    renderEditor({ onClose });
    fireEvent.change(screen.getByPlaceholderText("srWorkPerformedPlaceholder"), { target: { value: "Replaced the valve." } });
    fireEvent.click(screen.getByText("srSaveBtn"));

    await waitFor(() => expect(screen.getByText("srSaveFailed")).toBeTruthy());
    expect(screen.queryByText("insufficient_privilege")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("the private annex is collapsed by default — never shown as the norm", () => {
    renderEditor();
    expect(screen.queryByLabelText("srInternalCostLabel")).toBeNull();
    expect(screen.getByText("srAnnexExpand")).toBeTruthy();
  });

  // Found by code audit, 2026-09-11: this used textAlign:"left" -- physical, unlike the
  // "start" this screen's own users (Arabic/Persian pros, not exempt the way operator
  // tooling is) need to keep the label following reading direction.
  it("the annex toggle label aligns by reading direction, not hardcoded left", () => {
    renderEditor();
    expect(screen.getByText("srAnnexExpand").style.textAlign).toBe("start");
  });
});

// Found by code audit: URL.createObjectURL(f) used to be called inline in the photo
// preview's own render — fresh on every single re-render (every keystroke in any of this
// form's several text fields, not just an actual photo add or remove) for the same
// unchanged File, with the previous render's URL never revoked. A real, unbounded memory
// leak on this codebase's own "highest-leverage single screen in either roadmap."
// ItemFormSheet.jsx/QuoteFormSheet.jsx both already create once (on pick) and revoke once
// (on remove); this sheet now matches that.
// Found by code audit: the "performed at" date used to default via
// `new Date().toISOString().slice(0, 10)` -- always the UTC calendar day, never the
// local one. klussie's own users are Belgian tradespeople, always one or two hours
// ahead of UTC, so in the first hour or two after local midnight the UTC day is still
// yesterday: a job finished at, say, 00:30 local time pre-filled a record dated the day
// before it was actually performed.
describe("ServiceRecordEditorSheet — 'performed at' defaults to the local date, not the UTC one", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("defaults to the pro's own local calendar day even when UTC is still on the previous day", () => {
    vi.stubEnv("TZ", "Europe/Brussels");
    // 2026-01-01T23:30Z is already 2026-01-02 00:30 in Brussels (UTC+1 in January) --
    // the UTC date and the local date disagree by exactly one day.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 0, 1, 23, 30, 0)));

    renderEditor();

    expect(document.getElementById("sr-performed-at").value).toBe("2026-01-02");
  });
});

describe("ServiceRecordEditorSheet — evidence photo previews", () => {
  const file = new File(["x"], "before.jpg", { type: "image/jpeg" });

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:mock-1");
    URL.revokeObjectURL = vi.fn();
  });

  it("creates exactly one object URL per picked file, not once per render", () => {
    renderEditor();
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);

    // A render triggered by something unrelated to photos (typing in a text field) must
    // not create a second object URL for the same already-picked file.
    fireEvent.change(screen.getByPlaceholderText("srWorkPerformedPlaceholder"), { target: { value: "Replaced the valve." } });
    fireEvent.change(screen.getByPlaceholderText("srWorkPerformedPlaceholder"), { target: { value: "Replaced the valve, twice." } });

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("revokes the object URL for a removed photo, and only that one", () => {
    URL.createObjectURL = vi.fn().mockReturnValueOnce("blob:mock-1").mockReturnValueOnce("blob:mock-2");
    renderEditor();
    fireEvent.change(document.querySelector('input[type="file"]'), {
      target: { files: [file, new File(["y"], "after.jpg", { type: "image/jpeg" })] },
    });

    fireEvent.click(screen.getAllByLabelText("itemPhotoRemove")[0]);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-1");
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith("blob:mock-2");
    expect(screen.getAllByLabelText("itemPhotoRemove")).toHaveLength(1);
  });

  it("uploads the real underlying file, not the preview object, once the record is saved", async () => {
    renderEditor();
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });
    fireEvent.change(screen.getByPlaceholderText("srWorkPerformedPlaceholder"), { target: { value: "Replaced the valve." } });
    fireEvent.click(screen.getByText("srSaveBtn"));

    await waitFor(() => expect(uploadServiceRecordEvidence).toHaveBeenCalledWith("rec-1", "ws-pro", "pro-1", file));
  });
});
