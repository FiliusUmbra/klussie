// Platform Activation Slice 2, WP 2.6: the client cutover's own test suite. Rewritten
// alongside src/lib/requests.js's own rewrite — the previous version of this file tested
// the pre-cutover, legacy-only contract and is stale against the current code (every
// write now dual-writes at creation, every read but fetchProLeads() reads work.*, three
// signatures grew a required workspaceId). src/lib/supabaseClient.js and src/lib/pros.js
// are both mocked entirely so these run without a real network call, real env vars, or a
// second, unrelated layer of Supabase calls inside fetchPublicProInfo().
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../supabaseClient", () => ({
  supabase: { from: vi.fn(), schema: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() },
}));

vi.mock("../pros", () => ({
  initialsFrom: vi.fn((name) => (name ? name.split(" ").map((w) => w[0]).join("") : "")),
  fetchPublicProInfo: vi.fn(() => Promise.resolve({})),
}));

import { supabase } from "../supabaseClient";
import { fetchPublicProInfo } from "../pros";
import {
  createServiceRequest,
  createDirectedRequest,
  fetchCustomerRequests,
  fetchProLeads,
  fetchProJobs,
  sendQuote,
  acceptQuote,
  approveLocationDisclosure,
  markComplete,
  submitReview,
  subscribeToCustomerRequests,
  subscribeToRequestQuotes,
  subscribeToProLeads,
  subscribeToProQuoteUpdates,
} from "../requests";

// A minimal stand-in for supabase-js's chainable, thenable query builder — supports the
// exact chains src/lib/requests.js's legacy-only paths still use (.insert() awaited
// directly, .select().in().neq().order()).
function createQueryBuilder(result) {
  const builder = {
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(result)),
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return builder;
}

// A stand-in for supabase.schema("api").rpc(name, args) — every new-schema call this file
// makes. `handlers` maps rpc function name to a (args) => { data, error } responder;
// calling an rpc with no matching handler is a test bug (an unaccounted-for call), not a
// silently-passing one, so it throws rather than returning undefined.
function mockApi(handlers) {
  const rpc = vi.fn((name, args) => {
    const handler = handlers[name];
    if (!handler) throw new Error(`requests.test.js: unexpected rpc call "${name}" with ${JSON.stringify(args)}`);
    return Promise.resolve(handler(args));
  });
  vi.mocked(supabase.schema).mockReturnValue({ rpc });
  return rpc;
}

// The two calls every reshape path makes when a request has no quotes yet: an empty
// quotes_for_request, and (for a non-terminal status) no review_for_request call at all.
const noQuotesNoReview = {
  quotes_for_request: () => ({ data: [], error: null }),
};

beforeEach(() => {
  vi.mocked(supabase.from).mockReset();
  vi.mocked(supabase.schema).mockReset();
  vi.mocked(supabase.channel).mockReset();
  vi.mocked(supabase.removeChannel).mockReset();
  vi.mocked(fetchPublicProInfo).mockReset().mockResolvedValue({});
});

describe("createServiceRequest", () => {
  const args = {
    customerId: "cust-1", workspaceId: "ws-1", serviceId: "svc-1", categoryId: "cleaning",
    details: "leaking sink", detailsJson: { severity: "high" }, whenPref: "this_week",
    budget: 100, city: "Brussels",
  };

  it("writes the legacy row first, then work.requests correlated to it, then reshapes the result", async () => {
    const legacyBuilder = createQueryBuilder({ error: null });
    vi.mocked(supabase.from).mockReturnValue(legacyBuilder);
    const rpc = mockApi({ create_request: () => ({ error: null }), ...noQuotesNoReview });

    const result = await createServiceRequest(args);

    expect(supabase.from).toHaveBeenCalledWith("service_requests");
    const legacyRow = legacyBuilder.insert.mock.calls[0][0];
    expect(legacyRow).toMatchObject({
      customer_id: "cust-1", service_id: "svc-1", category_id: "cleaning",
      when_pref: "this_week", details_json: { severity: "high" }, budget: 100, city: "Brussels",
    });

    const createCall = rpc.mock.calls.find(([name]) => name === "create_request");
    expect(createCall[1]).toMatchObject({
      p_requesting_workspace_id: "ws-1", p_category_id: "cleaning", p_service_id: "svc-1",
      p_when_pref: "this_week", p_budget: 100, p_details_json: { severity: "high" }, p_city: "Brussels",
      p_service_request_id: legacyRow.id, p_directed_workspace_id: null, p_auto_accept_max: null,
      p_actor_type: "person", p_actor_ref: "cust-1",
    });

    expect(result).toMatchObject({
      id: createCall[1].p_request_id, cat: "cleaning", serviceId: "svc-1", status: "collecting", quotes: [],
    });
  });

  it("sends null for detailsJson when given an empty object, not {}, on both writes", async () => {
    vi.mocked(supabase.from).mockReturnValue(createQueryBuilder({ error: null }));
    const rpc = mockApi({ create_request: () => ({ error: null }), ...noQuotesNoReview });

    await createServiceRequest({ ...args, detailsJson: {} });

    const legacyRow = vi.mocked(supabase.from).mock.results[0].value.insert.mock.calls[0][0];
    expect(legacyRow.details_json).toBeNull();
    const createCall = rpc.mock.calls.find(([name]) => name === "create_request");
    expect(createCall[1].p_details_json).toBeNull();
  });

  it("throws the legacy error without ever calling create_request", async () => {
    vi.mocked(supabase.from).mockReturnValue(createQueryBuilder({ error: new Error("insert failed") }));
    const rpc = mockApi({ create_request: () => ({ error: null }), ...noQuotesNoReview });

    await expect(createServiceRequest(args)).rejects.toThrow("insert failed");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("throws create_request's own error even though the legacy row already exists", async () => {
    vi.mocked(supabase.from).mockReturnValue(createQueryBuilder({ error: null }));
    mockApi({ create_request: () => ({ error: new Error("denied") }), ...noQuotesNoReview });

    await expect(createServiceRequest(args)).rejects.toThrow("denied");
  });

  // Beta-completion slice (0182/0185) — the service-location picker's own write side,
  // resolved before either the legacy or work.requests insert.
  describe("with a service location (0182/0185)", () => {
    it("passes an already-confirmed My Home property straight through, writing nothing new", async () => {
      vi.mocked(supabase.from).mockReturnValue(createQueryBuilder({ error: null }));
      const rpc = mockApi({ create_request: () => ({ error: null }), ...noQuotesNoReview });

      await createServiceRequest({ ...args, location: { type: "home", propertyId: "prop-1" } });

      expect(rpc).not.toHaveBeenCalledWith("set_property_address", expect.anything());
      const createCall = rpc.mock.calls.find(([name]) => name === "create_request");
      expect(createCall[1].p_property_id).toBe("prop-1");
    });

    it("confirms My Home's address first, then passes its property id, when one is supplied", async () => {
      vi.mocked(supabase.from).mockReturnValue(createQueryBuilder({ error: null }));
      const rpc = mockApi({
        create_request: () => ({ error: null }),
        set_property_address: () => ({ error: null }),
        ...noQuotesNoReview,
      });

      await createServiceRequest({
        ...args,
        location: { type: "home", propertyId: "prop-1", address: { street: "Kerkstraat", postcode: "2000", municipality: "Antwerpen" } },
      });

      const addressCall = rpc.mock.calls.find(([name]) => name === "set_property_address");
      expect(addressCall[1]).toMatchObject({ p_property_id: "prop-1", p_street: "Kerkstraat", p_municipality: "Antwerpen" });
      const createCall = rpc.mock.calls.find(([name]) => name === "create_request");
      expect(createCall[1].p_property_id).toBe("prop-1");
      // Address confirmed before the request is created, not after.
      expect(rpc.mock.invocationCallOrder[rpc.mock.calls.indexOf(addressCall)])
        .toBeLessThan(rpc.mock.invocationCallOrder[rpc.mock.calls.indexOf(createCall)]);
    });

    it("creates a fresh one-time property, addresses it, then creates the request against it", async () => {
      vi.mocked(supabase.from).mockReturnValue(createQueryBuilder({ error: null }));
      const rpc = mockApi({
        create_property: () => ({ error: null }),
        set_property_address: () => ({ error: null }),
        create_request: () => ({ error: null }),
        ...noQuotesNoReview,
      });

      await createServiceRequest({
        ...args,
        location: { type: "one_time_address", address: { street: "Zeedijk", postcode: "8400", municipality: "Oostende" } },
      });

      const propertyCall = rpc.mock.calls.find(([name]) => name === "create_property");
      expect(propertyCall[1]).toMatchObject({ p_steward_workspace_id: "ws-1", p_actor_ref: "cust-1" });
      const newPropertyId = propertyCall[1].p_property_id;

      const addressCall = rpc.mock.calls.find(([name]) => name === "set_property_address");
      expect(addressCall[1]).toMatchObject({ p_property_id: newPropertyId, p_street: "Zeedijk", p_municipality: "Oostende" });

      const createCall = rpc.mock.calls.find(([name]) => name === "create_request");
      expect(createCall[1].p_property_id).toBe(newPropertyId);
    });
  });
});

// Epic 03 WP9 / ADR-0012 guardrails, now sitting in front of a professional-workspace
// resolution call rather than a plain insert.
describe("createDirectedRequest", () => {
  const args = {
    customerId: "cust-1", workspaceId: "ws-1", serviceId: "svc-1", categoryId: "repairs",
    proId: "pro-9", autoAcceptMax: 260, details: "my sink is leaking", whenPref: "this_week", city: "Brussels",
  };

  it("refuses a request with no professional to direct at, before any call", async () => {
    await expect(createDirectedRequest({ ...args, proId: null })).rejects.toThrow(/professional/i);
    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.schema).not.toHaveBeenCalled();
  });

  it("refuses a request with no usable ceiling, before any call", async () => {
    for (const bad of [null, undefined, 0, -5]) {
      await expect(createDirectedRequest({ ...args, autoAcceptMax: bad })).rejects.toThrow(/ceiling/i);
    }
    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.schema).not.toHaveBeenCalled();
  });

  it("refuses when the professional has no resolvable workspace, before writing anything", async () => {
    mockApi({ resolve_public_professional_workspace: () => ({ data: null, error: null }) });

    await expect(createDirectedRequest(args)).rejects.toThrow(/resolvable workspace/i);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("resolves the professional's real workspace, then dual-writes correlated, directed rows", async () => {
    const legacyBuilder = createQueryBuilder({ error: null });
    vi.mocked(supabase.from).mockReturnValue(legacyBuilder);
    const rpc = mockApi({
      resolve_public_professional_workspace: () => ({ data: "pro-ws-9", error: null }),
      create_request: () => ({ error: null }),
      ...noQuotesNoReview,
    });

    const result = await createDirectedRequest(args);

    const legacyRow = legacyBuilder.insert.mock.calls[0][0];
    expect(legacyRow).toMatchObject({
      customer_id: "cust-1", directed_pro_id: "pro-9", auto_accept_max: 260, status: "awaiting_pro",
    });
    // ADR-0012: no shortcut into a state only handle_quote_accepted() may reach.
    expect(legacyRow.booked_pro_id).toBeUndefined();
    expect(legacyRow.price).toBeUndefined();
    expect(legacyRow.directed_until).toBeUndefined();

    const createCall = rpc.mock.calls.find(([name]) => name === "create_request");
    expect(createCall[1]).toMatchObject({
      p_service_request_id: legacyRow.id, p_directed_workspace_id: "pro-ws-9", p_auto_accept_max: 260,
    });

    // reshapeWorkRequest carries directed_workspace_id straight through, unresolved.
    expect(result.directedProId).toBe("pro-ws-9");
    expect(result.autoAcceptMax).toBe(260);
  });

  it("throws on a failed legacy insert without calling create_request", async () => {
    vi.mocked(supabase.from).mockReturnValue(createQueryBuilder({ error: { message: "denied" } }));
    const rpc = mockApi({
      resolve_public_professional_workspace: () => ({ data: "pro-ws-9", error: null }),
      create_request: () => ({ error: null }),
    });

    await expect(createDirectedRequest(args)).rejects.toMatchObject({ message: "denied" });
    expect(rpc).not.toHaveBeenCalledWith("create_request", expect.anything());
  });
});

// Epic 03 WP11 / WP 2.6 — work.requests has no customer_id concept at all, so a resolved
// workspace is not an optimization here, it's the only shape the read has.
describe("fetchCustomerRequests", () => {
  it("returns an empty list without calling Supabase at all when no workspace has resolved", async () => {
    const result = await fetchCustomerRequests("cust-1", undefined);
    expect(result).toEqual([]);
    expect(supabase.schema).not.toHaveBeenCalled();
  });

  it("reads via api.my_requests, scoped to the workspace, and reshapes newest first", async () => {
    const rows = [
      { id: "req-1", category_id: "cleaning", service_id: "svc-1", status: "collecting", created_at: "2026-08-01T00:00:00Z", when_pref: "flexible", details: "a", details_json: null, ai_analysis: null, budget: null, city: "Brussels", directed_workspace_id: null, directed_until: null, auto_accept_max: null },
      { id: "req-2", category_id: "repairs", service_id: "svc-2", status: "collecting", created_at: "2026-08-06T00:00:00Z", when_pref: "flexible", details: "b", details_json: null, ai_analysis: null, budget: null, city: "Brussels", directed_workspace_id: null, directed_until: null, auto_accept_max: null },
    ];
    const rpc = mockApi({
      my_requests: (a) => (a.p_workspace_id === "ws-1" ? { data: rows, error: null } : { data: [], error: null }),
      ...noQuotesNoReview,
    });

    const result = await fetchCustomerRequests("cust-1", "ws-1");

    expect(rpc).toHaveBeenCalledWith("my_requests", { p_workspace_id: "ws-1" });
    expect(result.map((r) => r.id)).toEqual(["req-2", "req-1"]);
  });

  it("returns an empty list without reshaping when my_requests comes back empty", async () => {
    const rpc = mockApi({ my_requests: () => ({ data: [], error: null }) });
    const result = await fetchCustomerRequests("cust-1", "ws-1");
    expect(result).toEqual([]);
    // Nothing to reshape means no quotes_for_request call either.
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("throws the real error instead of swallowing it", async () => {
    mockApi({ my_requests: () => ({ data: null, error: new Error("denied") }) });
    await expect(fetchCustomerRequests("cust-1", "ws-1")).rejects.toThrow("denied");
  });

  // Slice 5, WP 5.1 — safety.file_case_for_caller() needs a real workspace id, not the
  // pro's own auth id ReportSheet.jsx used to be handed. offering_workspace_id was
  // already fetched here (resolveProInfoByWorkspace uses it) but never passed through
  // until this cutover.
  it("exposes each quote's own offering workspace id, for ReportSheet.jsx's own cutover", async () => {
    const rows = [
      { id: "req-1", category_id: "cleaning", service_id: "svc-1", status: "booked", created_at: "2026-08-01T00:00:00Z", when_pref: "flexible", details: "a", details_json: null, ai_analysis: null, budget: null, city: "Brussels", directed_workspace_id: null, directed_until: null, auto_accept_max: null },
    ];
    mockApi({
      my_requests: () => ({ data: rows, error: null }),
      quotes_for_request: () => ({
        data: [{ id: "q-1", offering_workspace_id: "ws-pro-1", price: 80, message: "", sent_at: "2026-08-01T00:00:00Z", status: "accepted" }],
        error: null,
      }),
      resolve_workspace_owner_auth_ids: () => ({ data: [{ workspace_id: "ws-pro-1", auth_user_id: "pro-1" }], error: null }),
    });

    const [request] = await fetchCustomerRequests("cust-1", "ws-1");

    expect(request.quotes[0].workspaceId).toBe("ws-pro-1");
  });
});

// STAYS ON LEGACY, deliberately (see requests.js's own header) — plus the one addition,
// excluding a lead whose correlated work.requests row has moved past 'collecting'.
describe("fetchProLeads", () => {
  function row(overrides = {}) {
    return {
      id: "req-1", customer_id: "cust-1", category_id: "cleaning", service_id: "svc-1",
      details: "leak", details_json: null, ai_analysis: null, when_pref: "flexible",
      budget: null, city: "Brussels", status: "collecting", booked_pro_id: null,
      directed_pro_id: null, directed_until: null, auto_accept_max: null,
      created_at: "2026-08-06T00:00:00Z", updated_at: "2026-08-06T00:00:00Z",
      quotes: [], reviews: [], ...overrides,
    };
  }

  it("excludes a lead the pro has already quoted, without ever calling the lifecycle bridge", async () => {
    const builder = createQueryBuilder({
      data: [row({ quotes: [{ id: "q-1", request_id: "req-1", pro_id: "pro-1", price: 50, message: null, status: "sent", sent_at: "2026-08-06T00:00:00Z", pro: null }] })],
      error: null,
    });
    vi.mocked(supabase.from).mockReturnValue(builder);
    const rpc = mockApi({ request_lifecycle_statuses: () => ({ data: [], error: null }) });

    const result = await fetchProLeads("pro-1");

    expect(result).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("excludes a lead whose correlated work.requests row has moved past collecting", async () => {
    vi.mocked(supabase.from).mockReturnValue(createQueryBuilder({ data: [row({ id: "req-1" }), row({ id: "req-2" })], error: null }));
    const rpc = mockApi({
      request_lifecycle_statuses: () => ({
        data: [{ service_request_id: "req-1", status: "booked" }, { service_request_id: "req-2", status: "collecting" }],
        error: null,
      }),
      matching_request_locations_for_pro: () => ({ data: [], error: null }),
    });

    const result = await fetchProLeads("pro-9");

    expect(rpc).toHaveBeenCalledWith("request_lifecycle_statuses", { p_service_request_ids: ["req-1", "req-2"] });
    expect(result.map((r) => r.id)).toEqual(["req-2"]);
  });

  it("keeps a lead that has no correlation at all — a lead predating dual-write", async () => {
    vi.mocked(supabase.from).mockReturnValue(createQueryBuilder({ data: [row({ id: "req-1" })], error: null }));
    mockApi({
      request_lifecycle_statuses: () => ({ data: [], error: null }),
      matching_request_locations_for_pro: () => ({ data: [], error: null }),
    });

    const result = await fetchProLeads("pro-9");
    expect(result.map((r) => r.id)).toEqual(["req-1"]);
  });

  it("skips the lifecycle bridge entirely when there are no candidates to check", async () => {
    vi.mocked(supabase.from).mockReturnValue(createQueryBuilder({ data: [], error: null }));
    const rpc = mockApi({ request_lifecycle_statuses: () => ({ data: [], error: null }) });

    await fetchProLeads("pro-9");
    expect(rpc).not.toHaveBeenCalled();
  });

  // Beta priority: approximate location during quoting (migration 0187).
  describe("with a correlated location (0187)", () => {
    it("attaches municipality/country/distanceBand/propertyType/quotePrepNotes for a matched lead", async () => {
      vi.mocked(supabase.from).mockReturnValue(createQueryBuilder({ data: [row({ id: "req-1" })], error: null }));
      const rpc = mockApi({
        request_lifecycle_statuses: () => ({ data: [], error: null }),
        matching_request_locations_for_pro: () => ({
          data: [{
            service_request_id: "req-1", municipality: "Antwerpen", country: "BE",
            distance_band: "unknown", property_type: "apartment", quote_prep_notes: "Bel aan bij nr. 4",
          }],
          error: null,
        }),
      });

      const result = await fetchProLeads("pro-9");

      expect(rpc).toHaveBeenCalledWith("matching_request_locations_for_pro", { p_service_request_ids: ["req-1"] });
      expect(result[0].location).toEqual({
        municipality: "Antwerpen", country: "BE", distanceBand: "unknown", propertyType: "apartment", quotePrepNotes: "Bel aan bij nr. 4",
      });
    });

    it("gives a lead with no correlated location row location: null, not a missing field", async () => {
      vi.mocked(supabase.from).mockReturnValue(createQueryBuilder({ data: [row({ id: "req-1" })], error: null }));
      mockApi({
        request_lifecycle_statuses: () => ({ data: [], error: null }),
        matching_request_locations_for_pro: () => ({ data: [], error: null }),
      });

      const result = await fetchProLeads("pro-9");
      expect(result[0].location).toBeNull();
    });

    it("throws the real Supabase error instead of swallowing it", async () => {
      vi.mocked(supabase.from).mockReturnValue(createQueryBuilder({ data: [row({ id: "req-1" })], error: null }));
      mockApi({
        request_lifecycle_statuses: () => ({ data: [], error: null }),
        matching_request_locations_for_pro: () => ({ data: null, error: new Error("denied") }),
      });

      await expect(fetchProLeads("pro-9")).rejects.toThrow("denied");
    });
  });
});

describe("fetchProJobs", () => {
  it("returns empty buckets without calling Supabase when no workspace has resolved", async () => {
    const result = await fetchProJobs("pro-1", undefined);
    expect(result).toEqual({ sent: [], booked: [], completed: [] });
    expect(supabase.schema).not.toHaveBeenCalled();
  });

  it("sorts quotes into sent/booked/completed and keeps the .quotes array ProJobs.jsx reads", async () => {
    mockApi({
      my_quotes: () => ({
        data: [
          { id: "q-sent", request_id: "req-sent", offering_workspace_id: "ws-1", price: 50, status: "sent" },
          { id: "q-booked", request_id: "req-booked", offering_workspace_id: "ws-1", price: 80, status: "accepted" },
          { id: "q-done", request_id: "req-done", offering_workspace_id: "ws-1", price: 120, status: "accepted" },
        ],
        error: null,
      }),
      my_engagements: () => ({
        data: [
          { id: "eng-1", request_id: "req-booked", performing_workspace_id: "ws-1" },
          { id: "eng-2", request_id: "req-done", performing_workspace_id: "ws-1" },
        ],
        error: null,
      }),
      resolve_request: (a) => {
        const byId = {
          "req-sent": { id: "req-sent", service_id: "svc-1", status: "collecting" },
          "req-booked": { id: "req-booked", service_id: "svc-2", status: "booked" },
          "req-done": { id: "req-done", service_id: "svc-3", status: "completed" },
        };
        return { data: [byId[a.p_request_id]].filter(Boolean), error: null };
      },
      review_for_request: (a) =>
        a.p_request_id === "req-done"
          ? { data: [{ stars: 5, body: "Great work" }], error: null }
          : { data: [], error: null },
      resolve_workspace_owner_auth_ids: () => ({ data: [{ workspace_id: "ws-1", auth_user_id: "pro-1" }], error: null }),
    });

    const result = await fetchProJobs("pro-1", "ws-1");

    expect(result.sent.map((r) => r.id)).toEqual(["req-sent"]);
    expect(result.booked.map((r) => r.id)).toEqual(["req-booked"]);
    expect(result.completed.map((r) => r.id)).toEqual(["req-done"]);

    expect(result.booked[0].quotes).toEqual([{ id: "q-booked", proId: "pro-1", price: 80, status: "accepted" }]);
    expect(result.completed[0].review).toEqual({ stars: 5, text: "Great work" });
    expect(result.sent[0].bookedProId).toBeNull();
    expect(result.booked[0].bookedProId).toBe("pro-1");
  });

  it("propagates a my_quotes error", async () => {
    mockApi({ my_quotes: () => ({ data: null, error: new Error("denied") }), my_engagements: () => ({ data: [], error: null }) });
    await expect(fetchProJobs("pro-1", "ws-1")).rejects.toThrow("denied");
  });

  it("threads property/asset/location and engagement ids through for ProJobDetailSheet.jsx (WP 2.4)", async () => {
    mockApi({
      my_quotes: () => ({
        data: [{ id: "q-booked", request_id: "req-booked", offering_workspace_id: "ws-1", price: 80, status: "accepted" }],
        error: null,
      }),
      my_engagements: () => ({
        data: [{ id: "eng-1", request_id: "req-booked", performing_workspace_id: "ws-1" }],
        error: null,
      }),
      resolve_request: () => ({
        data: [{ id: "req-booked", service_id: "svc-2", status: "booked", property_id: "prop-1", asset_id: null, location_id: null }],
        error: null,
      }),
      review_for_request: () => ({ data: [], error: null }),
      resolve_workspace_owner_auth_ids: () => ({ data: [{ workspace_id: "ws-1", auth_user_id: "pro-1" }], error: null }),
    });

    const result = await fetchProJobs("pro-1", "ws-1");

    expect(result.booked[0]).toMatchObject({
      propertyId: "prop-1", assetId: null, locationId: null, engagementId: "eng-1",
    });
  });
});

describe("subscribeToCustomerRequests / subscribeToRequestQuotes", () => {
  function createChannel() {
    const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };
    return channel;
  }

  it("returns a no-op without opening a channel when no workspace has resolved", () => {
    const unsubscribe = subscribeToCustomerRequests("cust-1", undefined, vi.fn());
    expect(supabase.channel).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });

  it("subscribes to work.requests, work.quotes and work.engagements, scoped to the workspace", () => {
    const channel = createChannel();
    vi.mocked(supabase.channel).mockReturnValue(channel);

    subscribeToCustomerRequests("cust-1", "ws-1", vi.fn());

    const tables = channel.on.mock.calls.map(([, opts]) => opts.table);
    expect(tables).toEqual(["requests", "quotes", "engagements"]);
    expect(channel.on.mock.calls[0][1]).toMatchObject({ schema: "work", filter: "requesting_workspace_id=eq.ws-1" });
    expect(channel.on.mock.calls[2][1]).toMatchObject({ schema: "work", filter: "requesting_workspace_id=eq.ws-1" });
  });

  it("returns an unsubscribe function that removes the channel", () => {
    const channel = createChannel();
    vi.mocked(supabase.channel).mockReturnValue(channel);

    const unsubscribe = subscribeToCustomerRequests("cust-1", "ws-1", vi.fn());
    unsubscribe();

    expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
  });

  it("subscribeToRequestQuotes subscribes to work.quotes filtered by request_id", () => {
    const channel = createChannel();
    vi.mocked(supabase.channel).mockReturnValue(channel);

    subscribeToRequestQuotes("req-1", vi.fn());

    expect(channel.on.mock.calls[0][1]).toMatchObject({ schema: "work", table: "quotes", filter: "request_id=eq.req-1" });
  });
});

// Unchanged: fetchProLeads() itself stays legacy, so its own invalidation signal does too.
describe("subscribeToProLeads", () => {
  it("subscribes to legacy service_requests inserts, filtered by category", () => {
    const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };
    vi.mocked(supabase.channel).mockReturnValue(channel);

    subscribeToProLeads(["cleaning", "repairs"], vi.fn());

    expect(channel.on.mock.calls[0][1]).toMatchObject({
      schema: "public", table: "service_requests", filter: "category_id=in.(cleaning,repairs)",
    });
  });

  it("returns a no-op when there are no offered categories yet", () => {
    const unsubscribe = subscribeToProLeads([], vi.fn());
    expect(supabase.channel).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });
});

describe("subscribeToProQuoteUpdates", () => {
  it("returns a no-op without opening a channel when no workspace has resolved", () => {
    const unsubscribe = subscribeToProQuoteUpdates(undefined, vi.fn());
    expect(supabase.channel).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });

  it("subscribes to work.quotes (offering side) and work.engagements (performing side)", () => {
    const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };
    vi.mocked(supabase.channel).mockReturnValue(channel);

    subscribeToProQuoteUpdates("ws-1", vi.fn());

    expect(channel.on.mock.calls[0][1]).toMatchObject({ schema: "work", table: "quotes", filter: "offering_workspace_id=eq.ws-1" });
    expect(channel.on.mock.calls[1][1]).toMatchObject({ schema: "work", table: "engagements", filter: "performing_workspace_id=eq.ws-1" });
  });
});

// Dual-writes, correlated via api.resolve_work_request_for_legacy() — requestId is always
// a LEGACY id here, since fetchProLeads() stays legacy.
describe("sendQuote", () => {
  const args = { requestId: "legacy-req-1", proId: "pro-1", workspaceId: "ws-1", price: 85, message: "Can do today" };

  it("always inserts the legacy quote first, with the real column names", async () => {
    const builder = createQueryBuilder({ error: null });
    vi.mocked(supabase.from).mockReturnValue(builder);
    mockApi({
      resolve_work_request_for_legacy: () => ({ data: null, error: null }),
    });

    await sendQuote(args);

    expect(supabase.from).toHaveBeenCalledWith("quotes");
    expect(builder.insert).toHaveBeenCalledWith({ request_id: "legacy-req-1", pro_id: "pro-1", price: 85, message: "Can do today" });
  });

  it("defaults message to null when omitted, on both writes", async () => {
    const builder = createQueryBuilder({ error: null });
    vi.mocked(supabase.from).mockReturnValue(builder);
    const rpc = mockApi({ resolve_work_request_for_legacy: () => ({ data: "work-req-1", error: null }), submit_quote: () => ({ error: null }) });

    await sendQuote({ ...args, message: undefined });

    expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({ message: null }));
    const submitCall = rpc.mock.calls.find(([name]) => name === "submit_quote");
    expect(submitCall[1].p_message).toBeNull();
  });

  it("dual-writes into work.quotes when a correlated work.requests row exists", async () => {
    vi.mocked(supabase.from).mockReturnValue(createQueryBuilder({ error: null }));
    const rpc = mockApi({
      resolve_work_request_for_legacy: (a) => (a.p_service_request_id === "legacy-req-1" ? { data: "work-req-1", error: null } : { data: null, error: null }),
      submit_quote: () => ({ error: null }),
    });

    await sendQuote(args);

    const submitCall = rpc.mock.calls.find(([name]) => name === "submit_quote");
    expect(submitCall[1]).toMatchObject({
      p_request_id: "work-req-1", p_offering_workspace_id: "ws-1", p_price: 85, p_message: "Can do today",
      p_legacy_quote_id: null, p_actor_type: "person", p_actor_ref: "pro-1",
    });
  });

  it("degrades gracefully — writes legacy only — when no correlation exists", async () => {
    vi.mocked(supabase.from).mockReturnValue(createQueryBuilder({ error: null }));
    const rpc = mockApi({ resolve_work_request_for_legacy: () => ({ data: null, error: null }) });

    await sendQuote(args);

    expect(rpc).not.toHaveBeenCalledWith("submit_quote", expect.anything());
  });

  it("throws the legacy error without attempting the correlation lookup", async () => {
    vi.mocked(supabase.from).mockReturnValue(createQueryBuilder({ error: new Error("insert failed") }));
    const rpc = mockApi({ resolve_work_request_for_legacy: () => ({ data: null, error: null }) });

    await expect(sendQuote(args)).rejects.toThrow("insert failed");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("throws the work.quotes error even though the legacy quote already exists", async () => {
    vi.mocked(supabase.from).mockReturnValue(createQueryBuilder({ error: null }));
    mockApi({
      resolve_work_request_for_legacy: () => ({ data: "work-req-1", error: null }),
      submit_quote: () => ({ error: new Error("denied") }),
    });

    await expect(sendQuote(args)).rejects.toThrow("denied");
  });
});

describe("acceptQuote", () => {
  it("calls api.accept_quote with the quote and the real, resolved customer identity", async () => {
    const rpc = mockApi({ accept_quote: () => ({ error: null }) });

    await acceptQuote("quote-1", "cust-1");

    const call = rpc.mock.calls.find(([name]) => name === "accept_quote");
    expect(call[1]).toMatchObject({ p_quote_id: "quote-1", p_actor_type: "person", p_actor_ref: "cust-1" });
  });

  it("throws on a Supabase error", async () => {
    mockApi({ accept_quote: () => ({ error: new Error("update failed") }) });
    await expect(acceptQuote("quote-1", "cust-1")).rejects.toThrow("update failed");
  });
});

// Beta-completion slice (0182/0183) — the disclosure-consent action. Same resolve-then-act
// shape as markComplete() below, matching its own "resolved at action time" restraint.
describe("approveLocationDisclosure", () => {
  it("resolves the engagement for the request, then approves disclosure for it", async () => {
    const rpc = mockApi({
      resolve_engagement_for_request: (a) => (a.p_request_id === "req-1" ? { data: "eng-1", error: null } : { data: null, error: null }),
      approve_location_disclosure: () => ({ error: null }),
    });

    await approveLocationDisclosure("req-1", "cust-1");

    const call = rpc.mock.calls.find(([name]) => name === "approve_location_disclosure");
    expect(call[1]).toMatchObject({ p_engagement_id: "eng-1", p_actor_type: "person", p_actor_ref: "cust-1" });
    expect(call[1].p_disclosure_id).toBeTruthy();
  });

  it("throws rather than approving when no engagement is found", async () => {
    const rpc = mockApi({ resolve_engagement_for_request: () => ({ data: null, error: null }) });

    await expect(approveLocationDisclosure("req-1", "cust-1")).rejects.toThrow(/no engagement/i);
    expect(rpc).not.toHaveBeenCalledWith("approve_location_disclosure", expect.anything());
  });

  it("throws the real Supabase error from the approval call itself", async () => {
    mockApi({
      resolve_engagement_for_request: () => ({ data: "eng-1", error: null }),
      approve_location_disclosure: () => ({ error: new Error("insufficient_privilege") }),
    });

    await expect(approveLocationDisclosure("req-1", "cust-1")).rejects.toThrow("insufficient_privilege");
  });
});

describe("markComplete", () => {
  it("resolves the engagement for the request, then completes it", async () => {
    const rpc = mockApi({
      resolve_engagement_for_request: (a) => (a.p_request_id === "req-1" ? { data: "eng-1", error: null } : { data: null, error: null }),
      complete_engagement: () => ({ error: null }),
    });

    await markComplete("req-1", "cust-1");

    const call = rpc.mock.calls.find(([name]) => name === "complete_engagement");
    expect(call[1]).toMatchObject({ p_engagement_id: "eng-1", p_actor_type: "person", p_actor_ref: "cust-1" });
  });

  it("throws rather than completing when no engagement is found", async () => {
    const rpc = mockApi({ resolve_engagement_for_request: () => ({ data: null, error: null }) });

    await expect(markComplete("req-1", "cust-1")).rejects.toThrow(/no engagement/i);
    expect(rpc).not.toHaveBeenCalledWith("complete_engagement", expect.anything());
  });

  it("throws on a resolve error", async () => {
    mockApi({ resolve_engagement_for_request: () => ({ data: null, error: new Error("denied") }) });
    await expect(markComplete("req-1", "cust-1")).rejects.toThrow("denied");
  });
});

describe("submitReview", () => {
  it("calls api.submit_review_for_request with the real, resolved customer identity — never proId", async () => {
    const rpc = mockApi({ submit_review_for_request: () => ({ error: null }) });

    await submitReview({ requestId: "req-1", customerId: "cust-1", stars: 5, text: "Great work" });

    const call = rpc.mock.calls.find(([name]) => name === "submit_review_for_request");
    expect(call[1]).toMatchObject({
      p_request_id: "req-1", p_stars: 5, p_body: "Great work", p_actor_type: "person", p_actor_ref: "cust-1",
    });
    expect(call[1]).not.toHaveProperty("p_pro_id");
  });

  it("throws on a Supabase error", async () => {
    mockApi({ submit_review_for_request: () => ({ error: new Error("denied") }) });
    await expect(submitReview({ requestId: "req-1", customerId: "cust-1", stars: 5, text: "x" })).rejects.toThrow("denied");
  });
});
