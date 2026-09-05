// Platform Activation Slice 2, WP 2.6: the client cutover's own test suite for
// src/lib/messages.js, rewritten alongside its rewrite — the previous version tested the
// pre-cutover, legacy-only bilateral-filter contract (Epic 03 WP11) and is stale against
// the current code, which reads work.conversations/messages entirely through
// api.my_conversations()/api.conversation_messages() (person-scoped via
// public.current_identity(), not a workspace filter at all).
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../supabaseClient", () => ({
  supabase: { from: vi.fn(), schema: vi.fn(), channel: vi.fn(), removeChannel: vi.fn(), rpc: vi.fn() },
}));

import { supabase } from "../supabaseClient";
import {
  fetchConversations,
  fetchMessages,
  saveMessageTranslation,
  sendMessage,
  markConversationRead,
  subscribeToConversationsForUser,
  subscribeToMessages,
} from "../messages";

// A stand-in for supabase.schema("api").rpc(name, args) — every new-schema call this file
// makes. `handlers` maps rpc function name to a (args) => { data, error } responder;
// calling an rpc with no matching handler is a test bug, not a silently-passing one.
function mockApi(handlers) {
  const rpc = vi.fn((name, args) => {
    const handler = handlers[name];
    if (!handler) throw new Error(`messages.test.js: unexpected rpc call "${name}" with ${JSON.stringify(args)}`);
    return Promise.resolve(handler(args));
  });
  vi.mocked(supabase.schema).mockReturnValue({ rpc });
  return rpc;
}

beforeEach(() => {
  vi.mocked(supabase.from).mockReset();
  vi.mocked(supabase.schema).mockReset();
  vi.mocked(supabase.channel).mockReset();
  vi.mocked(supabase.removeChannel).mockReset();
  vi.mocked(supabase.rpc).mockReset();
});

describe("fetchConversations", () => {
  it("returns an empty list without calling Supabase at all when no workspace has resolved", async () => {
    const result = await fetchConversations("user-1", undefined);
    expect(result).toEqual([]);
    expect(supabase.schema).not.toHaveBeenCalled();
  });

  it("reads via api.my_conversations, resolves the counterpart's real name, and computes unreadCount from last_read_at", async () => {
    const row = {
      id: "convo-1", engagement_id: "eng-1", asset_id: null, maintenance_obligation_id: null, property_id: null,
      workspace_id: null, closed_at: null, created_at: "2026-08-10T00:00:00Z",
      service_id: "svc-1", request_id: "req-1", counterpart_workspace_id: "pro-ws-1", last_read_at: "2026-08-10T09:00:00Z",
    };
    const rpc = mockApi({
      my_conversations: () => ({ data: [row], error: null }),
      resolve_conversation_counterpart_auth_ids: () => ({ data: [{ workspace_id: "pro-ws-1", auth_user_id: "pro-auth-1" }], error: null }),
      conversation_messages: () => ({
        data: [
          { id: "m-1", sender_person_ref: "pro-ref", sender_workspace_id: "pro-ws-1", sender_auth_user_id: "pro-auth-1", body: "before read", created_at: "2026-08-10T08:00:00Z", translations: {} },
          { id: "m-2", sender_person_ref: "pro-ref", sender_workspace_id: "pro-ws-1", sender_auth_user_id: "pro-auth-1", body: "after read", created_at: "2026-08-10T10:00:00Z", translations: {} },
          { id: "m-3", sender_person_ref: "cust-ref", sender_workspace_id: "cust-ws-1", sender_auth_user_id: "cust-auth-1", body: "my own, after read too", created_at: "2026-08-10T11:00:00Z", translations: {} },
        ],
        error: null,
      }),
    });
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [{ auth_user_id: "pro-auth-1", full_name: "Jan de Pro" }], error: null });

    const result = await fetchConversations("cust-auth-1", "cust-ws-1");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "convo-1", requestId: "req-1", serviceId: "svc-1", otherName: "Jan de Pro",
      lastMessage: { body: "my own, after read too" },
    });
    // Only "after read" and from the counterpart counts — the pre-read message and the
    // caller's own post-read message are both excluded.
    expect(result[0].unreadCount).toBe(1);

    // Beta context-isolation fix: the active workspace is the one thing that must reach
    // every one of these three calls -- omitting it is exactly the bug that let a
    // person's conversation leak into their OTHER workspace.
    expect(rpc.mock.calls.find(([name]) => name === "my_conversations")[1]).toEqual({ p_workspace_id: "cust-ws-1" });
    expect(rpc.mock.calls.find(([name]) => name === "conversation_messages")[1]).toEqual({
      p_conversation_id: "convo-1", p_workspace_id: "cust-ws-1",
    });
    expect(rpc.mock.calls.find(([name]) => name === "resolve_conversation_counterpart_auth_ids")[1]).toEqual({
      p_workspace_ids: ["pro-ws-1"], p_my_workspace_id: "cust-ws-1",
    });
  });

  it("falls back to a generic name when the identity resolver has nothing for this counterpart", async () => {
    const row = {
      id: "convo-1", engagement_id: "eng-1", asset_id: null, maintenance_obligation_id: null, property_id: null,
      workspace_id: null, closed_at: null, created_at: "2026-08-10T00:00:00Z",
      service_id: "svc-1", request_id: "req-1", counterpart_workspace_id: "pro-ws-1", last_read_at: null,
    };
    mockApi({
      my_conversations: () => ({ data: [row], error: null }),
      resolve_conversation_counterpart_auth_ids: () => ({ data: [], error: null }),
      conversation_messages: () => ({ data: [], error: null }),
    });

    const result = await fetchConversations("cust-auth-1", "cust-ws-1");
    expect(result[0].otherName).toBe("Klussie user");
    expect(result[0].lastMessage).toBeNull();
    expect(result[0].unreadCount).toBe(0);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("returns an empty list without further calls when my_conversations comes back empty", async () => {
    const rpc = mockApi({ my_conversations: () => ({ data: [], error: null }) });
    const result = await fetchConversations("user-1", "ws-1");
    expect(result).toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("throws the real error instead of swallowing it", async () => {
    mockApi({ my_conversations: () => ({ data: null, error: new Error("denied") }) });
    await expect(fetchConversations("user-1", "ws-1")).rejects.toThrow("denied");
  });
});

describe("fetchMessages", () => {
  it("resolves senderId to the real, comparable auth id — not the internal sender_person_ref", async () => {
    mockApi({
      conversation_messages: (a) =>
        a.p_conversation_id === "convo-1"
          ? { data: [{ id: "m-1", sender_person_ref: "person-ref-1", sender_workspace_id: "ws-1", sender_auth_user_id: "auth-1", body: "hi", created_at: "2026-08-10T00:00:00Z", translations: { fr: "salut" } }], error: null }
          : { data: [], error: null },
    });

    const result = await fetchMessages("convo-1", "ws-1");
    expect(result).toEqual([
      { id: "m-1", senderId: "auth-1", body: "hi", createdAt: new Date("2026-08-10T00:00:00Z").getTime(), readAt: null, translations: { fr: "salut" } },
    ]);
  });

  it("passes the active workspace through to api.conversation_messages", async () => {
    const rpc = mockApi({ conversation_messages: () => ({ data: [], error: null }) });
    await fetchMessages("convo-1", "ws-1");
    const call = rpc.mock.calls.find(([name]) => name === "conversation_messages");
    expect(call[1]).toEqual({ p_conversation_id: "convo-1", p_workspace_id: "ws-1" });
  });

  it("throws the real error instead of swallowing it", async () => {
    mockApi({ conversation_messages: () => ({ data: null, error: new Error("denied") }) });
    await expect(fetchMessages("convo-1", "ws-1")).rejects.toThrow("denied");
  });
});

describe("sendMessage", () => {
  it("calls api.send_message with the real sender identity and workspace, no reference", async () => {
    const rpc = mockApi({ send_message: () => ({ error: null }) });

    await sendMessage({ conversationId: "convo-1", senderId: "auth-1", senderWorkspaceId: "ws-1", body: "hello" });

    const call = rpc.mock.calls.find(([name]) => name === "send_message");
    expect(call[1]).toMatchObject({
      p_conversation_id: "convo-1", p_sender_workspace_id: "ws-1", p_body: "hello",
      p_reference_type: null, p_reference_id: null, p_actor_type: "person", p_actor_ref: "auth-1",
    });
  });

  it("throws on a Supabase error", async () => {
    mockApi({ send_message: () => ({ error: new Error("denied") }) });
    await expect(sendMessage({ conversationId: "convo-1", senderId: "auth-1", senderWorkspaceId: "ws-1", body: "hi" })).rejects.toThrow("denied");
  });
});

describe("saveMessageTranslation", () => {
  it("calls api.save_message_translation with the real caller identity and active workspace, never null", async () => {
    const rpc = mockApi({ save_message_translation: () => ({ error: null }) });

    await saveMessageTranslation("m-1", "fr", "salut", "auth-1", "ws-1");

    const call = rpc.mock.calls.find(([name]) => name === "save_message_translation");
    expect(call[1]).toMatchObject({ p_message_id: "m-1", p_locale: "fr", p_text: "salut", p_workspace_id: "ws-1", p_actor_ref: "auth-1" });
  });

  it("throws on a Supabase error", async () => {
    mockApi({ save_message_translation: () => ({ error: new Error("denied") }) });
    await expect(saveMessageTranslation("m-1", "fr", "salut", "auth-1", "ws-1")).rejects.toThrow("denied");
  });
});

describe("markConversationRead", () => {
  it("calls api.mark_conversation_read with the active workspace, no caller-supplied identity — resolved server-side", async () => {
    const rpc = mockApi({ mark_conversation_read: () => ({ error: null }) });

    await markConversationRead("convo-1", "ws-1");

    const call = rpc.mock.calls.find(([name]) => name === "mark_conversation_read");
    expect(call[1]).toEqual({ p_conversation_id: "convo-1", p_workspace_id: "ws-1" });
  });

  it("throws on a Supabase error", async () => {
    mockApi({ mark_conversation_read: () => ({ error: new Error("denied") }) });
    await expect(markConversationRead("convo-1", "ws-1")).rejects.toThrow("denied");
  });
});

describe("subscribeToConversationsForUser", () => {
  function createChannel() {
    const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };
    return channel;
  }

  it("returns a no-op without opening a channel when no workspace has resolved", () => {
    const unsubscribe = subscribeToConversationsForUser("user-1", undefined, vi.fn());
    expect(supabase.channel).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });

  it("subscribes to work.messages and work.conversation_participants, scoped to the workspace", () => {
    const channel = createChannel();
    vi.mocked(supabase.channel).mockReturnValue(channel);

    subscribeToConversationsForUser("user-1", "ws-1", vi.fn());

    expect(channel.on).toHaveBeenCalledTimes(2);
    expect(channel.on.mock.calls[0][1]).toMatchObject({ schema: "work", table: "messages" });
    expect(channel.on.mock.calls[1][1]).toMatchObject({
      schema: "work", table: "conversation_participants", filter: "workspace_id=eq.ws-1",
    });
  });

  it("returns an unsubscribe function that removes the channel", () => {
    const channel = createChannel();
    vi.mocked(supabase.channel).mockReturnValue(channel);

    const unsubscribe = subscribeToConversationsForUser("user-1", "ws-1", vi.fn());
    unsubscribe();

    expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
  });
});

describe("subscribeToMessages", () => {
  it("subscribes to work.messages filtered by conversation_id", () => {
    const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };
    vi.mocked(supabase.channel).mockReturnValue(channel);

    subscribeToMessages("convo-1", vi.fn());

    expect(channel.on.mock.calls[0][1]).toMatchObject({ schema: "work", table: "messages", filter: "conversation_id=eq.convo-1" });
  });

  it("returns an unsubscribe function that removes the channel", () => {
    const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };
    vi.mocked(supabase.channel).mockReturnValue(channel);

    const unsubscribe = subscribeToMessages("convo-1", vi.fn());
    unsubscribe();

    expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
  });
});
