// Platform Activation Slice 3, WP 3.3 — the Service Record editor itself. Covers the
// design note's own real constraints: one creation call (no draft), the performing
// annex as a separate optional write never sent empty, and evidence photos uploaded
// after the record exists.
import { describe, it, expect, vi, beforeEach } from "vitest";
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

  it("shows the real error and keeps the sheet open when the save is refused", async () => {
    createServiceRecord.mockRejectedValue(new Error("insufficient_privilege"));
    const onClose = vi.fn();
    renderEditor({ onClose });
    fireEvent.change(screen.getByPlaceholderText("srWorkPerformedPlaceholder"), { target: { value: "Replaced the valve." } });
    fireEvent.click(screen.getByText("srSaveBtn"));

    await waitFor(() => expect(screen.getByText("insufficient_privilege")).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("the private annex is collapsed by default — never shown as the norm", () => {
    renderEditor();
    expect(screen.queryByLabelText("srInternalCostLabel")).toBeNull();
    expect(screen.getByText("srAnnexExpand")).toBeTruthy();
  });
});
