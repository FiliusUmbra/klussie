// SuggestServiceSheet.jsx's own tests — Theme E's pro-facing entry point for a service
// not on the current list. Profile.test.jsx covers wiring onMatched into the real
// updateProServices() write; this file covers the sheet's own behavior in isolation.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../lib/serviceSuggestions.js", () => ({
  suggestService: vi.fn(),
}));

import { suggestService } from "../../lib/serviceSuggestions.js";
import { SuggestServiceSheet } from "../SuggestServiceSheet.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });

beforeEach(() => {
  vi.mocked(suggestService).mockReset().mockResolvedValue({ outcome: "new", suggestionId: "sugg-1" });
});

function renderSheet(overrides = {}) {
  const onClose = vi.fn();
  const onMatched = vi.fn().mockResolvedValue(undefined);
  render(<SuggestServiceSheet t={t} workspaceId="ws-1" locale="nl" onClose={onClose} onMatched={onMatched} {...overrides} />);
  return { onClose, onMatched };
}

describe("SuggestServiceSheet — submitting", () => {
  it("disables submit until something is actually typed", () => {
    renderSheet();
    expect(screen.getByText("suggestServiceSubmitBtn").closest("button").disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("suggestServiceDescriptionLabel"), { target: { value: "I clean gutters" } });

    expect(screen.getByText("suggestServiceSubmitBtn").closest("button").disabled).toBe(false);
  });

  it("submits the typed description with the given workspaceId and locale", async () => {
    renderSheet({ workspaceId: "ws-42", locale: "fr" });
    fireEvent.change(screen.getByLabelText("suggestServiceDescriptionLabel"), { target: { value: "I clean gutters" } });

    fireEvent.click(screen.getByText("suggestServiceSubmitBtn"));

    await waitFor(() => expect(suggestService).toHaveBeenCalledWith({ workspaceId: "ws-42", description: "I clean gutters", locale: "fr" }));
  });
});

describe("SuggestServiceSheet — a real match", () => {
  it("attaches the matched service via onMatched and shows the matched message, not the sent one", async () => {
    vi.mocked(suggestService).mockResolvedValue({ outcome: "match", matchedServiceId: "svc-7" });
    const { onMatched } = renderSheet();
    fireEvent.change(screen.getByLabelText("suggestServiceDescriptionLabel"), { target: { value: "I clean gutters" } });

    fireEvent.click(screen.getByText("suggestServiceSubmitBtn"));

    await waitFor(() => expect(onMatched).toHaveBeenCalledWith("svc-7"));
    await waitFor(() => expect(screen.getByText("suggestServiceMatchedMsg")).toBeTruthy());
    expect(screen.queryByText("suggestServiceSentMsg")).toBeNull();
  });

  it("surfaces the generic failure message when attaching a real match fails, not a silent success", async () => {
    vi.mocked(suggestService).mockResolvedValue({ outcome: "match", matchedServiceId: "svc-7" });
    const onMatched = vi.fn().mockRejectedValue(new Error("network error"));
    renderSheet({ onMatched });
    fireEvent.change(screen.getByLabelText("suggestServiceDescriptionLabel"), { target: { value: "I clean gutters" } });

    fireEvent.click(screen.getByText("suggestServiceSubmitBtn"));

    await waitFor(() => expect(screen.getByText("suggestServiceFailed")).toBeTruthy());
    expect(screen.queryByText("suggestServiceMatchedMsg")).toBeNull();
  });
});

describe("SuggestServiceSheet — a new proposal", () => {
  it("shows the sent-for-review message, never claiming the service is already live", async () => {
    renderSheet();
    fireEvent.change(screen.getByLabelText("suggestServiceDescriptionLabel"), { target: { value: "I install solar panels" } });

    fireEvent.click(screen.getByText("suggestServiceSubmitBtn"));

    await waitFor(() => expect(screen.getByText("suggestServiceSentMsg")).toBeTruthy());
  });

  it("closing after success calls onClose", async () => {
    const { onClose } = renderSheet();
    fireEvent.change(screen.getByLabelText("suggestServiceDescriptionLabel"), { target: { value: "I install solar panels" } });
    fireEvent.click(screen.getByText("suggestServiceSubmitBtn"));
    await waitFor(() => expect(screen.getByText("suggestServiceSentMsg")).toBeTruthy());

    fireEvent.click(screen.getByText("closeBtn"));

    expect(onClose).toHaveBeenCalled();
  });
});

describe("SuggestServiceSheet — failure", () => {
  it("shows the generic failure message, never a raw backend error, and stays resubmittable", async () => {
    vi.mocked(suggestService).mockRejectedValue(new Error("SUGGEST_SERVICE_FAILED"));
    renderSheet();
    fireEvent.change(screen.getByLabelText("suggestServiceDescriptionLabel"), { target: { value: "I install solar panels" } });

    fireEvent.click(screen.getByText("suggestServiceSubmitBtn"));

    await waitFor(() => expect(screen.getByText("suggestServiceFailed")).toBeTruthy());
    expect(screen.getByText("suggestServiceSubmitBtn").closest("button").disabled).toBe(false);
  });
});
