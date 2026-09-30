// Payments Slice A — attribution (0228), pricing (0229), the assessment lifecycle
// (0230), and the live wire into work.approve_location_disclosure() (0231). Same
// static-source-text discipline payoutAccounts.test.js already established.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

function loadNoComments(path) {
  return readFileSync(path, "utf8")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("\n$$;", start);
  return code.slice(start, end);
}

const origin = loadNoComments("supabase/migrations/0228_request_origin_attribution.sql");
const pricing = loadNoComments("supabase/migrations/0229_acquisition_fee_pricing.sql");
const assessments = loadNoComments("supabase/migrations/0230_acquisition_fee_assessments.sql");
const wiring = loadNoComments("supabase/migrations/0231_wire_acquisition_fee_assessment.sql");

describe("0228_request_origin_attribution", () => {
  it("backfills every pre-existing row to unknown, never a chargeable default", () => {
    expect(origin).toMatch(/update work\.requests set origin = 'unknown' where origin is null;/);
  });

  it("defaults every new row to marketplace_match, not unknown", () => {
    expect(origin).toMatch(/alter table work\.requests alter column origin set default 'marketplace_match';/);
  });

  it("names exactly the four real values, including the unreachable professional_supplied", () => {
    expect(origin).toMatch(
      /check \(origin in \('marketplace_match', 'existing_relationship', 'professional_supplied', 'unknown'\)\)/
    );
  });

  it("refuses existing_relationship without a directed_workspace_id — no unproven exemption", () => {
    const block = bodyOf("work.create_request_for_caller", origin);
    expect(block).toMatch(/p_origin = 'existing_relationship' and p_directed_workspace_id is null/);
    expect(block).toMatch(/invalid_parameter_value/);
  });

  it("drops the exact prior signatures before redefining them — the same discipline 0154 established", () => {
    expect(origin).toMatch(
      /drop function if exists work\.create_request\(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, uuid, uuid, platform\.actor_type, text\);/
    );
    expect(origin).toMatch(
      /drop function if exists api\.create_request\(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, jsonb, jsonb, text, uuid, uuid, numeric, uuid, uuid, platform\.actor_type, text\);/
    );
  });
});

describe("0229_acquisition_fee_pricing", () => {
  it("seeds the brief's own TEST-MODE defaults — 5% capped at €75, EUR, test mode", () => {
    expect(pricing).toMatch(/'acquisition_fee', 0\.05, 75\.00, 'EUR', true/);
  });

  it("is append-only — no UPDATE or DELETE survives the guard trigger", () => {
    const block = bodyOf("commerce.pricing_versions_reject_mutation", pricing);
    expect(block).toMatch(/restrict_violation/);
    expect(pricing).toMatch(/before update or delete on commerce\.pricing_versions/);
  });

  it("current_pricing_version() never reads a not-yet-effective row", () => {
    const block = bodyOf("commerce.current_pricing_version", pricing);
    expect(block).toMatch(/pv\.effective_from <= now\(\)/);
  });
});

describe("0230_acquisition_fee_assessments", () => {
  it("allows exactly one row per relationship, forever — the entire race-safety mechanism", () => {
    expect(assessments).toMatch(
      /constraint acquisition_fee_assessments_one_per_relationship\s*\n\s*unique \(requesting_workspace_id, performing_workspace_id\)/
    );
  });

  it("never leaves a not_chargeable row without a reason, or a chargeable one without a pricing snapshot", () => {
    expect(assessments).toMatch(/check \(\(status = 'not_chargeable'\) = \(pricing_version_id is null\)\)/);
    expect(assessments).toMatch(/check \(\(status = 'not_chargeable'\) = \(not_chargeable_reason is not null\)\)/);
  });

  describe("commerce.assess_acquisition_fee_on_engagement() — the eligibility engine", () => {
    const block = () => bodyOf("commerce.assess_acquisition_fee_on_engagement", assessments);

    it("resolves origin through the engagement's own request, not a caller-supplied claim", () => {
      expect(block()).toMatch(/join work\.requests r on r\.id = e\.request_id/);
    });

    it("caps the fee at max_fee, never just the raw rate", () => {
      expect(block()).toMatch(/least\(round\(v_agreed_price \* v_rate, 2\), v_max_fee\)/);
    });

    it("races safely via ON CONFLICT DO NOTHING on the relationship, not a SELECT-then-INSERT check", () => {
      expect(block()).toMatch(/on conflict \(requesting_workspace_id, performing_workspace_id\) do nothing;/);
    });

    it("emits no event for a losing-the-race or non-chargeable row", () => {
      expect(block()).toMatch(/if v_inserted > 0 and v_origin = 'marketplace_match' then/);
    });
  });

  describe("commerce.confirm_payment_received_for_caller() — the interim 'and paid' signal", () => {
    const block = () => bodyOf("commerce.confirm_payment_received_for_caller", assessments);

    it("requires the engagement already completed — the customer's own independent attestation", () => {
      expect(block()).toMatch(/if v_engagement_status <> 'completed' then/);
    });

    it("requires the assessment already accepted by the professional first", () => {
      expect(block()).toMatch(/where a\.id = p_assessment_id and a\.status = 'accepted'/);
    });

    it("composes the existing commerce.issue_invoice(), never re-deriving its arithmetic", () => {
      expect(block()).toMatch(/perform commerce\.issue_invoice\(/);
    });
  });

  describe("commerce.reverse_acquisition_fee_for_caller() — the audited operator correction", () => {
    const block = () => bodyOf("commerce.reverse_acquisition_fee_for_caller", assessments);

    it("requires platform_operations and excludes the support role — 0216's own gate, reused exactly", () => {
      expect(block()).toMatch(/workspace\.workspace_has_capability\(m\.workspace_id, 'platform_operations'\)/);
      expect(block()).toMatch(/m\.role <> 'support'/);
    });

    it("composes the existing commerce.issue_credit(), never writing commerce.credits directly", () => {
      expect(block()).toMatch(/perform commerce\.issue_credit\(/);
    });
  });

  it("reads real assessments only through a membership join, never a bare WHERE", () => {
    const block = bodyOf("commerce.my_acquisition_fee_assessments", assessments);
    expect(block).toMatch(/join workspace\.current_memberships\(\) m on m\.workspace_id = a\.performing_workspace_id/);
  });

  it("grants klussie_engine_work the one cross-schema call it needs, the Epic 22 precedent", () => {
    expect(assessments).toMatch(/grant usage on schema commerce to klussie_engine_work;/);
    expect(assessments).toMatch(
      /grant execute on function commerce\.assess_acquisition_fee_on_engagement\([^)]*\) to klussie_engine_work;/
    );
  });
});

describe("0231_wire_acquisition_fee_assessment", () => {
  it("calls the assessment engine inside the same transaction that activates the engagement", () => {
    const block = bodyOf("work.approve_location_disclosure", wiring);
    expect(block).toMatch(/update work\.engagements set status = 'active' where id = p_engagement_id;/);
    expect(block).toMatch(/perform commerce\.assess_acquisition_fee_on_engagement\(/);
    // The assess call must come after the status flip to active, not before — the
    // booking is confirmed first, the fee decision is a consequence of that fact, not a
    // precondition for it.
    expect(block.indexOf("status = 'active'")).toBeLessThan(block.indexOf("assess_acquisition_fee_on_engagement"));
  });

  it("drops the exact prior six-argument signature before redefining it with eight", () => {
    expect(wiring).toMatch(
      /drop function if exists work\.approve_location_disclosure\(uuid, uuid, uuid, uuid, platform\.actor_type, text\);/
    );
    expect(wiring).toMatch(
      /drop function if exists api\.approve_location_disclosure\(uuid, uuid, uuid, uuid, platform\.actor_type, text\);/
    );
  });

  it("still requires the requesting workspace's own real membership — unchanged from 0183", () => {
    const block = bodyOf("work.approve_location_disclosure", wiring);
    expect(block).toMatch(/from workspace\.current_memberships\(\) m where m\.workspace_id = v_requesting_ws/);
  });
});
