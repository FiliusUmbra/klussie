// Tests for the platform event envelope builder (ADR-0019).
//
// The envelope is a decade-long contract carried by every event on a table designed never
// to be rewritten, and thirteen fields validated per engine is thirteen fields that drift.
// So these tests are less about "does the function work" than about pinning the handful of
// rules that a caller in a hurry would otherwise route around — supplying a sequence,
// omitting a correlation id, passing a truthy string for a boolean.
//
// The legacy emitEvent path is untested here on purpose: this package extends the module
// and does not touch that function, and adding tests to it now would make the diff of a
// behaviour-preserving package look like a change to the live event bus.
import { describe, it, expect } from "vitest";
import { buildEventEnvelope, ACTOR_TYPES } from "../events.js";

const VALID = {
  eventId: "01920000-0000-7000-8000-000000000001",
  eventType: "work.engagement.completed",
  workspaceId: "01920000-0000-7000-8000-0000000000ff",
  actorType: "person",
  actorRef: "person-ref-1",
  subjectType: "engagement",
  subjectId: "01920000-0000-7000-8000-0000000000aa",
  correlationId: "01920000-0000-7000-8000-0000000000cc",
};

describe("buildEventEnvelope", () => {
  it("returns the thirteen envelope fields and nothing else", () => {
    // Not a shape check for its own sake. Infrastructure partitions, retains, deduplicates
    // and traces using these fields without parsing the payload (ADR-0019's membership
    // rule), so an extra top-level field here is a field that belongs in the payload.
    expect(Object.keys(buildEventEnvelope(VALID)).sort()).toEqual(
      [
        "actorRef", "actorType", "causationId", "correlationId", "eventId",
        "eventType", "eventVersion", "isDerived", "occurredAt", "payload",
        "subjectId", "subjectType", "workspaceId",
      ].sort()
    );
  });

  it("defaults version, derivation and payload but never an identifier", () => {
    const envelope = buildEventEnvelope(VALID);
    expect(envelope.eventVersion).toBe(1);
    expect(envelope.isDerived).toBe(false);
    expect(envelope.payload).toEqual({});
    expect(envelope.causationId).toBeNull();
  });

  it("refuses a caller-supplied subject sequence", () => {
    // ADR-0019 assigns it inside the writing transaction, as the subject's maximum plus
    // one, and gaplessness is what lets a consumer receiving 7 after 5 know it lost one.
    // Accepting one here — even the right one — would let a caller believe they control an
    // ordering the database is deriving underneath them.
    expect(() => buildEventEnvelope({ ...VALID, subjectSequence: 4 })).toThrow(
      /assigned by platform\.emit_event/
    );
  });

  it("refuses an event with no correlation id", () => {
    // "Propagated, never regenerated" (SYSTEM_ARCHITECTURE.md §5). Defaulting one would
    // start a new trace whenever a caller forgot, and a trace with a hole reads as a
    // complete trace until the day it matters.
    const { correlationId, ...withoutCorrelation } = VALID;
    expect(correlationId).toBeTruthy();
    expect(() => buildEventEnvelope(withoutCorrelation)).toThrow(/correlationId must be a UUID/);
  });

  it("refuses an event with no workspace", () => {
    // There are no workspace-less domain events; platform-scoped actions are audit records
    // (DATABASE_ARCHITECTURE.md §23). A caller reaching for null here wants a different
    // table, and should be told so rather than have a null accepted.
    const { workspaceId, ...withoutWorkspace } = VALID;
    expect(workspaceId).toBeTruthy();
    expect(() => buildEventEnvelope(withoutWorkspace)).toThrow(/workspaceId must be a UUID/);
  });

  it("requires <engine>.<aggregate>.<past-participle>", () => {
    // Six consumers dispatch on this string, so its shape is contract. The two-segment
    // case is the interesting one: it is what someone writes when they are thinking of the
    // legacy path's "RequestCreated" style names.
    for (const bad of ["QuoteAccepted", "work.completed", "Work.Engagement.Completed", ""]) {
      expect(() => buildEventEnvelope({ ...VALID, eventType: bad })).toThrow();
    }
    expect(buildEventEnvelope({ ...VALID, eventType: "a_b.c_d.e_f" }).eventType).toBe("a_b.c_d.e_f");
  });

  it("accepts every actor type the enum has, and nothing else", () => {
    // Kept in step with platform.actor_type. `intelligence` is how §33's "marked as
    // machine-originated" is expressed, so a missing value here is a fact that cannot be
    // recorded rather than a validation nuisance.
    expect(ACTOR_TYPES).toEqual(["person", "system", "integration", "intelligence"]);
    for (const actorType of ACTOR_TYPES) {
      expect(buildEventEnvelope({ ...VALID, actorType }).actorType).toBe(actorType);
    }
    expect(() => buildEventEnvelope({ ...VALID, actorType: "robot" })).toThrow(/actorType must be one of/);
  });

  it("refuses an event that claims to have caused itself", () => {
    expect(() => buildEventEnvelope({ ...VALID, causationId: VALID.eventId })).toThrow(
      /cannot cause itself/
    );
  });

  it("refuses a non-boolean isDerived", () => {
    // On rebuild, canonical events are replayed and derived events are regenerated
    // (ADR-0019). A truthy string would be read as `true` and quietly move an event from
    // one side of that line to the other.
    expect(() => buildEventEnvelope({ ...VALID, isDerived: "true" })).toThrow(/isDerived must be a boolean/);
    expect(buildEventEnvelope({ ...VALID, isDerived: true }).isDerived).toBe(true);
  });

  it("refuses a blank actor reference", () => {
    // "Who did what" is not answerable without the who.
    expect(() => buildEventEnvelope({ ...VALID, actorRef: "   " })).toThrow(/actorRef/);
  });

  it("refuses a payload that is not a plain object", () => {
    for (const bad of ["{}", [], 3]) {
      expect(() => buildEventEnvelope({ ...VALID, payload: bad })).toThrow(/payload must be a plain object/);
    }
  });

  it("names the field that was wrong", () => {
    // The reason this validation exists alongside the database's own constraints: a check
    // violation raised inside a SECURITY DEFINER function names a table the caller may not
    // know exists, and says nothing about which argument caused it.
    expect(() => buildEventEnvelope({ ...VALID, subjectId: "not-a-uuid" })).toThrow(
      /subjectId must be a UUID, got "not-a-uuid"/
    );
  });
});
