// Keeps 0212_submit_quote_status_guard.sql inside its own stated shape. Found by the
// same systematic *_for_caller() sweep that led to 0210 (PR #155): work.submit_quote()
// never checked the request's own current status before inserting a new quote --
// discovered in a neighbouring function, not the same one, so a new migration rather
// than folding into 0210.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0212_submit_quote_status_guard.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const SIGNATURE =
  "work.submit_quote(\n  p_quote_id                uuid,\n  p_request_id              uuid,\n  p_offering_workspace_id   uuid,\n  p_price                   numeric,\n  p_message                 text,\n  p_event_id                uuid,\n  p_correlation_id          uuid,\n  p_actor_type              platform.actor_type,\n  p_actor_ref               text\n)";

function bodyOf(functionName) {
  const start = codeNoComments.indexOf(`create or replace function ${functionName}`);
  expect(start).toBeGreaterThan(-1);
  const end = codeNoComments.indexOf("\n$$;", start);
  return codeNoComments.slice(start, end);
}

describe("0212_submit_quote_status_guard migration", () => {
  it("refuses when the request is not collecting or quotes_ready -- the new check", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).toMatch(/if not exists \(\s*\n\s*select 1 from work\.requests where id = p_request_id and status in \('collecting', 'quotes_ready'\)/);
  });

  it("uses object_not_in_prerequisite_state, matching work.accept_quote()'s own established shape for an invalid-state quote/request", () => {
    const block = bodyOf(SIGNATURE);
    const start = block.indexOf("if not exists (");
    const end = block.indexOf("end if;", start);
    expect(block.slice(start, end)).toMatch(/using errcode = 'object_not_in_prerequisite_state'/);
  });

  it("evaluates the status check before the insert, so no quote row is ever created for a closed request", () => {
    const block = bodyOf(SIGNATURE);
    const checkIdx = block.indexOf("if not exists (");
    const insertIdx = block.indexOf("insert into work.quotes");
    expect(checkIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(checkIdx);
  });

  it("still allows quotes_ready (a second, third, or Nth quote from a different offeror) -- the marketplace's own core case is unaffected", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).toMatch(/status in \('collecting', 'quotes_ready'\)/);
  });

  it("still delegates the same insert, the same guarded quotes_ready transition, and the same event emission, unchanged from 0090", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).toMatch(/insert into work\.quotes \(id, request_id, offering_workspace_id, price, message\)/);
    expect(block).toMatch(/set status = 'quotes_ready', updated_at = now\(\)\s*\n\s*where id = p_request_id and status = 'collecting'/);
    expect(block).toMatch(/p_event_type\s*=> 'marketplace\.quote\.submitted'/);
  });
});
