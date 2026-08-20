// Keeps 0102_timeline_twin_access.sql inside its own stated rules: klussie_engine_property
// gets exactly the platform.events and work-schema access Timeline/Twin need, named and
// narrow, and the pre-existing platform.events RLS gap (klussie_consumer_delivery has held a
// SELECT grant since Epic 01 that a missing policy made dead) is fixed in the same statement.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0102_timeline_twin_access.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0102_timeline_twin_access migration", () => {
  it("grants klussie_engine_property USAGE on platform, which it never held before", () => {
    expect(codeNoComments).toMatch(/grant usage on schema platform to klussie_engine_property/i);
  });

  it("creates one policy on platform.events naming both trusted roles, using (true)", () => {
    expect(codeNoComments).toMatch(
      /create policy events_engine_read on platform\.events\s*\n\s*for select\s*\n\s*to klussie_consumer_delivery, klussie_engine_property\s*\n\s*using \(true\)/
    );
  });

  it("grants klussie_engine_property SELECT on platform.events", () => {
    expect(codeNoComments).toMatch(/grant select on platform\.events to klussie_engine_property/i);
  });

  it("grants exactly the six named work-schema tables, nothing else in work", () => {
    const start = codeNoComments.indexOf("grant select on\n  work.conversations");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start) + 1);
    for (const table of [
      "work.conversations",
      "work.messages",
      "work.engagements",
      "work.requests",
      "work.maintenance_obligations",
      "work.service_records",
    ]) {
      expect(block, `missing grant on ${table}`).toMatch(new RegExp(table.replace(".", "\\.")));
    }
    expect(block).not.toMatch(/work\.workflow/);
    expect(block).not.toMatch(/work\.quotes/);
  });

  it("does not touch anon, authenticated or service_role", () => {
    expect(codeNoComments).not.toMatch(/to (anon|authenticated|service_role)/i);
  });

  it("does not grant or resolve anything document-shaped — deliberately excluded this epic", () => {
    expect(codeNoComments).not.toMatch(/document_attachments/);
    expect(codeNoComments).not.toMatch(/property\.documents/);
  });

  it("never touches property.timeline_segment or property.assemble_twin directly — this migration is access only", () => {
    expect(codeNoComments).not.toMatch(/create (or replace )?function/i);
  });
});
