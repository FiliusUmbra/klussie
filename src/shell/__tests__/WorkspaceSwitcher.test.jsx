// Epic 03 WP12. PLATFORM_DOMAIN_MODEL.md §27's own words are the acceptance bar: "invisible
// for the single-workspace case... no switcher, no label, no explanation" and, once two
// exist, "recognition, not reading."
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const authState = {};
vi.mock("../../lib/auth.jsx", () => ({
  useAuth: () => authState,
}));

import { WorkspaceSwitcher } from "../WorkspaceSwitcher.jsx";

const t = { workspaceSwitchLabel: "Workspace" };

const PERSONAL = { workspace_id: "ws-personal", workspace_type: "personal", workspace_name: "My Home" };
const PROFESSIONAL = { workspace_id: "ws-pro", workspace_type: "professional", workspace_name: "Peter Painter" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WorkspaceSwitcher", () => {
  it("renders nothing for zero or one workspace", () => {
    authState.workspaceMemberships = [];
    const { container: empty } = render(<WorkspaceSwitcher t={t} />);
    expect(empty.firstChild).toBeNull();

    authState.workspaceMemberships = [PERSONAL];
    const { container: one } = render(<WorkspaceSwitcher t={t} />);
    expect(one.firstChild).toBeNull();
  });

  it("lists every workspace by its own name, once there are two or more", () => {
    authState.workspaceMemberships = [PERSONAL, PROFESSIONAL];
    authState.activeWorkspace = PERSONAL;
    authState.setActiveWorkspaceId = vi.fn();

    render(<WorkspaceSwitcher t={t} />);

    expect(screen.getByText("My Home")).toBeTruthy();
    expect(screen.getByText("Peter Painter")).toBeTruthy();
  });

  it("falls back to the type when a workspace has no name", () => {
    authState.workspaceMemberships = [PERSONAL, { ...PROFESSIONAL, workspace_name: null }];
    authState.activeWorkspace = PERSONAL;
    authState.setActiveWorkspaceId = vi.fn();

    render(<WorkspaceSwitcher t={t} />);

    expect(screen.getByText("professional")).toBeTruthy();
  });

  it("marks the active workspace's button, not the others", () => {
    authState.workspaceMemberships = [PERSONAL, PROFESSIONAL];
    authState.activeWorkspace = PROFESSIONAL;
    authState.setActiveWorkspaceId = vi.fn();

    render(<WorkspaceSwitcher t={t} />);

    expect(screen.getByText("Peter Painter").className).toContain("seg-on");
    expect(screen.getByText("My Home").className).not.toContain("seg-on");
  });

  it("switches by calling setActiveWorkspaceId with the picked workspace's id", () => {
    authState.workspaceMemberships = [PERSONAL, PROFESSIONAL];
    authState.activeWorkspace = PERSONAL;
    authState.setActiveWorkspaceId = vi.fn();

    render(<WorkspaceSwitcher t={t} />);
    fireEvent.click(screen.getByText("Peter Painter"));

    expect(authState.setActiveWorkspaceId).toHaveBeenCalledWith("ws-pro");
  });
});
