// Keeps 0130_subscription_contract.sql inside its own stated rules: event_type minted
// correctly, capabilities granted forward and withdrawn in reverse, only the two expected
// exceptions ever swallowed, and the cross-engine grants onto workspace.grant_capability()/
// withdraw_capability() actually present.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0130_subscription_contract.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0130_subscription_contract migration", () => {
  it("defines exactly seven functions, all in commerce, none in api", () => {
    const created = [...codeNoComments.matchAll(/create or replace function (commerce\.\w+|api\.\w+)\(/g)].map((m) => m[1]);
    expect(created.sort()).toEqual([
      "commerce.activate_subscription",
      "commerce.change_plan",
      "commerce.current_subscription_for",
      "commerce.expire_trial",
      "commerce.lapse_subscription",
      "commerce.renew_subscription",
      "commerce.start_trial",
    ]);
  });

  it("every event_type is already dotted <engine>.<aggregate>.<past-participle>, never bare PascalCase", () => {
    const literals = [...codeNoComments.matchAll(/p_event_type\s*=>\s*'([^']+)'/g)].map((m) => m[1]);
    expect(literals.length).toBeGreaterThan(0);
    for (const value of literals) {
      expect(value, `${value} is not dotted lowercase`).toMatch(/^[a-z_]+\.[a-z_]+\.[a-z_]+$/);
    }
    // Two distinct aggregate tokens named in SYSTEM_ARCHITECTURE.md §11.1: subscription and trial
    expect(literals).toEqual(expect.arrayContaining(["subscription.subscription.activated"]));
    expect(literals).toEqual(expect.arrayContaining(["subscription.trial.started"]));
    expect(literals).toEqual(expect.arrayContaining(["subscription.trial.expired"]));
  });

  it("activate_subscription and start_trial grant capabilities in ascending array order", () => {
    for (const fn of ["activate_subscription", "start_trial"]) {
      const start = codeNoComments.indexOf(`create or replace function commerce.${fn}(`);
      const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
      expect(block, `${fn} does not order by ordinality ascending`).toMatch(/order by ordinality\s*\n/);
      expect(block).toMatch(/workspace\.grant_capability/);
    }
  });

  it("lapse_subscription and expire_trial withdraw capabilities in descending (reverse) array order", () => {
    for (const fn of ["lapse_subscription", "expire_trial"]) {
      const start = codeNoComments.indexOf(`create or replace function commerce.${fn}(`);
      const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
      expect(block, `${fn} does not order by ordinality descending`).toMatch(/order by ordinality desc/);
      expect(block).toMatch(/workspace\.withdraw_capability/);
    }
  });

  it("change_plan grants the new bundle ascending and withdraws the removed bundle descending", () => {
    const start = codeNoComments.indexOf("create or replace function commerce.change_plan(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/order by ordinality\s*\n\s*loop\s*\n\s*begin\s*\n\s*perform workspace\.grant_capability/);
    expect(block).toMatch(/order by ordinality desc\s*\n\s*loop\s*\n\s*begin\s*\n\s*perform workspace\.withdraw_capability/);
  });

  it("every grant/withdraw loop swallows only its own specific precondition message", () => {
    const grantSwallows = [...codeNoComments.matchAll(/if sqlerrm not like '([^']+)' then raise; end if;/g)].map((m) => m[1]);
    expect(grantSwallows.length).toBeGreaterThan(0);
    for (const pattern of grantSwallows) {
      expect(["%already holds%", "%does not currently hold%"]).toContain(pattern);
    }
  });

  it("renew_subscription touches no capability at all", () => {
    const start = codeNoComments.indexOf("create or replace function commerce.renew_subscription(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).not.toMatch(/grant_capability|withdraw_capability/);
  });

  it("expire_trial refuses a subscription that is not currently trialing", () => {
    const start = codeNoComments.indexOf("create or replace function commerce.expire_trial(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/if v_status <> 'trialing' then/);
  });

  it("grants klussie_engine_commerce usage on schema workspace and execute on both capability functions — the first cross-engine call this session has made", () => {
    expect(code).toMatch(/grant usage on schema workspace to klussie_engine_commerce/i);
    expect(code).toMatch(/grant execute on function workspace\.grant_capability.*to klussie_engine_commerce/is);
    expect(code).toMatch(/grant execute on function workspace\.withdraw_capability.*to klussie_engine_commerce/is);
  });

  it("every function sets search_path to empty", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?set search_path = (\S+)/gi)];
    expect(fns.length).toBe(7);
    for (const [, name, path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });

  it("grants every function to klussie_engine_commerce only — no api delegate, no client grant", () => {
    expect(code).not.toMatch(/create or replace function api\./);
    expect(code).not.toMatch(/grant execute .* to authenticated/i);
    expect(code).toMatch(/to klussie_engine_commerce/);
  });
});
