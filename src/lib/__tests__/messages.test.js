// Epic 03 WP11 — fetchConversations and subscribeToConversationsForUser are additive, not
// switched: conversations are bilateral (customer and professional both read this table),
// but workspace_id is the REQUESTING workspace only (migration 0032). See messages.js's own
// header for the full reasoning. These tests pin the one property that actually matters:
// workspace_id is ADDED as a third filter alongside the two pre-existing ones, never
// replaces them.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../supabaseClient", () => ({
  supabase: { from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() },
}));

import { supabase } from "../supabaseClient";
import { fetchConversations, subscribeToConversationsForUser } from "../messages";

function createQueryBuilder(result) {
  const builder = {
    select: vi.fn(() => builder),
    or: vi.fn(() => builder),
    order: vi.fn(() => builder),
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return builder;
}

beforeEach(() => {
  vi.mocked(supabase.from).mockReset();
  vi.mocked(supabase.channel).mockReset();
  vi.mocked(supabase.removeChannel).mockReset();
});

describe("fetchConversations", () => {
  it("filters on customer_id or pro_id alone when no workspace has been resolved", async () => {
    const builder = createQueryBuilder({ data: [], error: null });
    vi.mocked(supabase.from).mockReturnValue(builder);

    await fetchConversations("user-1");

    expect(supabase.from).toHaveBeenCalledWith("conversations");
    expect(builder.or).toHaveBeenCalledWith("customer_id.eq.user-1,pro_id.eq.user-1");
  });

  it("adds workspace_id as a third branch once a workspace is resolved, without removing the other two", async () => {
    const builder = createQueryBuilder({ data: [], error: null });
    vi.mocked(supabase.from).mockReturnValue(builder);

    await fetchConversations("user-1", "ws-1");

    expect(builder.or).toHaveBeenCalledWith("customer_id.eq.user-1,pro_id.eq.user-1,workspace_id.eq.ws-1");
  });

  it("throws the real Supabase error instead of swallowing it", async () => {
    vi.mocked(supabase.from).mockReturnValue(createQueryBuilder({ data: null, error: new Error("denied") }));
    await expect(fetchConversations("user-1")).rejects.toThrow("denied");
  });
});

describe("subscribeToConversationsForUser", () => {
  function createChannel() {
    const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };
    return channel;
  }

  it("installs three listeners when no workspace has been resolved", () => {
    const channel = createChannel();
    vi.mocked(supabase.channel).mockReturnValue(channel);

    subscribeToConversationsForUser("user-1", undefined, vi.fn());

    expect(channel.on).toHaveBeenCalledTimes(3);
  });

  it("installs a fourth listener, on workspace_id, once a workspace is resolved", () => {
    const channel = createChannel();
    vi.mocked(supabase.channel).mockReturnValue(channel);

    subscribeToConversationsForUser("user-1", "ws-1", vi.fn());

    expect(channel.on).toHaveBeenCalledTimes(4);
    const [, options] = channel.on.mock.calls[3];
    expect(options).toMatchObject({ table: "conversations", filter: "workspace_id=eq.ws-1" });
  });

  it("returns an unsubscribe function that removes the channel", () => {
    const channel = createChannel();
    vi.mocked(supabase.channel).mockReturnValue(channel);

    const unsubscribe = subscribeToConversationsForUser("user-1", "ws-1", vi.fn());
    unsubscribe();

    expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
  });
});
