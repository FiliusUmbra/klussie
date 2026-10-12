// Every api/*.js that calls checkAndLogUsage() must have its ENDPOINT name in the NEWEST
// ai_usage_log_endpoint_check migration. 0227 widened the constraint for the two Stripe Connect
// endpoints but not stripe-subscription-checkout, so that endpoint's first live call would have
// failed on the usage-log insert (found 2026-10-10 while adding property-photo). This is the
// guard that stops the next one.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function newestConstraintList() {
  const dir = join(root, "supabase", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files.reverse()) {
    const sql = readFileSync(join(dir, f), "utf8");
    const m = sql.match(/add constraint ai_usage_log_endpoint_check\s+check \(endpoint in \(([^)]*)\)\)/);
    if (m) return { file: f, names: [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) };
  }
  throw new Error("no ai_usage_log_endpoint_check migration found");
}

describe("ai_usage_log endpoint constraint", () => {
  const { file, names } = newestConstraintList();
  const apiDir = join(root, "api");
  const endpoints = readdirSync(apiDir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => ({ f, src: readFileSync(join(apiDir, f), "utf8") }))
    .filter(({ src }) => src.includes("checkAndLogUsage("))
    .map(({ f, src }) => ({ f, name: src.match(/const ENDPOINT = "([^"]+)"/)?.[1] }));

  it("finds the endpoints (sanity)", () => {
    expect(endpoints.length).toBeGreaterThanOrEqual(10);
    expect(endpoints.every((e) => e.name)).toBe(true);
  });

  it.each(endpoints)("allows $name ($f) in the newest constraint migration", ({ name }) => {
    expect(names, `add '${name}' to a new migration widening ai_usage_log_endpoint_check (newest is ${file})`).toContain(name);
  });
});
