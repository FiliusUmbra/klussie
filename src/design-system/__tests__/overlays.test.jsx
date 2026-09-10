// overlays.jsx's own tests — none existed before this, despite useFocusTrap() being the
// shared accessibility primitive every dialog in the app depends on.
//
// Found by code audit: useFocusTrap() was written to be shared by both overlays (its
// own header says so) and Modal already called it — but Drawer, the far more heavily
// used of the two (every sheet in the app; Modal is only the two delete confirmations
// and the onboarding tour), never actually did. Tab walked straight out of every Drawer
// into the page behind it — exactly the problem this code claims, in its own comment,
// to have already fixed everywhere.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Drawer, Modal } from "../overlays.jsx";

function TabKey(target, { shift = false } = {}) {
  fireEvent.keyDown(target, { key: "Tab", shiftKey: shift });
}

describe.each([
  ["Drawer", Drawer],
  ["Modal", Modal],
])("%s — focus trap", (name, Overlay) => {
  it("moves focus inside the dialog on open, rather than leaving it on the page behind it", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();

    render(
      <Overlay onClose={() => {}}>
        <button>First</button>
        <button>Second</button>
      </Overlay>
    );

    // The close button renders before any children, so it's the real first focusable
    // element in DOM order — not the content's own "First" button.
    expect(document.activeElement).toBe(screen.getByLabelText("Close"));
    opener.remove();
  });

  it("wraps Tab from the last item back to the first, keeping focus inside", () => {
    const { container } = render(
      <Overlay onClose={() => {}}>
        <button>First</button>
        <button>Second</button>
      </Overlay>
    );
    const panel = container.querySelector('[role="dialog"]');
    const closeBtn = screen.getByLabelText("Close");
    const last = screen.getByText("Second");

    last.focus();
    TabKey(panel);

    // The close button is the actual first focusable element in DOM order (it renders
    // before children); wrapping Tab from the last item must land back at the start of
    // that same order, not merely "somewhere".
    expect(document.activeElement).toBe(closeBtn);
  });

  it("wraps Shift+Tab from the first item to the last, keeping focus inside", () => {
    const { container } = render(
      <Overlay onClose={() => {}}>
        <button>First</button>
        <button>Second</button>
      </Overlay>
    );
    const panel = container.querySelector('[role="dialog"]');
    const closeBtn = screen.getByLabelText("Close");
    const last = screen.getByText("Second");

    closeBtn.focus();
    TabKey(panel, { shift: true });

    expect(document.activeElement).toBe(last);
  });

  it("restores focus to whatever was focused before the dialog opened, once it closes", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(<Overlay onClose={() => {}}><button>Inside</button></Overlay>);
    expect(document.activeElement).not.toBe(opener);

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("marks itself as a real dialog for assistive technology", () => {
    const { container } = render(<Overlay onClose={() => {}} labelledBy="t1"><button>x</button></Overlay>);
    const panel = container.querySelector('[role="dialog"]');
    expect(panel.getAttribute("aria-modal")).toBe("true");
    expect(panel.getAttribute("aria-labelledby")).toBe("t1");
  });

  // The default ("Close") is a real, deliberate fallback for callers with no i18n
  // context at all (the operator tool's own sheets) — every localized caller is
  // expected to pass its own t.closeBtn instead, which every ordinary sheet in the app
  // now does. This pins that the override actually takes effect, not just that a
  // default exists.
  it("uses a passed closeLabel as the close button's real accessible name, not just the default", () => {
    render(<Overlay onClose={() => {}} closeLabel="Sluiten"><button>x</button></Overlay>);
    expect(screen.getByLabelText("Sluiten")).toBeTruthy();
    expect(screen.queryByLabelText("Close")).toBeNull();
  });
});

describe("Drawer/Modal — Escape and backdrop click", () => {
  it("Drawer calls onClose on Escape and on a backdrop click, not on a click inside the panel", () => {
    const onClose = vi.fn();
    const { container } = render(<Drawer onClose={onClose}><button>Inside</button></Drawer>);

    fireEvent.click(screen.getByText("Inside"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(container.querySelector(".sheet-overlay"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(container.querySelector(".sheet-overlay"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
