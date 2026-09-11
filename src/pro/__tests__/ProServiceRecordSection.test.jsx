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
vi.mock("../ServiceRecordEditorSheet.jsx", () => ({
  ServiceRecordEditorSheet: ({ onSaved }) => <button type="button" onClick={onSaved}>trigger-onSaved</button>,
}));

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

// Found by code audit, 2026-09-11: reload()'s own record re-fetch and its call to
// onRecordSaved() used to run as one straight-line sequence, and
// ServiceRecordEditorSheet.jsx's own submit() already treats this whole function as
// best-effort once its real write has succeeded — so a failure in the re-fetch here
// used to be silently swallowed there, leaving `record` at its stale (pre-save, null)
// value with no error shown: the section quietly reverted to the "write it up" button
// for a job that already has a record, inviting createServiceRecord() to be called a
// second time for the same job.
describe("ProServiceRecordSection — reload() after a real save", () => {
  it("shows a load error and a real retry, never a silent 'write it up' invitation, when the post-save re-fetch fails", async () => {
    fetchServiceRecordForRequestMock.mockResolvedValueOnce(null);
    renderSection();
    await screen.findByText("srWriteItUpBtn");

    fireEvent.click(screen.getByText("srWriteItUpBtn"));
    await screen.findByText("trigger-onSaved");
    fetchServiceRecordForRequestMock.mockRejectedValueOnce(new Error("network blip re-fetching the record"));
    fireEvent.click(screen.getByText("trigger-onSaved"));

    await waitFor(() => expect(screen.getByText("catalogLoadFailed")).toBeTruthy());
    expect(screen.queryByText("srWriteItUpBtn")).toBeNull();
  });

  it("shows the real, freshly-saved record once the post-save re-fetch succeeds", async () => {
    fetchServiceRecordForRequestMock.mockResolvedValueOnce(null);
    renderSection();
    await screen.findByText("srWriteItUpBtn");

    fireEvent.click(screen.getByText("srWriteItUpBtn"));
    await screen.findByText("trigger-onSaved");
    fetchServiceRecordForRequestMock.mockResolvedValueOnce(RECORD);
    fireEvent.click(screen.getByText("trigger-onSaved"));

    await waitFor(() => expect(screen.getByText("Replaced the valve.")).toBeTruthy());
  });

  it("does not let a failed onRecordSaved() (ProApp's own job-list refresh) block or mask a successful record re-fetch", async () => {
    fetchServiceRecordForRequestMock.mockResolvedValueOnce(null);
    const onRecordSaved = vi.fn(() => Promise.reject(new Error("network blip refreshing the jobs list")));
    render(
      <LangContext.Provider value={ctx}>
        <ProServiceRecordSection job={JOB} workspaceId="ws-pro" actorRef="pro-1" onRecordSaved={onRecordSaved} />
      </LangContext.Provider>
    );
    await screen.findByText("srWriteItUpBtn");

    fireEvent.click(screen.getByText("srWriteItUpBtn"));
    await screen.findByText("trigger-onSaved");
    fetchServiceRecordForRequestMock.mockResolvedValueOnce(RECORD);
    fireEvent.click(screen.getByText("trigger-onSaved"));

    await waitFor(() => expect(screen.getByText("Replaced the valve.")).toBeTruthy());
  });
});
