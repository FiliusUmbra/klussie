// Slice 4, WP 4.2 (revised scope — see SLICE_4_CONVERSATION_NOTIFICATION_ACTIVATION.md's
// own WP 4.2 entry): the Notification engine's client wiring, and its own first real
// caller of WP 4.0's write contract.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../supabaseClient", () => ({
  supabase: { schema: vi.fn() },
}));

import { supabase } from "../supabaseClient";
import { fetchInbox, markNotificationSeen, markNotificationActed, markConversationNotificationsSeen } from "../notifications.js";

// A stand-in for supabase.schema("api").rpc(name, args) — same pattern messages.test.js
// already established. `handlers` maps rpc function name to a (args) => { data, error }
// responder; calling an rpc with no matching handler is a test bug, not a silently-passing
// one.
function mockApi(handlers) {
  const rpc = vi.fn((name, args) => {
    const handler = handlers[name];
    if (!handler) throw new Error(`notifications.test.js: unexpected rpc call "${name}" with ${JSON.stringify(args)}`);
    return Promise.resolve(handler(args));
  });
  vi.mocked(supabase.schema).mockReturnValue({ rpc });
  return rpc;
}

beforeEach(() => {
  vi.mocked(supabase.schema).mockReset();
});

describe("fetchInbox", () => {
  it("calls api.my_inbox with no arguments and returns its rows", async () => {
    const rpc = mockApi({ my_inbox: () => ({ data: [{ delivery_id: "d1" }], error: null }) });
    const rows = await fetchInbox();
    expect(rpc).toHaveBeenCalledWith("my_inbox");
    expect(rows).toEqual([{ delivery_id: "d1" }]);
  });

  it("returns an empty array, never null, when there is nothing in the inbox", async () => {
    mockApi({ my_inbox: () => ({ data: null, error: null }) });
    expect(await fetchInbox()).toEqual([]);
  });

  it("throws on a real error rather than swallowing it", async () => {
    mockApi({ my_inbox: () => ({ data: null, error: { message: "denied" } }) });
    await expect(fetchInbox()).rejects.toThrow("denied");
  });
});

describe("markNotificationSeen / markNotificationActed", () => {
  it("markNotificationSeen calls api.mark_notification_seen with a fresh event_id/correlation_id, actor_type 'person'", async () => {
    const rpc = mockApi({ mark_notification_seen: () => ({ data: null, error: null }) });
    await markNotificationSeen("delivery-1", "auth-user-1");
    expect(rpc).toHaveBeenCalledWith(
      "mark_notification_seen",
      expect.objectContaining({ p_delivery_id: "delivery-1", p_actor_type: "person", p_actor_ref: "auth-user-1" })
    );
    const args = rpc.mock.calls[0][1];
    expect(typeof args.p_event_id).toBe("string");
    expect(typeof args.p_correlation_id).toBe("string");
    expect(args.p_event_id).not.toBe(args.p_correlation_id);
  });

  it("markNotificationActed calls api.mark_notification_acted the identical shape", async () => {
    const rpc = mockApi({ mark_notification_acted: () => ({ data: null, error: null }) });
    await markNotificationActed("delivery-1", "auth-user-1");
    expect(rpc).toHaveBeenCalledWith(
      "mark_notification_acted",
      expect.objectContaining({ p_delivery_id: "delivery-1", p_actor_type: "person", p_actor_ref: "auth-user-1" })
    );
  });

  it("both throw on a real error", async () => {
    mockApi({
      mark_notification_seen: () => ({ data: null, error: { message: "already seen" } }),
      mark_notification_acted: () => ({ data: null, error: { message: "already acted" } }),
    });
    await expect(markNotificationSeen("d1", "u1")).rejects.toThrow("already seen");
    await expect(markNotificationActed("d1", "u1")).rejects.toThrow("already acted");
  });
});

describe("markConversationNotificationsSeen — the real integration point ConversationSheet.jsx calls on open", () => {
  it("marks seen only the deliveries for this conversation not already seen", async () => {
    const rpc = mockApi({
      my_inbox: () => ({
        data: [
          { delivery_id: "d1", subject_type: "conversation", subject_id: "convo-1", seen_at: null, acted_at: null },
          { delivery_id: "d2", subject_type: "conversation", subject_id: "convo-1", seen_at: "2026-08-23T00:00:00Z", acted_at: null },
          { delivery_id: "d3", subject_type: "conversation", subject_id: "convo-OTHER", seen_at: null, acted_at: null },
        ],
        error: null,
      }),
      mark_notification_seen: () => ({ data: null, error: null }),
      mark_notification_acted: () => ({ data: null, error: null }),
    });

    await markConversationNotificationsSeen("convo-1", "auth-user-1");

    const seenCalls = rpc.mock.calls.filter((c) => c[0] === "mark_notification_seen").map((c) => c[1].p_delivery_id);
    expect(seenCalls).toEqual(["d1"]);
  });

  it("marks acted only the deliveries for this conversation not already acted on, independently of seen_at", async () => {
    const rpc = mockApi({
      my_inbox: () => ({
        data: [
          { delivery_id: "d1", subject_type: "conversation", subject_id: "convo-1", seen_at: "2026-08-23T00:00:00Z", acted_at: null },
        ],
        error: null,
      }),
      mark_notification_seen: () => ({ data: null, error: null }),
      mark_notification_acted: () => ({ data: null, error: null }),
    });

    await markConversationNotificationsSeen("convo-1", "auth-user-1");

    expect(rpc.mock.calls.some((c) => c[0] === "mark_notification_seen")).toBe(false);
    const actedCalls = rpc.mock.calls.filter((c) => c[0] === "mark_notification_acted").map((c) => c[1].p_delivery_id);
    expect(actedCalls).toEqual(["d1"]);
  });

  it("never throws — a failure is swallowed rather than blocking the conversation that's already open", async () => {
    mockApi({ my_inbox: () => ({ data: null, error: { message: "boom" } }) });
    await expect(markConversationNotificationsSeen("convo-1", "auth-user-1")).resolves.toBeUndefined();
  });

  it("does nothing, calls nothing further, when nothing in the inbox matches this conversation", async () => {
    const rpc = mockApi({
      my_inbox: () => ({ data: [{ delivery_id: "d1", subject_type: "conversation", subject_id: "convo-OTHER", seen_at: null, acted_at: null }], error: null }),
    });
    await markConversationNotificationsSeen("convo-1", "auth-user-1");
    expect(rpc).toHaveBeenCalledTimes(1); // only my_inbox itself
  });
});
