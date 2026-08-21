// Platform Activation Slice 2 — closes the customer-side mirror of the same fragmentation
// gap ProJobDetailSheet.jsx just closed for the pro: RequestDetailSheet had no way to
// message the booked pro without leaving to the separate, disconnected Messages tab.
// Narrowly scoped to the new onMessage behaviour — this component has no prior test file,
// and building full coverage of every status branch is a separate undertaking.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../../lib/auth.jsx", () => ({ useAuth: () => ({ user: { id: "customer-1" } }) }));

import { LangContext } from "../../lib/lang";
import { RequestDetailSheet } from "../RequestDetailSheet.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });
const ctx = {
  t,
  fmt: (n) => String(n),
  serviceInfo: (id) => ({ name: `service:${id}`, blurb: "" }),
  proBadgeLabel: () => null,
  whenLabel: (w) => w,
};

const BOOKED_REQUEST = {
  id: "req-1", serviceId: "svc-1", status: "booked", bookedProId: "pro-1",
  answers: { when: "flexible", details: "Fix the leak", fields: {}, aiAnalysis: null },
  quotes: [{ id: "q-1", proId: "pro-1", price: 120, pro: { id: "pro-1", name: "Pierre Pro", rating: 5 } }],
};

function renderSheet(overrides = {}) {
  return render(
    <LangContext.Provider value={ctx}>
      <RequestDetailSheet
        request={BOOKED_REQUEST}
        onClose={vi.fn()}
        onAccept={vi.fn()}
        onComplete={vi.fn()}
        onReview={vi.fn()}
        {...overrides}
      />
    </LangContext.Provider>
  );
}

describe("RequestDetailSheet — Message pro", () => {
  it("shows a Message pro button once a quote is booked, and calls onMessage", () => {
    const onMessage = vi.fn();
    renderSheet({ onMessage });
    fireEvent.click(screen.getByText("messageProBtn"));
    expect(onMessage).toHaveBeenCalled();
  });

  it("hides the button when no conversation was found (onMessage undefined)", () => {
    renderSheet({ onMessage: undefined });
    expect(screen.queryByText("messageProBtn")).toBeNull();
  });

  it("hides the button before any quote is booked, even if onMessage is provided", () => {
    renderSheet({
      request: { ...BOOKED_REQUEST, status: "collecting", bookedProId: null },
      onMessage: vi.fn(),
    });
    expect(screen.queryByText("messageProBtn")).toBeNull();
  });
});
