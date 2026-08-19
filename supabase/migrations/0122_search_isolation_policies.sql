-- Epic 20 WP02 — RLS isolation for derived.search_index. Two policies, not one, because
-- §15's own words draw the line structurally: "Provider and global search are
-- categorically different... nothing enters public indexes implicitly."
--
-- BUILT NOW EVEN THOUGH NO GRANT OPENS IT YET
--
-- ROLES.md §2.4 names `authenticated` on `derived` as "Not yet... opened per table, by the
-- epic that ships a direct-read path for it" — not this epic. But §15/§30 single out
-- disclosure as Search's uniquely severe failure mode ("its failure mode is disclosure
-- rather than error"), so the predicate is written, reviewed and tested here rather than
-- deferred alongside the grant — the same "policy correct before the door opens" shape
-- Epic 16's and Epic 18's own isolation policies already held before any client caller
-- existed for them.
--
-- POLICY 1 — the six ordinary domains, ordinary direct membership
--
-- workspace/property/asset/conversation/document/knowledge rows are visible only to a
-- member of the row's own workspace_id — the same ADR-0025 backstop shape every
-- workspace-scoped table this session has used. No combined-OR: a search row's viewer is
-- always the workspace that owns the underlying source record, never a second party.
--
-- POLICY 2 — provider and global, published only, no membership required
--
-- The categorically different half. A provider row is visible to anyone once
-- is_published = true, regardless of workspace membership — that is the entire point of a
-- published profile. A global row (world graph, catalogues) is visible to anyone once
-- published, since it was never workspace-scoped to begin with
-- (search_index_global_has_no_workspace, 0121). search_index_published_only_public
-- (0121) already forbids is_published = true anywhere outside these two domains, so this
-- policy cannot be tricked into exposing an ordinary-domain row by that column alone.

drop policy if exists "workspace members can search their own workspace's index" on derived.search_index;
create policy "workspace members can search their own workspace's index"
  on derived.search_index for select
  to authenticated
  using (
    domain not in ('provider', 'global')
    and workspace_id in (select workspace_id from api.current_workspace_memberships())
  );

drop policy if exists "published provider and global rows are public" on derived.search_index;
create policy "published provider and global rows are public"
  on derived.search_index for select
  to anon, authenticated
  using (
    domain in ('provider', 'global')
    and is_published = true
  );
