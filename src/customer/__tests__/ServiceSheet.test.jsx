// ServiceSheet.jsx's own tests — none existed before this.
//
// Found by code audit: closeLabel was missing on this Drawer, the same regression fixed
// alongside QuoteFormSheet.jsx (see that file's own comment) — every other customer-
// facing Drawer/Modal in the codebase already has it. Currently unreachable in
// production (CustomerApp.jsx's own header), but a real bug the moment this screen is
// reconnected.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { LangContext } from "../../lib/lang";
import { ServiceSheet } from "../ServiceSheet.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });
const ctx = {
  t,
  fmt: (n) => String(n),
  serviceInfo: (id) => ({ name: `service:${id}`, blurb: "" }),
  CATS: [{ id: "plumbing", icon: () => <svg /> }],
};

const SERVICE = { id: "svc-plumbing", cat: "plumbing", mode: "quote", base: 100, pros: 5, rating: 4.5, reviews: 12 };

describe("ServiceSheet", () => {
  it("gives the close button a real accessible name, not the design-system default", () => {
    render(
      <LangContext.Provider value={ctx}>
        <ServiceSheet service={SERVICE} onClose={vi.fn()} onRequest={vi.fn()} />
      </LangContext.Provider>
    );
    expect(screen.getByLabelText("closeBtn")).toBeTruthy();
  });
});
