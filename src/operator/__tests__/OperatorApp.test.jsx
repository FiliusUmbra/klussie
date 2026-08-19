// Platform Activation Slice 0, WP 0.5/0.6 — the shell now renders the real AuditLog
// (WP 0.6), which fetches on mount; supabaseClient is mocked here for the same reason
// auditRecords.test.js and operatorContext.test.js mock it, not because this file
// exercises the fetch itself — that behaviour is AuditLog's own test's job.
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("../../lib/supabaseClient", () => ({
  supabase: {
    schema: () => ({ rpc: () => Promise.resolve({ data: [], error: null }) }),
  },
}));

import { OperatorApp } from "../OperatorApp.jsx";

describe("OperatorApp", () => {
  it("identifies itself as the Operations Workspace, distinctly from Customer/Pro", () => {
    render(<OperatorApp />);

    expect(screen.getByText("Klussie Operations")).toBeTruthy();
  });

  it("shows one tab, Audit, selected by default", () => {
    render(<OperatorApp />);

    const tab = screen.getByRole("tab", { name: "Audit" });
    expect(tab.getAttribute("aria-selected")).toBe("true");
  });

  it("renders the real Audit viewer under the Audit tab, not a placeholder", async () => {
    render(<OperatorApp />);

    await waitFor(() => expect(screen.getByText("No matching audit records.")).toBeTruthy());
  });
});
