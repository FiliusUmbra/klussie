// Platform Activation Slice 1, WP 1.3 — MyItemsPanel grown from one section (Items) to
// four (Locations, Maintenance, Items, Documents), all real reads now, all but Items
// read-only (no write contract exists yet for Location/Document/Maintenance — Tier 2,
// SLICE_1_PROPERTY_ASSET_ACTIVATION.md WP 1.4-1.7).
//
// WP 1.8 — Locations and Documents gained a real write surface (LocationFormSheet.jsx/
// DocumentUploadSheet.jsx); Maintenance did not (no client caller is named in this work
// package's own scope). Both new libraries are mocked here the same way ItemFormSheet's
// own dependency already is in other test files — this file renders the sheets, not
// their own save logic, which is each sheet's own test's job.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../../lib/locations.js", () => ({ createLocation: vi.fn(() => Promise.resolve({ id: "loc-new" })) }));
vi.mock("../../lib/documents.js", () => ({
  createDocument: vi.fn(() => Promise.resolve({ id: "doc-new" })),
  documentTypeLabelKey: (typeKey) => ({
    warranty: "documentTypeWarranty", certificate: "documentTypeCertificate",
    manual: "documentTypeManual", other: "documentTypeOther",
  })[typeKey] ?? null,
}));

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
  locationFormAddTitle: "Add a room", locationFormNameLabel: "Name",
  locationFormNamePlaceholder: "e.g. Attic", locationFormTypeLabel: "Type",
  locationFormTypePlaceholder: "e.g. bedroom", locationFormParentLabel: "Inside",
  locationFormParentNone: "None — top level", locationFormSaveNew: "Save room",
  documentFormAddTitle: "Add a document", documentFormFileLabel: "File", documentFormFileAdd: "Choose file",
  documentFormTypeLabel: "Type", documentTypeWarranty: "Warranty", documentTypeCertificate: "Certificate",
  documentTypeManual: "Manual", documentTypeOther: "Other",
  documentFormIssuerLabel: "Issuer", documentFormValidUntilLabel: "Valid until", documentFormSaveNew: "Save document",
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

// Home Builder slice — rooms now live prominently in My Home instead (MyHomePanel.jsx's
// own HomeBuilderSection); ConversationHome.jsx passes showRoomsSection={false} on the
// customer path so the room list is not shown twice. The default stays true, unchanged,
// so ProApp.jsx's own "My Business" reuse (MyBusinessPanel.jsx, no My Home equivalent)
// keeps its Rooms section exactly as before without needing to pass anything new.
describe("MyItemsPanel — showRoomsSection (Home Builder slice)", () => {
  it("shows the Rooms section by default, unchanged — this is what My Business reuse relies on", () => {
    render(<MyItemsPanel {...BASE_PROPS} rooms={[]} documents={[]} maintenance={[]} />);
    expect(screen.getByText("Rooms")).toBeTruthy();
    expect(screen.getByText("No rooms added yet.")).toBeTruthy();
  });

  it("hides the Rooms section entirely when showRoomsSection is false", () => {
    render(<MyItemsPanel {...BASE_PROPS} rooms={[]} documents={[]} maintenance={[]} showRoomsSection={false} />);
    expect(screen.queryByText("Rooms")).toBeNull();
    expect(screen.queryByText("No rooms added yet.")).toBeNull();
  });

  it("still hides real rooms, not just the empty state, when showRoomsSection is false", () => {
    const rooms = [{ id: "loc-1", name: "Kitchen", type: "kitchen", children: [] }];
    render(<MyItemsPanel {...BASE_PROPS} rooms={rooms} documents={[]} maintenance={[]} showRoomsSection={false} />);
    expect(screen.queryByText("Kitchen")).toBeNull();
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

  // A real bug, found live 2026-08-28: DocumentUploadSheet.jsx has no caption field at
  // all, so every document created through this app's own UI has caption: null — this
  // fallback path is not an edge case, it is the normal case. It used to render the raw,
  // untranslated typeKey ("warranty") instead of the real localized label, in every
  // locale, for every document, always. documentTypeLabelKey() was already imported and
  // mocked in this very file (used nowhere until now) — the fix was reaching for it.
  it("falls back to the document's real localized type label, never the raw type key, when it has no caption", () => {
    const documents = [{ id: "doc-3", caption: null, typeKey: "warranty", validUntil: null }];

    render(<MyItemsPanel {...BASE_PROPS} rooms={[]} documents={documents} maintenance={[]} />);

    expect(screen.getByText("Warranty")).toBeTruthy();
    expect(screen.queryByText("warranty")).toBeNull();
  });

  it("falls back to the raw type key only for a type this codebase has no label for", () => {
    const documents = [{ id: "doc-4", caption: null, typeKey: "some_future_type", validUntil: null }];

    render(<MyItemsPanel {...BASE_PROPS} rooms={[]} documents={documents} maintenance={[]} />);

    expect(screen.getByText("some_future_type")).toBeTruthy();
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

describe("MyItemsPanel — adding a room or document (WP 1.8)", () => {
  it("withholds both '+' actions when no real property exists yet", () => {
    render(<MyItemsPanel {...BASE_PROPS} rooms={[]} documents={[]} maintenance={[]} />);
    expect(screen.queryByLabelText("Add a room")).toBeNull();
    expect(screen.queryByLabelText("Add a document")).toBeNull();
  });

  it("shows both '+' actions once a real property exists", () => {
    render(<MyItemsPanel {...BASE_PROPS} rooms={[]} documents={[]} maintenance={[]} propertyId="prop-1" workspaceId="ws-1" />);
    expect(screen.getByLabelText("Add a room")).toBeTruthy();
    expect(screen.getByLabelText("Add a document")).toBeTruthy();
  });

  it("opens LocationFormSheet from the Rooms section's '+' action", () => {
    render(<MyItemsPanel {...BASE_PROPS} rooms={[]} documents={[]} maintenance={[]} propertyId="prop-1" workspaceId="ws-1" />);
    fireEvent.click(screen.getByLabelText("Add a room"));
    expect(screen.getByText("Add a room")).toBeTruthy();
    expect(screen.getByLabelText("Name")).toBeTruthy();
  });

  it("opens DocumentUploadSheet from the Documents section's '+' action", () => {
    render(<MyItemsPanel {...BASE_PROPS} rooms={[]} documents={[]} maintenance={[]} propertyId="prop-1" workspaceId="ws-1" />);
    fireEvent.click(screen.getByLabelText("Add a document"));
    expect(screen.getByText("Add a document")).toBeTruthy();
    expect(screen.getByLabelText("File")).toBeTruthy();
  });

  it("does not offer maintenance creation — no client caller is named in this work package's scope", () => {
    render(<MyItemsPanel {...BASE_PROPS} rooms={[]} documents={[]} maintenance={[]} propertyId="prop-1" workspaceId="ws-1" />);
    expect(screen.queryByLabelText(/maintenance/i)).toBeNull();
  });
});
