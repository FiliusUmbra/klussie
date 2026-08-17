-- Epic 08 WP03 — sharing: who may *see* a document, entirely independent of what it's
-- about.
--
-- DATABASE_ARCHITECTURE.md §15, verbatim: "Every document has exactly one owning
-- workspace and an explicit sharing state. Attachment says what a document is about.
-- Sharing says who may see it. The two are set independently." No row in this table
-- means visible only to the owning workspace — the default is private, not the absence
-- of an opinion.
--
-- THE SHARING PRIMITIVE ALREADY EXISTED — IT JUST HAD NO NAME
--
-- service_request_photos' own RLS (migration 0007) already implements attachment and
-- sharing as two separate policies on one table without ever naming the second one:
-- "customers manage own request photos" (attachment, in effect) and "matching pros can
-- view request photos" (sharing, in effect). The general form of "a matching pro can
-- view" turns out to be nothing more than "share with another workspace," since a
-- professional's identity IS a workspace in this architecture
-- (PLATFORM_DOMAIN_MODEL.md §27). No new sharing primitive was invented here — the
-- existing workspace concept is simply applied to a new object.
--
-- SHARING IS TRANSACTIONAL, NOT HISTORICAL — A REAL DIFFERENCE FROM STEWARDSHIP AND
-- PLACEMENT
--
-- Revoking a share is a plain delete, not a closed period. Nothing in §15 requires a
-- permanent record of a past sharing grant the way ADR-0028 requires one of a past
-- steward or a past placement — a document's sharing history is not itself evidence the
-- way the document's own content is. DELETE is granted here, deliberately, unlike every
-- Historical-class table in this schema.

create table if not exists property.document_shares (
  id                        uuid        not null,

  document_id               uuid        not null
                            references property.documents (id),

  shared_with_workspace_id  uuid        not null
                            references workspace.workspaces (id),

  created_at                timestamptz not null default now(),

  constraint document_shares_pkey primary key (id),
  constraint document_shares_unique unique (document_id, shared_with_workspace_id)
);

create index if not exists document_shares_document_id_idx on property.document_shares (document_id);
create index if not exists document_shares_shared_with_workspace_id_idx
  on property.document_shares (shared_with_workspace_id);

comment on table property.document_shares is
  'Who may see a document, beyond its owning workspace (DATABASE_ARCHITECTURE.md §15) — set entirely independently of property.document_attachments (0056). No row means private to the owning workspace. Transactional, not Historical: revoking a share deletes the row, it does not close a period — nothing in §15 requires a permanent record of a past grant.';

alter table property.document_shares enable row level security;

-- No policy — engine-internal, reachable only from property.my_documents()/
-- resolve_document() (0059) and the isolation policy on property.documents itself
-- (0058), never from a direct client query.

-- 0019's default privileges already grant SELECT and INSERT. DELETE is explicit — a
-- share is revoked by deleting the row, unlike every Historical-class table in this
-- schema, which withholds DELETE entirely.
grant delete on property.document_shares to klussie_engine_property;

revoke all on property.document_shares from anon, authenticated, service_role;
