// ProServiceRecordSection.jsx's own tests — none existed directly for this file before
// this (ProJobDetailSheet.test.jsx exercises it indirectly, but only the success paths).
//
// Found by code audit: fetchServiceRecordForRequest() throws on a real Postgres error,
// and the initial-load effect had no catch of its own -- loading stayed stuck at true
// forever, leaving this whole section permanently blank. Deliberately not resolved by
// falling into the existing !record empty state (a real "write it up" button): a record
// that actually exists but merely failed to load would risk createServiceRecord() being
// called a second time for the same job.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const fetchServiceRecordForRequestMock = vi.fn();
vi.mock("../../lib/serviceRecords.js", () => ({
  fetchServiceRecordForRequest: (...args) => fetchServiceRecordForRequestMock(...args),
}));
vi.mock("../ServiceRecordEditorSheet.jsx", () => ({ ServiceRecordEditorSheet: () => null }));

import { LangContext } from "../../lib/lang";
import { ProServiceRecordSection } from "../ProServiceRecordSection.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });
const ctx = { t, fmtDate: (ts) => `date:${ts}` };

const JOB = { id: "req-1" };
const RECORD = { id: "rec-1", workPerformed: "Replaced the valve." };

function renderSection() {
  return render(
    <LangContext.Provider value={ctx}>
      <ProServiceRecordSection job={JOB} workspaceId="ws-pro" actorRef="pro-1" onRecordSaved={vi.fn()} />
    </LangContext.Provider>
  );
}

describe("ProServiceRecordSection — initial load", () => {
  it("shows the real 'write it up' entry point once the load succeeds and finds no record", async () => {
    fetchServiceRecordForRequestMock.mockResolvedValue(null);
    renderSection();
    await screen.findByText("srWriteItUpBtn");
  });

  it("renders the real record once the load succeeds and finds one", async () => {
    fetchServiceRecordForRequestMock.mockResolvedValue(RECORD);
    renderSection();
    await screen.findByText("Replaced the valve.");
  });

  it("shows a generic localized message and a real retry, never a permanently blank section, when the load fails", async () => {
    fetchServiceRecordForRequestMock.mockRejectedValue(new Error("relation \"service_records\" does not exist"));
    renderSection();

    await waitFor(() => expect(screen.getByText("catalogLoadFailed")).toBeTruthy());
    expect(screen.queryByText(/does not exist/)).toBeNull();
    // Not the "write it up" entry point either — a real failure must not look like an
    // invitation to create a second record for a job that may already have one.
    expect(screen.queryByText("srWriteItUpBtn")).toBeNull();

    fetchServiceRecordForRequestMock.mockResolvedValueOnce(null);
    fireEvent.click(screen.getByText("retryBtn"));

    await waitFor(() => expect(screen.getByText("srWriteItUpBtn")).toBeTruthy());
  });
});
