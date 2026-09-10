// BecomeProSheet.jsx's own tests — none existed before this.
//
// Found by code audit: the catch block did `setError(err.message)`, showing a raw
// Postgres error verbatim (api.become_pro()'s own refusal) — the exact anti-pattern
// documents.js's own header names and fixes ("t.documentFormSaveFailed already
// existed... and was never used").
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const useAuthMock = vi.fn();
vi.mock("../../lib/auth.jsx", () => ({ useAuth: () => useAuthMock() }));

import { LangContext } from "../../lib/lang";
import { BecomeProSheet } from "../BecomeProSheet.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });

function renderSheet() {
  const becomePro = vi.fn(() => Promise.resolve({ workspaceId: "ws-new" }));
  useAuthMock.mockReturnValue({ becomePro });
  const onClose = vi.fn();
  const onDone = vi.fn();
  render(
    <LangContext.Provider value={{ t }}>
      <BecomeProSheet onClose={onClose} onDone={onDone} />
    </LangContext.Provider>
  );
  return { becomePro, onClose, onDone };
}

describe("BecomeProSheet", () => {
  it("creates the pro profile and hands the new workspace id onward", async () => {
    const { becomePro, onDone } = renderSheet();

    fireEvent.click(screen.getByText("becomeProSubmit"));

    await waitFor(() => expect(becomePro).toHaveBeenCalledWith(
      expect.objectContaining({ proType: "flexi", businessName: "", vatNumber: "", bio: "" })
    ));
    expect(onDone).toHaveBeenCalledWith("ws-new");
  });

  it("shows a generic localized error, never the raw backend message, on failure", async () => {
    const becomePro = vi.fn(() => Promise.reject(new Error("new row violates row-level security policy")));
    useAuthMock.mockReturnValue({ becomePro });
    const onDone = vi.fn();
    render(
      <LangContext.Provider value={{ t }}>
        <BecomeProSheet onClose={vi.fn()} onDone={onDone} />
      </LangContext.Provider>
    );

    fireEvent.click(screen.getByText("becomeProSubmit"));

    await waitFor(() => expect(screen.getByText("becomeProFailed")).toBeTruthy());
    expect(screen.queryByText(/row-level security/)).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText("becomeProSubmit").disabled).toBe(false);
  });
});
