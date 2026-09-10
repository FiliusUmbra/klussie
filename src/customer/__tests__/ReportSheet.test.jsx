// ReportSheet.jsx's own tests — none existed before this.
//
// Found by code audit: the catch block did `setError(err.message)`, showing a raw
// Postgres error verbatim (e.g. safety.file_case_for_caller()'s own "no real engagement"
// refusal) — the exact anti-pattern documents.js's own header names and fixes
// ("t.documentFormSaveFailed already existed... and was never used"). Worth closing
// carefully here specifically: this is the Trust & Safety escape valve, not a cosmetic
// screen.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../lib/reports", () => ({ submitReport: vi.fn() }));

import { submitReport } from "../../lib/reports";
import { LangContext } from "../../lib/lang";
import { ReportSheet } from "../ReportSheet.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });

function renderSheet() {
  const onClose = vi.fn();
  render(
    <LangContext.Provider value={{ t }}>
      <ReportSheet reporterId="cathy" reportedWorkspaceId="ws-pierre" requestId="req-1" onClose={onClose} />
    </LangContext.Provider>
  );
  return { onClose };
}

describe("ReportSheet", () => {
  it("submits the chosen reason and details, then shows the sent confirmation", async () => {
    vi.mocked(submitReport).mockResolvedValue();
    renderSheet();

    fireEvent.change(screen.getByText("reportDetailsLabel").nextElementSibling, { target: { value: "Never showed up." } });
    fireEvent.click(screen.getByText("reportSubmitBtn"));

    await waitFor(() => expect(submitReport).toHaveBeenCalledWith({
      reporterId: "cathy", reportedWorkspaceId: "ws-pierre", requestId: "req-1", reason: "no_show", details: "Never showed up.",
    }));
    expect(screen.getByText("reportSentMsg")).toBeTruthy();
  });

  it("shows a generic localized error, never the raw backend message, on failure", async () => {
    vi.mocked(submitReport).mockRejectedValue(new Error("new row violates row-level security policy"));
    renderSheet();

    fireEvent.click(screen.getByText("reportSubmitBtn"));

    await waitFor(() => expect(screen.getByText("reportSubmitFailed")).toBeTruthy());
    expect(screen.queryByText(/row-level security/)).toBeNull();
    // Not silently swallowed into the "sent" confirmation either.
    expect(screen.queryByText("reportSentMsg")).toBeNull();
  });
});
