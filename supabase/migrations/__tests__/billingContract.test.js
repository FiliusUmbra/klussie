// Keeps 0101_billing_contract.sql inside §11.2's own rules: composed writers (the
// commission function calls the general invoice writer, never a duplicate insert path),
// direction-aware event names matching the frozen list (plus one named, deliberate gap),
// and settling an invoice-linked payment updating the invoice in the same transaction.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0101_billing_contract.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0101_billing_contract migration", () => {
  it("defines exactly ten functions, all in commerce, none in api", () => {
    const created = [...codeNoComments.matchAll(/create or replace function (commerce\.\w+|api\.\w+)\(/g)].map((m) => m[1]);
    expect(created.sort()).toEqual([
      "commerce.fail_payment",
      "commerce.invoice_credits",
      "commerce.issue_credit",
      "commerce.issue_invoice",
      "commerce.issue_marketplace_commission_invoice",
      "commerce.record_payment",
      "commerce.resolve_invoice",
      "commerce.settle_payment",
      "commerce.workspace_invoices",
      "commerce.workspace_payments",
    ]);
  });

  it("issue_invoice computes tax_amount/total itself, never trusts a caller-supplied total", () => {
    const start = codeNoComments.indexOf("create or replace function commerce.issue_invoice(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).not.toMatch(/p_total/);
    expect(block).toMatch(/v_tax_amount := round\(p_subtotal \* coalesce\(p_tax_rate, 0\), 2\)/);
    expect(block).toMatch(/v_total := p_subtotal \+ v_tax_amount/);
  });

  it("issue_marketplace_commission_invoice resolves a real engagement and composes issue_invoice, never a duplicate insert", () => {
    const start = codeNoComments.indexOf("create or replace function commerce.issue_marketplace_commission_invoice(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/select agreed_price, performing_workspace_id/);
    expect(block).toMatch(/from work\.engagements/);
    expect(block).toMatch(/perform commerce\.issue_invoice\(/);
    expect(block).not.toMatch(/insert into commerce\.invoices/);
    expect(block).not.toMatch(/p_commission_rate\s*:=|commission_rate numeric.*default/); // never a hardcoded default rate
  });

  it("record_payment emits billing.payment.authorized for inbound, billing.payout.initiated for outbound", () => {
    const start = codeNoComments.indexOf("create or replace function commerce.record_payment(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/case when p_direction = 'inbound' then 'billing\.payment\.authorized' else 'billing\.payout\.initiated' end/);
  });

  it("settle_payment updates the linked invoice to paid, only for an inbound payment against an issued invoice, in the same transaction", () => {
    const start = codeNoComments.indexOf("create or replace function commerce.settle_payment(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/if v_invoice_id is not null and v_direction = 'inbound' then/);
    expect(block).toMatch(/update commerce\.invoices set status = 'paid' where id = v_invoice_id and status = 'issued'/);
    expect(block).toMatch(/case when v_direction = 'inbound' then 'billing\.payment\.settled' else 'billing\.payout\.settled' end/);
  });

  it("fail_payment emits billing.payment.failed or billing.payout.failed, the latter a named extension beyond the frozen list", () => {
    const start = codeNoComments.indexOf("create or replace function commerce.fail_payment(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/case when v_direction = 'inbound' then 'billing\.payment\.failed' else 'billing\.payout\.failed' end/);
    expect(block).not.toMatch(/update commerce\.invoices/); // no invoice status change on failure
  });

  it("issue_credit requires a non-blank reason and moves the invoice to credited in the same transaction", () => {
    const start = codeNoComments.indexOf("create or replace function commerce.issue_credit(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/if p_reason is null or btrim\(p_reason\) = '' then/);
    expect(block).toMatch(/update commerce\.invoices set status = 'credited' where id = p_invoice_id/);
  });

  it("workspace_invoices matches either the workspace or its distinct payer", () => {
    const start = codeNoComments.indexOf("create or replace function commerce.workspace_invoices(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/i\.workspace_id = p_workspace_id or i\.payer_workspace_id = p_workspace_id/);
  });

  it("invoice_credits orders oldest first, issued_at then id", () => {
    const start = codeNoComments.indexOf("create or replace function commerce.invoice_credits(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/order by c\.issued_at, c\.id/);
  });

  it("every function sets search_path to empty", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?set search_path = (\S+)/gi)];
    expect(fns.length).toBe(10);
    for (const [, name, path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });

  it("grants every function to klussie_engine_commerce only — no api delegate, no authenticated/anon grant", () => {
    const grants = [...code.matchAll(/grant execute on function (commerce\.\w+)\([^)]*\)\s*\n\s*to (\w+)/g)];
    expect(grants.length).toBe(10);
    for (const [, , role] of grants) {
      expect(role).toBe("klussie_engine_commerce");
    }
    expect(code).not.toMatch(/create or replace function api\./);
    expect(code).not.toMatch(/grant execute .* to authenticated/i);
  });

  it("revokes all ten functions from public, anon, authenticated and service_role before granting", () => {
    const revokes = [...code.matchAll(/revoke all on function (commerce\.\w+)\([^)]*\)\s*\n\s*from public, anon, authenticated, service_role/g)];
    expect(revokes.length).toBe(10);
  });
});
