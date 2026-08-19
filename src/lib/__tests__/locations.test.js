// Platform Activation Slice 1, WP 1.8 — the client side of api.create_location()
// (migration 0140, WP 1.5).
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: { schema: vi.fn() },
}));

import { supabase } from "../supabaseClient";
import { createLocation } from "../locations";

beforeEach(() => {
  rpcMock.mockReset();
  vi.mocked(supabase.schema).mockReset();
  vi.mocked(supabase.schema).mockReturnValue({ rpc: rpcMock });
});

describe("createLocation", () => {
  it("calls api.create_location with a trimmed name, the given parent, and person actor type", async () => {
    rpcMock.mockResolvedValue({ error: null });

    const result = await createLocation({
      propertyId: "prop-1", parentId: "loc-parent", name: "  Kitchen  ", type: "kitchen", actorRef: "owner-1",
    });

    expect(supabase.schema).toHaveBeenCalledWith("api");
    expect(rpcMock).toHaveBeenCalledWith("create_location", expect.objectContaining({
      p_location_id: result.id,
      p_property_id: "prop-1",
      p_parent_id: "loc-parent",
      p_name: "Kitchen",
      p_type: "kitchen",
      p_actor_type: "person",
      p_actor_ref: "owner-1",
    }));
  });

  it("sends null for parent_id when creating a top-level location", async () => {
    rpcMock.mockResolvedValue({ error: null });

    await createLocation({ propertyId: "prop-1", parentId: null, name: "Ground Floor", actorRef: "owner-1" });

    expect(rpcMock).toHaveBeenCalledWith("create_location", expect.objectContaining({ p_parent_id: null }));
  });

  it("sends null for type when none is given", async () => {
    rpcMock.mockResolvedValue({ error: null });

    await createLocation({ propertyId: "prop-1", name: "Ground Floor", actorRef: "owner-1" });

    expect(rpcMock).toHaveBeenCalledWith("create_location", expect.objectContaining({ p_type: null }));
  });

  it("throws the real Supabase error instead of swallowing it", async () => {
    rpcMock.mockResolvedValue({ error: new Error("insufficient_privilege") });

    await expect(createLocation({ propertyId: "prop-1", name: "Kitchen", actorRef: "owner-1" }))
      .rejects.toThrow("insufficient_privilege");
  });
});
