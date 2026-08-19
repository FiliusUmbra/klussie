// Keeps 0135_personal_workspace_provisioning.sql (Platform Activation Slice 1, WP 1.0)
// inside its own stated rules: the workspace contract refuses a second Personal
// Workspace (a real invariant), the property contract carries no such guard (§9.1
// permits many), every new field in handle_new_user() has the same malformed-falls-
// through-to-mint fallback person_ref already had, and — the one that matters most —
// the whole provisioning block is exception-wrapped so a race here can never fail a
// signup.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0135_personal_workspace_provisioning.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0135_personal_workspace_provisioning migration", () => {
  it("workspace.create_personal_workspace() refuses a second Personal Workspace for the same person", () => {
    const start = codeNoComments.indexOf("create or replace function workspace.create_personal_workspace");
    const end = codeNoComments.indexOf("comment on function workspace.create_personal_workspace");
    const block = codeNoComments.slice(start, end);
    expect(block).toMatch(/raise exception/i);
    expect(block).toMatch(/w\.type = 'personal'/);
    expect(block).toMatch(/m\.role = 'owner'/);
    expect(block).not.toMatch(/security definer/i);
  });

  it("workspace.create_personal_workspace() emits workspace.workspace.created and workspace.membership.joined", () => {
    const start = codeNoComments.indexOf("create or replace function workspace.create_personal_workspace");
    const end = codeNoComments.indexOf("comment on function workspace.create_personal_workspace");
    const block = codeNoComments.slice(start, end);
    expect(block).toMatch(/'workspace\.workspace\.created'/);
    expect(block).toMatch(/'workspace\.membership\.joined'/);
  });

  it("property.create_property() carries no 'already has a property' guard — §9.1 permits many per workspace", () => {
    const start = codeNoComments.indexOf("create or replace function property.create_property");
    const end = codeNoComments.indexOf("comment on function property.create_property");
    const block = codeNoComments.slice(start, end);
    expect(block).not.toMatch(/raise exception/i);
    expect(block).toMatch(/'property\.property\.created'/);
  });

  it("handle_new_user() reads all six new fields with the same malformed-falls-through-to-mint idiom person_ref already has", () => {
    const start = codeNoComments.indexOf("create or replace function public.handle_new_user");
    const end = codeNoComments.indexOf("comment on function public.handle_new_user");
    const block = codeNoComments.slice(start, end);
    for (const field of [
      "workspace_id", "membership_id", "property_id",
      "workspace_event_id", "membership_event_id", "property_event_id",
    ]) {
      expect(block, `missing fallback handling for ${field}`).toMatch(
        new RegExp(`raw_user_meta_data ->> '${field}'`)
      );
    }
    // Six new fields, each wrapped the same way person_ref already is — one
    // invalid_text_representation handler per field, plus the original for person_ref.
    const parseGuards = block.match(/exception when invalid_text_representation then/g) || [];
    expect(parseGuards.length).toBe(7);
  });

  it("wraps the entire new-signup provisioning block in its own exception handler — a race must never fail the signup", () => {
    const start = codeNoComments.indexOf("create or replace function public.handle_new_user");
    const end = codeNoComments.indexOf("comment on function public.handle_new_user");
    const block = codeNoComments.slice(start, end);
    const provisioningStart = block.indexOf("v_workspace_id := nullif(");
    expect(provisioningStart).toBeGreaterThan(-1);
    const afterProvisioning = block.slice(provisioningStart);
    expect(afterProvisioning).toMatch(/exception when others then\s*\n\s*null;/);
  });

  it("checks the same 'already has a personal workspace' predicate before calling either contract function", () => {
    const start = codeNoComments.indexOf("create or replace function public.handle_new_user");
    const callSite = codeNoComments.indexOf("perform workspace.create_personal_workspace", start);
    const guardSite = codeNoComments.lastIndexOf("if not exists (", callSite);
    expect(guardSite).toBeGreaterThan(start);
    const guardBlock = codeNoComments.slice(guardSite, callSite);
    expect(guardBlock).toMatch(/w\.type = 'personal'/);
    expect(guardBlock).toMatch(/m\.role = 'owner'/);
  });

  it("calls property.create_property() only inside the same guarded branch as the workspace call", () => {
    const start = codeNoComments.indexOf("create or replace function public.handle_new_user");
    const workspaceCall = codeNoComments.indexOf("perform workspace.create_personal_workspace", start);
    const propertyCall = codeNoComments.indexOf("perform property.create_property", start);
    expect(propertyCall).toBeGreaterThan(workspaceCall);
    // No second `if not exists` between the two calls — one guard covers both.
    const between = codeNoComments.slice(workspaceCall, propertyCall);
    expect(between).not.toMatch(/if not exists/);
  });

  it("adds no new grant — both new functions stay reachable only as a nested call, matching workspace.current_memberships()'s own posture", () => {
    expect(codeNoComments).not.toMatch(/grant execute on function workspace\.create_personal_workspace/);
    expect(codeNoComments).not.toMatch(/grant execute on function property\.create_property/);
  });
});
