// Two event paths live here, and they are not versions of each other.
//
// `emitEvent` below is the legacy path (ADR-0004): public.domain_events, five triggers,
// and the two events the AI endpoints produce. It is the product's live event bus and is
// deliberately untouched — ADR-0019 rules out reusing its signature for the platform
// stream, and Epic 01 leaves it working until the engines that supersede it exist.
//
// `buildEventEnvelope` belongs to the platform stream (platform.events, migration 0021).
// It builds and validates the thirteen-field envelope of ADR-0019 — the contract every
// engine shares. It does not emit: emission is platform.emit_event(), a SQL function
// called from inside the transaction that writes the aggregate, because that is the only
// place the guarantee can hold. See the note above it.

// Thin wrapper around the emit_domain_event() RPC (see migration 0010) — the seed of
// Core's event bus. Only the two events this phase's work actually produces are wired
// up (ai_intake.analyzed, message.translated); the rest of the chain
// (RequestCreated → ... → ReviewSubmitted) gets wired as each owning phase ships, per
// the roadmap. A failure here should never break the caller's actual request, so
// emitEvent swallows its own errors after logging them.
export async function emitEvent(supabase, eventType, payload = {}) {
  try {
    const { error } = await supabase.rpc("emit_domain_event", { p_event_type: eventType, p_payload: payload });
    if (error) console.error(`emitEvent(${eventType}) failed:`, error.message);
  } catch (err) {
    console.error(`emitEvent(${eventType}) threw:`, err.message);
  }
}

// ===========================================================================
// The platform event envelope (ADR-0019)
//
// WHY THIS BUILDS BUT DOES NOT SEND.
//
// SUPABASE_ARCHITECTURE.md §12 constraint 5: an event is written in the same transaction
// as the change it describes, so that a change without an event is impossible. A helper
// that sent the event over RPC would get its own transaction — an event with no change
// attached, which is the exact shape the constraint forbids. So emission is
// platform.emit_event() (migration 0023), called by an engine from inside the transaction
// writing its aggregate, and this module's job is the envelope those callers pass in.
//
// One builder, because the envelope is "identical across every engine" (ADR-0019). Thirteen
// fields re-validated per engine is thirteen fields that drift.
//
// The validation deliberately duplicates constraints that also exist on platform.events.
// That is not redundancy for its own sake: a constraint violation surfacing from inside a
// SECURITY DEFINER function reports a table the caller may not know exists, while these
// name the field and say what was wrong with it.

// Mirrors the platform.actor_type enum. ADR-0019 keeps `intelligence` distinguishable from
// `person` so that "what did the AI do on its own" is answerable without parsing a payload.
export const ACTOR_TYPES = ["person", "system", "integration", "intelligence"];

// <engine>.<aggregate>.<past-participle>, matching the events_type_format constraint. Six
// consumers dispatch on this, so its shape is contract rather than convention.
const EVENT_TYPE_PATTERN = /^[a-z_]+\.[a-z_]+\.[a-z_]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireUuid(value, field) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error(`${field} must be a UUID, got ${JSON.stringify(value)}`);
  }
  return value;
}

function requireText(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a non-empty string, got ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Builds a validated platform event envelope.
 *
 * Identifiers are the caller's to supply, in both cases deliberately:
 *   - `eventId` — identifiers are application-generated (SUPABASE_ARCHITECTURE.md §3).
 *     UUIDv7 generation arrives in WP 02.03.
 *   - `correlationId` — "propagated, never regenerated" (SYSTEM_ARCHITECTURE.md §5). It
 *     originates at the gateway and is carried through every command and every resulting
 *     event, including events emitted by consumers reacting to earlier events. Defaulting
 *     it here would silently start a new trace whenever a caller forgot, and the hole is
 *     invisible until someone needs it.
 *
 * `subjectSequence` is absent and passing one throws — it is assigned by
 * platform.emit_event() inside the writing transaction, as the subject's maximum plus one.
 */
export function buildEventEnvelope(input = {}) {
  if ("subjectSequence" in input) {
    throw new Error(
      "subjectSequence is assigned by platform.emit_event() inside the writing " +
        "transaction and cannot be supplied by a caller (ADR-0019)"
    );
  }

  const eventType = requireText(input.eventType, "eventType");
  if (!EVENT_TYPE_PATTERN.test(eventType)) {
    throw new Error(
      `eventType must be <engine>.<aggregate>.<past-participle>, got "${eventType}"`
    );
  }

  if (!ACTOR_TYPES.includes(input.actorType)) {
    throw new Error(
      `actorType must be one of ${ACTOR_TYPES.join(", ")}, got ${JSON.stringify(input.actorType)}`
    );
  }

  const eventId = requireUuid(input.eventId, "eventId");

  // There are no workspace-less domain events: platform-scoped actions are audit records,
  // not events (DATABASE_ARCHITECTURE.md §23). A caller reaching for a null here wants
  // platform.audit_records.
  const workspaceId = requireUuid(input.workspaceId, "workspaceId");

  const causationId = input.causationId == null ? null : requireUuid(input.causationId, "causationId");
  if (causationId !== null && causationId === eventId) {
    throw new Error("causationId cannot be the event's own id — an event cannot cause itself");
  }

  const eventVersion = input.eventVersion ?? 1;
  if (!Number.isInteger(eventVersion) || eventVersion < 1) {
    throw new Error(`eventVersion must be a positive integer, got ${JSON.stringify(eventVersion)}`);
  }

  const isDerived = input.isDerived ?? false;
  if (typeof isDerived !== "boolean") {
    // On a rebuild, canonical events are replayed and derived events are regenerated
    // (ADR-0019). A truthy string here would be read as `true` and quietly change which.
    throw new Error(`isDerived must be a boolean, got ${JSON.stringify(isDerived)}`);
  }

  const payload = input.payload ?? {};
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("payload must be a plain object");
  }

  return {
    eventId,
    eventType,
    eventVersion,
    workspaceId,
    actorType: input.actorType,
    actorRef: requireText(input.actorRef, "actorRef"),
    subjectType: requireText(input.subjectType, "subjectType"),
    subjectId: requireUuid(input.subjectId, "subjectId"),
    occurredAt: input.occurredAt ?? null,
    correlationId: requireUuid(input.correlationId, "correlationId"),
    causationId,
    isDerived,
    payload,
  };
}
