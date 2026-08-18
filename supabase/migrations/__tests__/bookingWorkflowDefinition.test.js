// Keeps 0070_booking_workflow_definition.sql inside two things at once: the actual
// behaviour of the five legacy triggers it reproduces (migrations 0001, 0012), and
// roadmap §3's idempotency rule, expressed here as a guarded do block rather than a
// plain insert (see the migration's own header for why).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0070_booking_workflow_definition.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0070_booking_workflow_definition migration", () => {
  it("is a single idempotent do block guarded on (definition_key, version) already existing", () => {
    expect(codeNoComments).toMatch(/do \$\$/);
    expect(codeNoComments).toMatch(
      /where definition_key = 'booking_request_lifecycle' and version = 1/
    );
    expect(codeNoComments).toMatch(/then\s*\n\s*return;\s*\n\s*end if;/);
  });

  it("mints every id via platform.uuid_v7_at(now()), never a literal or gen_random_uuid", () => {
    const mintCount = (codeNoComments.match(/platform\.uuid_v7_at\(now\(\)\)/g) || []).length;
    // 1 definition + 5 stages + 6 rules = 12
    expect(mintCount).toBe(12);
    expect(codeNoComments).not.toMatch(/gen_random_uuid/);
  });

  it("declares exactly one definition, platform-scoped (workspace_id null), version 1", () => {
    const start = codeNoComments.indexOf("insert into work.workflow_definitions");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(");", start) + 2);
    expect(block).toMatch(/'booking_request_lifecycle'/);
    expect(block).toMatch(/,\s*\n\s*1,\s*\n\s*null,/);
  });

  it("declares exactly five stages, matching public.service_requests.status' own five values, only reviewed terminal", () => {
    const start = codeNoComments.indexOf("insert into work.workflow_stages");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start));
    for (const stage of ["collecting", "quotes_ready", "booked", "completed", "reviewed"]) {
      expect(block).toMatch(new RegExp(`'${stage}'`));
    }
    expect((block.match(/true\)/g) || []).length).toBe(1);
    expect(block).toMatch(/'reviewed',\s*5,\s*true/);
  });

  it("declares exactly six transition rules, reusing migration 0012's own event names", () => {
    const start = codeNoComments.indexOf("insert into work.workflow_transition_rules");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start));
    const rows = [...block.matchAll(/\(platform\.uuid_v7_at\(now\(\)\), v_definition_id, ([^)]*)\)/g)];
    expect(rows.length).toBe(6);
    for (const eventKey of ["RequestCreated", "QuoteSubmitted", "QuoteAccepted", "JobCompleted", "ReviewSubmitted"]) {
      expect(block).toMatch(new RegExp(`'${eventKey}'`));
    }
  });

  it("has the instance-start rule (from_stage null) and the quotes_ready self-loop rule this epic's own header explains", () => {
    const start = codeNoComments.indexOf("insert into work.workflow_transition_rules");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start));
    expect(block).toMatch(/v_definition_id, null,\s*\n?\s*'collecting',\s*'RequestCreated'/);
    expect(block).toMatch(/'quotes_ready',\s*'quotes_ready',\s*'QuoteSubmitted'/);
  });

  it("actor_role matches the real caller for every rule: customer or pro, never invented", () => {
    const start = codeNoComments.indexOf("insert into work.workflow_transition_rules");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start));
    const actorRoles = [...block.matchAll(/'(customer|pro)'\),?$/gm)];
    expect(actorRoles.length).toBe(6);
    const roleByEvent = {};
    for (const line of block.split("\n")) {
      const m = line.match(/'([A-Za-z]+)',\s*'(customer|pro)'/);
      if (m) roleByEvent[m[1]] = m[2];
    }
    expect(roleByEvent.RequestCreated).toBe("customer");
    expect(roleByEvent.QuoteSubmitted).toBe("pro");
    expect(roleByEvent.QuoteAccepted).toBe("customer");
    expect(roleByEvent.JobCompleted).toBe("customer");
    expect(roleByEvent.ReviewSubmitted).toBe("customer");
  });
});
