// AppNav.jsx's own tests. Scoped to the FAB (visual-refresh direction, 2026-10-01) —
// everything else about this component is already exercised indirectly through
// CustomerApp/ProApp/OperatorApp's own test files, which this FAB addition must not
// disturb (its own `fab` prop is optional; every existing caller that doesn't pass it
// keeps rendering exactly as before).
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { House, MessageCircle, Plus, Sun, User } from "lucide-react";
import { AppNav } from "../AppNav.jsx";

const ITEMS = [
  { id: "today", label: "Today", icon: Sun },
  { id: "myHome", label: "My Home", icon: House },
  { id: "requests", label: "Requests", icon: User },
  { id: "messages", label: "Messages", icon: MessageCircle },
  { id: "profile", label: "Profile", icon: User },
];

function renderNav({ fab, setTab = vi.fn() } = {}) {
  render(
    <AppNav tab="today" setTab={setTab} items={ITEMS} fab={fab}>
      <div>content</div>
    </AppNav>
  );
  return { setTab };
}

describe("AppNav — FAB", () => {
  it("renders nothing extra when no fab prop is given — every existing caller's own bar is unchanged", () => {
    renderNav();
    expect(screen.queryByLabelText("New request")).toBeNull();
  });

  it("renders the FAB with its own label and icon when a fab prop is given", () => {
    renderNav({ fab: { icon: Plus, label: "New request", onClick: vi.fn() } });
    expect(screen.getByLabelText("New request")).toBeTruthy();
  });

  it("calls the FAB's own onClick, never setTab, when pressed", () => {
    const onClick = vi.fn();
    const { setTab } = renderNav({ fab: { icon: Plus, label: "New request", onClick } });

    fireEvent.click(screen.getByLabelText("New request"));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(setTab).not.toHaveBeenCalled();
  });

  it("sits between the two halves of the flat items, not appended after them", () => {
    renderNav({ fab: { icon: Plus, label: "New request", onClick: vi.fn() } });
    // Math.floor(5 / 2) = 2 — after "My Home", before "Requests" (DOM order, not just
    // visual position, since a screen reader and Tab order both follow it).
    const order = Array.from(document.querySelector(".tabbar").children).map(
      (el) => el.querySelector("[aria-label]")?.getAttribute("aria-label") || el.textContent
    );
    expect(order).toEqual(["Today", "My Home", "New request", "Requests", "Messages", "Profile"]);
  });

  it("every flat tab still calls setTab with its own id, FAB present or not", () => {
    const { setTab } = renderNav({ fab: { icon: Plus, label: "New request", onClick: vi.fn() } });
    // getAllByText, not getByText: AppNav renders the same labelled item twice — a
    // mobile tab bar and a desktop sidebar, one hidden by CSS per breakpoint, both
    // present in jsdom's own DOM since it applies no real layout. Either click reaches
    // the identical setTab handler, so the first match is enough.
    fireEvent.click(screen.getAllByText("Messages")[0]);
    expect(setTab).toHaveBeenCalledWith("messages");
  });
});

// Live review 2026-10-04, item 14: at desktop width the sidebar AND the bottom bar showed
// together, and the sidebar had no new-request action.
describe("AppNav — one primary navigation per breakpoint", () => {
  it("shows a New request action in the desktop sidebar when a fab is given, wired to the same handler", () => {
    const onClick = vi.fn();
    renderNav({ fab: { icon: Plus, label: "New request", onClick } });
    const sidebar = document.querySelector(".app-sidebar");
    const btn = sidebar.querySelector(".sidebar-fab");
    expect(btn.textContent).toContain("New request");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("has no sidebar action when no fab is given (Operator and every existing caller are unchanged)", () => {
    renderNav();
    expect(document.querySelector(".sidebar-fab")).toBeNull();
  });
});

