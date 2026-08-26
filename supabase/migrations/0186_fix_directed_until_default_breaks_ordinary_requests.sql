-- A real, previously-undiscovered bug, found by exercising the real ordinary (non-directed)
-- request-creation flow live in the browser for the first time since 0014 shipped —
-- exactly the class of defect 0014's own header names ("only observable against a real
-- database"), reproduced one level deeper.
--
-- THE BUG
--
-- 0013 added service_requests_directed_complete: directed_pro_id, directed_until and
-- auto_accept_max must travel together -- all null, or all set. 0014 then gave
-- directed_until an unconditional column DEFAULT (now() + 24h) to fix createDirectedRequest()
-- (which never sends directed_until itself). But a column DEFAULT applies to every insert
-- that omits the column, not only ones where directed_pro_id is also being set --
-- createServiceRequest()'s own ordinary (non-directed) insert never sets any of the three
-- directed_* columns, so directed_until silently got a real default value while
-- directed_pro_id/auto_accept_max stayed null, violating the very constraint 0014 was
-- written to satisfy:
--
--   new row for relation "service_requests" violates check constraint
--   "service_requests_directed_complete"
--
-- Checked directly, live: every ordinary request-creation attempt through the real UI
-- (AiIntakeSheet.jsx's manual-fallback path, this session's own beta-completion slice)
-- failed with this error. Unit tests could not catch it -- mocked Supabase, no default
-- ever evaluated, the same limitation 0014's own header already names. The reason nobody
-- had seen this until now: the AI Gateway is blocked on staging (klussie-ai-intake-engine
-- memory) and ServiceSheet.jsx's own trigger has been unreachable from any current screen
-- since the conversation-canvas homepage redesign (CustomerApp.jsx's setActiveService is
-- set but never called) -- so createServiceRequest() had never actually been exercised
-- live before this session added the one remaining reachable path (AiIntakeSheet's
-- "Vul handmatig in" fallback).
--
-- THE FIX
--
-- A column DEFAULT cannot be conditional on another column in the same row. Replace it
-- with a BEFORE INSERT trigger that only fills directed_until when directed_pro_id is
-- actually being set and directed_until wasn't supplied -- preserving 0014's real intent
-- (a directed request gets 24h of exclusivity without the client having to compute it)
-- while leaving an ordinary request's three directed_* columns genuinely all null.

alter table public.service_requests alter column directed_until drop default;

create or replace function public.service_requests_default_directed_until()
returns trigger
language plpgsql
as $$
begin
  if new.directed_pro_id is not null and new.directed_until is null then
    new.directed_until := now() + interval '24 hours';
  end if;
  return new;
end;
$$;

comment on function public.service_requests_default_directed_until() is
  'Corrects 0014''s unconditional column default (0186): only a directed request (directed_pro_id set) gets an automatic 24h exclusivity window. An ordinary request leaves directed_until null, satisfying service_requests_directed_complete (0013).';

drop trigger if exists service_requests_default_directed_until on public.service_requests;
create trigger service_requests_default_directed_until
  before insert on public.service_requests
  for each row execute function public.service_requests_default_directed_until();
