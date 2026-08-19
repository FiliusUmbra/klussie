-- Epic 14 WP04 — the RLS isolation policies for all three Billing tables.
--
-- INVOICES — WORKSPACE_ID OR payer_workspace_id, THE THIRD OCCURRENCE OF A COMBINED-OR
-- PREDICATE IN THIS SCHEMA
--
-- §22: "Isolation. Workspace-scoped, with financial records additionally visible to the
-- paying party where these differ." Both halves are direct membership checks — no join
-- needed for either, the same simple shape work.engagements' own policy (Epic 12)
-- already uses for its two denormalised parties.
--
-- CREDITS — ONE JOIN DEEPER, THROUGH THE INVOICE IT CORRECTS
--
-- The same one-join-deeper shape property.asset_facets already uses through asset_id
-- (migration 0050) — a credit carries no workspace column of its own (0098's own
-- header), so visibility follows its parent invoice's own combined predicate exactly.
--
-- PAYMENTS — ORDINARY DIRECT MEMBERSHIP
--
-- commerce.payments.workspace_id is who the money moved against, in either direction —
-- a single, ordinary membership check, the same shape work.maintenance_obligations
-- already uses.

drop policy if exists "workspace members can view invoices" on commerce.invoices;
create policy "workspace members can view invoices"
  on commerce.invoices for select
  to authenticated
  using (
    workspace_id in (select workspace_id from api.current_workspace_memberships())
    or payer_workspace_id in (select workspace_id from api.current_workspace_memberships())
  );

drop policy if exists "workspace members can view credits" on commerce.credits;
create policy "workspace members can view credits"
  on commerce.credits for select
  to authenticated
  using (
    invoice_id in (
      select i.id from commerce.invoices i
      where i.workspace_id in (select workspace_id from api.current_workspace_memberships())
         or i.payer_workspace_id in (select workspace_id from api.current_workspace_memberships())
    )
  );

drop policy if exists "workspace members can view payments" on commerce.payments;
create policy "workspace members can view payments"
  on commerce.payments for select
  to authenticated
  using (
    workspace_id in (select workspace_id from api.current_workspace_memberships())
  );
