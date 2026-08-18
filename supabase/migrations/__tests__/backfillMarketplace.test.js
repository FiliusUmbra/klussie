// Keeps 0089_backfill_marketplace.sql idempotent (roadmap §3), reusing Epic 03's
// already-resolved workspace_id columns rather than re-deriving the identity chain, and
// excluding cancelled requests from the engagement backfill.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0089_backfill_marketplace.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function section(startMarker, endMarker) {
  const raw = readFileSync(MIGRATION, "utf8");
  const start = raw.indexOf(startMarker);
  const end = endMarker ? raw.indexOf(endMarker, start) : raw.length;
  const slice = raw.slice(start, end === -1 ? raw.length : end);
  return slice
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("0089_backfill_marketplace migration", () => {
  it("reads workspace_id directly from public.service_requests/quotes, never re-derives it via identity.identities", () => {
    expect(codeNoComments).not.toMatch(/identity\.identities/);
    expect(codeNoComments).toMatch(/sr\.workspace_id/);
    expect(codeNoComments).toMatch(/q\.workspace_id/);
  });

  it("requests backfill is idempotent via not-exists on service_request_id", () => {
    const block = section("1 · REQUESTS", "2 · QUOTES");
    expect(block).toMatch(/not exists \(\s*\n\s*select 1 from work\.requests wr where wr\.service_request_id = sr\.id/);
  });

  it("requests backfill mints ids via platform.uuid_v7_at, never gen_random_uuid, and leaves property/asset/location null", () => {
    const block = section("1 · REQUESTS", "2 · QUOTES");
    expect(block).toMatch(/platform\.uuid_v7_at\(sr\.created_at\)/);
    expect(block).not.toMatch(/gen_random_uuid/);
    expect(block).toMatch(/null, null, null,/); // property_id, asset_id, location_id
  });

  it("quotes backfill joins through the already-inserted work.requests row, idempotent via legacy_quote_id", () => {
    const block = section("2 · QUOTES", "3 · ENGAGEMENTS");
    expect(block).toMatch(/join work\.requests wr on wr\.service_request_id = q\.request_id/);
    expect(block).toMatch(/not exists \(\s*\n\s*select 1 from work\.quotes wq where wq\.legacy_quote_id = q\.id/);
  });

  it("engagements backfill only considers booked/completed/reviewed requests with a real accepted quote", () => {
    const block = section("3 · ENGAGEMENTS", null);
    expect(block).toMatch(/where sr\.status in \('booked', 'completed', 'reviewed'\)/);
    expect(block).toMatch(/join public\.quotes q_accepted on q_accepted\.request_id = sr\.id and q_accepted\.status = 'accepted'/);
    expect(block).not.toMatch(/'cancelled'/);
  });

  it("engagements backfill sets status/completed_at consistently with the request's own status", () => {
    const block = section("3 · ENGAGEMENTS", null);
    expect(block).toMatch(
      /case when sr\.status in \('completed', 'reviewed'\) then 'completed' else 'active' end/
    );
    expect(block).toMatch(
      /case when sr\.status in \('completed', 'reviewed'\) then sr\.updated_at else null end/
    );
  });

  it("engagements backfill is idempotent via not-exists on request_id", () => {
    const block = section("3 · ENGAGEMENTS", null);
    expect(block).toMatch(/not exists \(\s*\n\s*select 1 from work\.engagements we where we\.request_id = wr\.id/);
  });
});
