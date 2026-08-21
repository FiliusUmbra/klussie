// Platform Activation Slice 1, WP 1.8 — DocumentUploadSheet.jsx's own tests: save stays
// disabled until a file is picked, the type select only ever offers the four real seeded
// values, and createDocument() is called with everything the form collected.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../lib/documents.js", () => ({
  createDocument: vi.fn(() => Promise.resolve({ id: "doc-new" })),
  documentTypeLabelKey: (typeKey) => ({
    warranty: "documentTypeWarranty", certificate: "documentTypeCertificate",
    manual: "documentTypeManual", other: "documentTypeOther",
  })[typeKey] ?? null,
}));

import { createDocument } from "../../lib/documents.js";
import { DocumentUploadSheet } from "../DocumentUploadSheet.jsx";

const t = {
  documentFormAddTitle: "Add a document", documentFormFileLabel: "File", documentFormFileAdd: "Choose file",
  documentFormTypeLabel: "Type", documentTypeWarranty: "Warranty", documentTypeCertificate: "Certificate",
  documentTypeManual: "Manual", documentTypeOther: "Other",
  documentFormIssuerLabel: "Issuer", documentFormValidUntilLabel: "Valid until", documentFormSaveNew: "Save document",
};

const FILE = new File(["content"], "warranty.pdf", { type: "application/pdf" });

beforeEach(() => {
  vi.clearAllMocks();
});

function fileInput() {
  return document.querySelector('input[type="file"]');
}

describe("DocumentUploadSheet", () => {
  it("disables save until a file is picked", () => {
    render(<DocumentUploadSheet t={t} propertyId="prop-1" workspaceId="ws-1" actorRef="owner-1" onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByText("Save document").closest("button").disabled).toBe(true);
  });

  it("offers only the four real seeded types", () => {
    render(<DocumentUploadSheet t={t} propertyId="prop-1" workspaceId="ws-1" actorRef="owner-1" onClose={() => {}} onSaved={() => {}} />);
    const options = screen.getByLabelText("Type").querySelectorAll("option");
    expect(Array.from(options).map((o) => o.textContent)).toEqual(["Warranty", "Certificate", "Manual", "Other"]);
  });

  it("calls createDocument with everything collected once a file is picked and saved", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn(() => Promise.resolve());
    render(<DocumentUploadSheet t={t} propertyId="prop-1" workspaceId="ws-1" actorRef="owner-1" onClose={onClose} onSaved={onSaved} />);

    fireEvent.change(fileInput(), { target: { files: [FILE] } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "certificate" } });
    fireEvent.change(screen.getByLabelText("Issuer"), { target: { value: "Vaillant" } });
    fireEvent.change(screen.getByLabelText("Valid until"), { target: { value: "2029-01-20" } });
    fireEvent.click(screen.getByText("Save document"));

    await waitFor(() => expect(createDocument).toHaveBeenCalledWith({
      propertyId: "prop-1", workspaceId: "ws-1", actorRef: "owner-1",
      typeKey: "certificate", issuer: "Vaillant", validUntil: "2029-01-20", file: FILE,
    }));
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("sends null for validUntil when it is left blank", async () => {
    const onSaved = vi.fn(() => Promise.resolve());
    render(<DocumentUploadSheet t={t} propertyId="prop-1" workspaceId="ws-1" actorRef="owner-1" onClose={() => {}} onSaved={onSaved} />);

    fireEvent.change(fileInput(), { target: { files: [FILE] } });
    fireEvent.click(screen.getByText("Save document"));

    await waitFor(() => expect(createDocument).toHaveBeenCalledWith(expect.objectContaining({ validUntil: null })));
  });

  it("shows the real error and stays open when the save fails", async () => {
    createDocument.mockRejectedValue(new Error("insufficient_privilege"));
    const onClose = vi.fn();
    render(<DocumentUploadSheet t={t} propertyId="prop-1" workspaceId="ws-1" actorRef="owner-1" onClose={onClose} onSaved={() => {}} />);

    fireEvent.change(fileInput(), { target: { files: [FILE] } });
    fireEvent.click(screen.getByText("Save document"));

    await waitFor(() => expect(screen.getByText("insufficient_privilege")).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
  });
});
