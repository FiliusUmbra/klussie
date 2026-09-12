-- Pro Workspace join-request slice — found while building the first real caller of
-- workspace.decide_permission() (0036) since ADR-0027 shipped it. A real, confirmed,
-- previously-latent bug, not a hypothetical.
--
-- THE BUG, CONFIRMED BY READING EVERY REAL workspace.memberships.role INSERT IN THIS
-- REPOSITORY, NOT ASSUMED
--
-- workspace.role_permissions.role_name (0036's own seed data) uses ADR-0027's own
-- display-styled vocabulary verbatim: 'Owner', 'Household member', 'Manager', 'Employee',
-- 'Contractor', 'Guest', 'Administrator', 'Team member', 'Auditor / Viewer', 'External
-- provider'. Every real INSERT into workspace.memberships across this entire codebase --
-- workspace.create_personal_workspace_for_caller() (0135), workspace.create_professional_
-- workspace_for_caller() (0168), the platform-operator bootstrap (0144), every backfill
-- (0033-0035) -- has only ever written lowercase 'owner'. workspace.decide_permission()
-- (0036) joins role_permissions.role_name = ctx.role with a plain, case-sensitive text
-- equals. 'owner' <> 'Owner': every real membership this platform has ever created would
-- be denied every permission it should hold, the instant anything actually called
-- decide_permission() for one -- which nothing has, until this slice. Confirmed nothing
-- else does: `grep -rn "decide_permission" src supabase/migrations` outside 0036's own
-- migration and tests turns up exactly one real caller, src/lib/workspaceContext.js's own
-- header, which names it only to say "this module still has no need for [it]." Dormant,
-- not exercised -- exactly the shape of bug this session's own audits keep finding.
--
-- THE FIX IS TO THE VOCABULARY'S OWN DATA, NEVER TO workspace.memberships.role
--
-- workspace.memberships.role is the load-bearing side: dozens of migrations across every
-- engine (locations, assets, documents, quotes, engagements, safety cases, the operator
-- bootstrap) compare it to lowercase 'owner' today, live, on real accounts. Changing that
-- column's real values to match ADR-0027's capitalization instead would be a genuinely
-- platform-wide, high-risk migration touching every one of those call sites at once -- not
-- this slice's problem to solve, and not a safe change to make in passing. role_permissions
-- is the side that has never yet been read by anything real (confirmed above): lowercasing
-- it costs nothing today and is exactly what makes the ONE role every real membership
-- actually holds -- 'owner' -- resolve correctly the first time anything asks. The nine
-- other role names in this table have never been assigned to a single real membership
-- either (confirmed by grep) -- lowercased here too, once, now, so the same mismatch does
-- not reappear the day one of them is.
update workspace.role_permissions
set role_name = lower(role_name)
where role_name <> lower(role_name);

comment on table workspace.role_permissions is
  'The role -> permission bundles ADR-0027 defines. Configuration, not an aggregate: nothing references a row by identity, only by (workspace_type, role_name, permission_key). role_name is lowercase, matching workspace.memberships.role''s own real, load-bearing convention (0219) -- ADR-0027''s own vocabulary tables used display capitalization instead, a real mismatch found and fixed here before this table''s first real caller (join-request approval, 0220). Extended by future engines'' own permission keys as they are built, per the ADR''s own scoping.';
