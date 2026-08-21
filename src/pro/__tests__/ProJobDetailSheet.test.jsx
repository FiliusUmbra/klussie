// Platform Activation Slice 2, WP 2.4's own real acceptance bar: a professional's job
// detail sheet, reachable for the first time (ProJobs.jsx had no drill-in at all before
// this), showing the timeline, a message-customer entry point, and the customer's own
// property twin once the scoped grant 0161/0162 created resolves it.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../lib/propertyTwin.js", () => ({
  fetchPropertyTwin: vi.fn(),
}));

import { fetchPropertyTwin } from "../../lib/propertyTwin.js";
import { ProJobDetailSheet } from "../ProJobDetailSheet.jsx";
import { LangContext } from "../../lib/lang";

// Returns each key as itself, so assertions name the string key rather than copy —
// matching conversationHome.test.jsx's own established pattern.
const t = new Proxy({}, { get: (_, key) => String(key) });

const ctx = {
  t,
  fmt: (n) => String(n),
  serviceInfo: (id) => ({ name: `service:${id}`, blurb: "" }),
};

function renderSheet({ job: jobOverrides, ...rest } = {}) {
  const job = {
    id: "req-1", serviceId: "svc-plumbing", status: "booked",
    quotes: [{ id: "q-1", price: 120 }], propertyId: "prop-1",
    ...jobOverrides,
  };
  return render(
    <LangContext.Provider value={ctx}>
      <ProJobDetailSheet job={job} customerName="Cathy Customer" onMessage={vi.fn()} onClose={vi.fn()} {...rest} />
    </LangContext.Provider>
  );
}

beforeEach(() => {
  fetchPropertyTwin.mockReset();
  fetchPropertyTwin.mockResolvedValue({ property: null, locations: [], assets: [], documents: [] });
});

describe("ProJobDetailSheet", () => {
  it("shows the job's own service name, customer name, price and timeline", () => {
    renderSheet();
    expect(screen.getByText("service:svc-plumbing")).toBeTruthy();
    expect(screen.getByText("Cathy Customer")).toBeTruthy();
    expect(screen.getByText("€120")).toBeTruthy();
  });

  it("shows a Message customer button that calls onMessage when a conversation exists", () => {
    const onMessage = vi.fn();
    renderSheet({ onMessage });
    fireEvent.click(screen.getByText("messageCustomerBtn"));
    expect(onMessage).toHaveBeenCalled();
  });

  it("hides the Message customer button when no conversation was found (onMessage undefined)", () => {
    renderSheet({ onMessage: undefined });
    expect(screen.queryByText("messageCustomerBtn")).toBeNull();
  });

  it("shows the deliberate no-scope-yet empty state for a job with no property at all — never an error", () => {
    renderSheet({ job: { propertyId: null } });
    expect(fetchPropertyTwin).not.toHaveBeenCalled();
    expect(screen.getByText("twinUnavailableMsg")).toBeTruthy();
  });

  it("fetches the twin for a job's own property id and renders locations/assets/documents once resolved", async () => {
    fetchPropertyTwin.mockResolvedValue({
      property: { id: "prop-1", name: "Kerkstraat 12" },
      locations: [{ id: "loc-1", name: "Kitchen" }],
      assets: [{ id: "asset-1", name: "Boiler", make: "Vaillant", model: "ecoTEC" }],
      documents: [{ id: "doc-1", type_key: "warranty" }],
    });

    renderSheet();

    expect(fetchPropertyTwin).toHaveBeenCalledWith("prop-1");
    await waitFor(() => expect(screen.getByText("Kitchen")).toBeTruthy());
    expect(screen.getByText(/Boiler/)).toBeTruthy();
    expect(screen.getByText(/Vaillant ecoTEC/)).toBeTruthy();
    expect(screen.getByText("documentTypeWarranty")).toBeTruthy();
  });

  it("shows twinNoDataMsg when the property resolves but nothing is recorded yet — not the unavailable message", async () => {
    fetchPropertyTwin.mockResolvedValue({
      property: { id: "prop-1", name: "Kerkstraat 12" },
      locations: [], assets: [], documents: [],
    });

    renderSheet();

    await waitFor(() => expect(screen.getByText("twinNoDataMsg")).toBeTruthy());
    expect(screen.queryByText("twinUnavailableMsg")).toBeNull();
  });

  it("shows twinUnavailableMsg (not twinNoDataMsg) when the property itself never resolves — the real no-scope-yet case", async () => {
    fetchPropertyTwin.mockResolvedValue({ property: null, locations: [], assets: [], documents: [] });

    renderSheet();

    await waitFor(() => expect(screen.getByText("twinUnavailableMsg")).toBeTruthy());
    expect(screen.queryByText("twinNoDataMsg")).toBeNull();
  });

  it("falls back to the raw type_key for a document type this codebase has no label for", async () => {
    fetchPropertyTwin.mockResolvedValue({
      property: { id: "prop-1", name: "X" },
      locations: [], assets: [],
      documents: [{ id: "doc-1", type_key: "some_future_type" }],
    });

    renderSheet();

    await waitFor(() => expect(screen.getByText("some_future_type")).toBeTruthy());
  });
});
