// Platform Activation Slice 1, WP 1.3 — MyItemsPanel grown from one section (Items) to
// four (Locations, Maintenance, Items, Documents), all real reads now, all but Items
// read-only (no write contract exists yet for Location/Document/Maintenance — Tier 2,
// SLICE_1_PROPERTY_ASSET_ACTIVATION.md WP 1.4-1.7).
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { MyItemsPanel } from "../MyItemsPanel.jsx";

const t = {
  myItemsQuestion: "What do you want to add or find?",
  itemAddTitle: "Add item",
  myItemsRoomsTitle: "Rooms",
  myItemsRoomsEmpty: "No rooms added yet.",
  myItemsMaintenanceTitle: "Maintenance",
  myItemsMaintenanceEmpty: "Nothing scheduled or overdue.",
  myItemsMaintenanceOverdue: "Overdue",
  myItemsMaintenanceDueOn: "Due {date}",
  myItemsLoadFailed: "We couldn't load your items. Please try again later.",
  myItemsLoading: "Loading your items…",
  myItemsEmptyTitle: "You haven't added anything yet.",
  myItemsEmptyHint: "Add your boiler, washing machine or tools.",
  myItemsOneItem: "1 item",
  myItemsCount: "{count} items",
  myItemsDocumentsTitle: "Documents",
  myItemsDocumentsEmpty: "No documents added yet.",
  myItemsDocumentExpired: "Expired",
  myItemsDocumentValidUntil: "Valid until {date}",
};

const fmtDate = (iso) => iso;

const BASE_PROPS = { t, ownerId: "owner-1", items: [], itemsError: null, onRefresh: () => {}, fmtDate };

describe("MyItemsPanel — Locations (WP 1.3)", () => {
  it("shows the empty state when there are no rooms", () => {
    render(<MyItemsPanel {...BASE_PROPS} rooms={[]} documents={[]} maintenance={[]} />);
    expect(screen.getByText("No rooms added yet.")).toBeTruthy();
  });

  it("renders a location tree, nesting children under their parent", () => {
    const rooms = [
      {
        id: "loc-1",
        name: "Ground floor",
        type: "floor",
        children: [{ id: "loc-2", name: "Kitchen", type: "kitchen", children: [] }],
      },
    ];

    render(<MyItemsPanel {...BASE_PROPS} rooms={rooms} documents={[]} maintenance={[]} />);

    expect(screen.getByText("Ground floor")).toBeTruthy();
    expect(screen.getByText("Kitchen")).toBeTruthy();
    expect(screen.getByText("kitchen")).toBeTruthy();
  });
});

describe("MyItemsPanel — Maintenance (WP 1.3)", () => {
  it("shows the empty state when there is nothing scheduled or overdue", () => {
    render(<MyItemsPanel {...BASE_PROPS} rooms={[]} documents={[]} maintenance={[]} />);
    expect(screen.getByText("Nothing scheduled or overdue.")).toBeTruthy();
  });

  it("shows an Overdue badge for an overdue obligation, and a due date for one that isn't", () => {
    const maintenance = [
      { id: "ob-1", title: "Smoke detector check", status: "open", dueOn: "2026-01-01", isOverdue: true },
      { id: "ob-2", title: "Boiler service", status: "open", dueOn: "2026-09-01", isOverdue: false },
    ];

    render(<MyItemsPanel {...BASE_PROPS} rooms={[]} documents={[]} maintenance={maintenance} />);

    expect(screen.getByText("Smoke detector check")).toBeTruthy();
    expect(screen.getByText("Overdue")).toBeTruthy();
    expect(screen.getByText("Boiler service")).toBeTruthy();
    expect(screen.getByText("Due 2026-09-01")).toBeTruthy();
  });

  it("does not show a due-date badge for a settled obligation", () => {
    const maintenance = [{ id: "ob-3", title: "Gutter clean", status: "completed", dueOn: "2026-06-01", isOverdue: false }];

    render(<MyItemsPanel {...BASE_PROPS} rooms={[]} documents={[]} maintenance={maintenance} />);

    expect(screen.getByText("Gutter clean")).toBeTruthy();
    expect(screen.queryByText(/Due /)).toBeNull();
    expect(screen.queryByText("Overdue")).toBeNull();
  });
});

describe("MyItemsPanel — Documents (WP 1.3)", () => {
  it("shows the empty state when there are no documents", () => {
    render(<MyItemsPanel {...BASE_PROPS} rooms={[]} documents={[]} maintenance={[]} />);
    expect(screen.getByText("No documents added yet.")).toBeTruthy();
  });

  it("shows an Expired badge for a document past its valid-until date, and the date for one that isn't", () => {
    const documents = [
      { id: "doc-1", caption: "Old warranty", validUntil: "2020-01-01" },
      { id: "doc-2", caption: "Boiler warranty", validUntil: "2099-01-01" },
    ];

    render(<MyItemsPanel {...BASE_PROPS} rooms={[]} documents={documents} maintenance={[]} />);

    expect(screen.getByText("Old warranty")).toBeTruthy();
    expect(screen.getByText("Expired")).toBeTruthy();
    expect(screen.getByText("Boiler warranty")).toBeTruthy();
    expect(screen.getByText("Valid until 2099-01-01")).toBeTruthy();
  });

  it("falls back to the document's type key when it has no caption", () => {
    const documents = [{ id: "doc-3", caption: null, typeKey: "warranty", validUntil: null }];

    render(<MyItemsPanel {...BASE_PROPS} rooms={[]} documents={documents} maintenance={[]} />);

    expect(screen.getByText("warranty")).toBeTruthy();
  });
});

describe("MyItemsPanel — Items section still works alongside the new ones", () => {
  it("still shows the items-empty state when items is an empty array", () => {
    render(<MyItemsPanel {...BASE_PROPS} rooms={[]} documents={[]} maintenance={[]} />);
    expect(screen.getByText("You haven't added anything yet.")).toBeTruthy();
  });

  it("tolerates rooms/documents/maintenance being undefined (still resolving)", () => {
    render(<MyItemsPanel {...BASE_PROPS} />);
    expect(screen.getByText("No rooms added yet.")).toBeTruthy();
    expect(screen.getByText("Nothing scheduled or overdue.")).toBeTruthy();
    expect(screen.getByText("No documents added yet.")).toBeTruthy();
  });
});
