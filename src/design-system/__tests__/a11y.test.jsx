// Dialog naming and field-label wiring (live review 2026-10-04, item 13): unnamed dialogs and
// registration inputs with no accessible name.
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { Drawer, Modal } from "../overlays.jsx";
import { associateFieldLabels, nameDialogFromTitle } from "../a11y.js";

describe("associateFieldLabels", () => {
  it("connects a bare field-label to the control inside the next element (the .search wrapper pattern)", () => {
    const root = document.createElement("div");
    root.innerHTML = '<label class="field-label">Email</label><div class="search"><span></span><input type="email"></div>';
    expect(associateFieldLabels(root, "t")).toBe(1);
    const input = root.querySelector("input");
    expect(root.querySelector("label").getAttribute("for")).toBe(input.id);
    expect(input.id).toBeTruthy();
  });

  it("connects each label to its own control, not the neighbour's", () => {
    const root = document.createElement("div");
    root.innerHTML = '<label class="field-label">A</label><input id="a"><label class="field-label">B</label><textarea></textarea>';
    associateFieldLabels(root, "t");
    const [la, lb] = root.querySelectorAll("label");
    expect(la.getAttribute("for")).toBe("a");
    expect(lb.getAttribute("for")).toBe(root.querySelector("textarea").id);
  });

  it("leaves a label with no following control (a chip group) and an already-connected label alone", () => {
    const root = document.createElement("div");
    root.innerHTML = '<label class="field-label">Group</label><button class="chip">x</button><label class="field-label" for="z">Z</label><input id="z">';
    expect(associateFieldLabels(root, "t")).toBe(0);
    expect(root.querySelector("label").hasAttribute("for")).toBe(false);
  });

  it("does not override a control that already carries its own accessible name", () => {
    const root = document.createElement("div");
    root.innerHTML = '<label class="field-label">Q</label><input aria-label="Own name">';
    associateFieldLabels(root, "t");
    expect(root.querySelector("label").hasAttribute("for")).toBe(false);
  });
});

describe("nameDialogFromTitle", () => {
  it("labels the dialog by its .sheet-title, and never overrides an explicit name", () => {
    const panel = document.createElement("div");
    panel.innerHTML = '<div class="sheet-title">Edit profile</div>';
    expect(nameDialogFromTitle(panel, "t")).toBe(true);
    expect(panel.getAttribute("aria-labelledby")).toBe(panel.querySelector(".sheet-title").id);
    const named = document.createElement("div");
    named.setAttribute("aria-label", "Mine");
    named.innerHTML = '<div class="sheet-title">x</div>';
    expect(nameDialogFromTitle(named, "t")).toBe(false);
  });
});

describe("Drawer / Modal accessibility wiring", () => {
  it("gives a Drawer its accessible name from its title, and its inputs theirs from their labels", async () => {
    render(
      <Drawer onClose={() => {}} variant="page">
        <div className="sheet-title">Continue with email</div>
        <label className="field-label">Email address</label>
        <div className="search"><input type="email" /></div>
      </Drawer>
    );
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Continue with email" })).toBeTruthy());
    expect(screen.getByLabelText("Email address").tagName).toBe("INPUT");
  });

  it("keeps wiring controls that appear later (a step change or a revealed field)", async () => {
    function Steps() {
      const [more, setMore] = useState(false);
      return (
        <Drawer onClose={() => {}}>
          <div className="sheet-title">Sign up</div>
          <button type="button" onClick={() => setMore(true)}>reveal</button>
          {more && <><label className="field-label">Full name</label><div className="search"><input /></div></>}
        </Drawer>
      );
    }
    render(<Steps />);
    fireEvent.click(screen.getByText("reveal"));
    await waitFor(() => expect(screen.getByLabelText("Full name")).toBeTruthy());
  });

  it("names a Modal from its title too, but respects an explicit labelledBy", async () => {
    const { unmount } = render(<Modal onClose={() => {}}><div className="sheet-title">Delete this?</div></Modal>);
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Delete this?" })).toBeTruthy());
    unmount();
    render(<Modal onClose={() => {}} labelledBy="mine"><div id="mine">Custom</div><div className="sheet-title">Ignored</div></Modal>);
    expect(screen.getByRole("dialog").getAttribute("aria-labelledby")).toBe("mine");
  });
});
