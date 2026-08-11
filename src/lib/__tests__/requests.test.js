// Foundation Freeze Epic 01, Slice C: the first real test suite, proving the
// harness works against this codebase's actual pattern — a thin wrapper
// around a Supabase call, throwing on { error } — not a trivial pure-function
// example. src/lib/supabaseClient.js is mocked entirely so these run without
// a real network call or real env vars.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../supabaseClient", () => ({
  supabase: { from: vi.fn() },
}));

import { supabase } from "../supabaseClient";
import { createServiceRequest, createDirectedRequest, sendQuote, acceptQuote } from "../requests";

// A minimal stand-in for supabase-js's chainable, thenable query builder —
// supports the exact chains src/lib/requests.js actually uses
// (.insert().select().single(), .insert() awaited directly, .update().eq()).
function createQueryBuilder(result) {
  const builder = {
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(result)),
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return builder;
}

beforeEach(() => {
  vi.mocked(supabase.from).mockReset();
});

describe("createServiceRequest", () => {
  it("maps camelCase args to the real snake_case columns and reshapes the returned row", async () => {
    const row = {
      id: "req-1",
      customer_id: "cust-1",
      service_id: "svc-1",
      category_id: "cleaning",
      details: "leaking sink",
      details_json: { severity: "high" },
      ai_analysis: null,
      when_pref: "this_week",
      budget: 100,
      city: "Brussels",
      status: "collecting",
      booked_pro_id: null,
      created_at: "2026-08-06T00:00:00Z",
      updated_at: "2026-08-06T00:00:00Z",
      quotes: [],
      reviews: [],
    };
    const builder = createQueryBuilder({ data: row, error: null });
    vi.mocked(supabase.from).mockReturnValue(builder);

    const result = await createServiceRequest({
      customerId: "cust-1",
      serviceId: "svc-1",
      categoryId: "cleaning",
      details: "leaking sink",
      detailsJson: { severity: "high" },
      whenPref: "this_week",
      budget: 100,
      city: "Brussels",
    });

    expect(supabase.from).toHaveBeenCalledWith("service_requests");
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_id: "cust-1",
        service_id: "svc-1",
        category_id: "cleaning",
        when_pref: "this_week",
        details_json: { severity: "high" },
      })
    );
    // reshapeRequest's real output shape — not the raw row.
    expect(result).toMatchObject({
      id: "req-1",
      cat: "cleaning",
      serviceId: "svc-1",
      status: "collecting",
      quotes: [],
    });
  });

  it("sends null for detailsJson when given an empty object, not {}", async () => {
    const builder = createQueryBuilder({
      data: { id: "req-2", category_id: "cleaning", quotes: [], reviews: [], details_json: null },
      error: null,
    });
    vi.mocked(supabase.from).mockReturnValue(builder);

    await createServiceRequest({
      customerId: "cust-1",
      serviceId: "svc-1",
      categoryId: "cleaning",
      whenPref: "flexible",
      detailsJson: {},
    });

    expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({ details_json: null }));
  });

  it("throws the real Supabase error instead of swallowing it", async () => {
    const builder = createQueryBuilder({ data: null, error: new Error("insert failed") });
    vi.mocked(supabase.from).mockReturnValue(builder);

    await expect(
      createServiceRequest({ customerId: "cust-1", serviceId: "svc-1", categoryId: "cleaning", whenPref: "flexible" })
    ).rejects.toThrow("insert failed");
  });
});

// Epic 03 WP9. The guardrails here are ADR-0012's, not conveniences: a directed request
// with no professional or no ceiling would be a commitment with nothing bounding it.
describe("createDirectedRequest", () => {
  const args = {
    customerId: "cust-1",
    serviceId: "svc-1",
    categoryId: "repairs",
    proId: "pro-9",
    autoAcceptMax: 260,
    details: "my sink is leaking",
    whenPref: "this_week",
    city: "Brussels",
  };

  function directedRow(overrides = {}) {
    return {
      id: "req-1", customer_id: "cust-1", service_id: "svc-1", category_id: "repairs",
      details: "my sink is leaking", details_json: null, ai_analysis: null,
      when_pref: "this_week", budget: null, city: "Brussels",
      status: "awaiting_pro", booked_pro_id: null,
      directed_pro_id: "pro-9", directed_until: "2026-08-11T00:00:00Z", auto_accept_max: "260.00",
      created_at: "2026-08-10T00:00:00Z", updated_at: "2026-08-10T00:00:00Z",
      quotes: [], reviews: [], ...overrides,
    };
  }

  it("writes a request addressed to one professional, awaiting them", async () => {
    const builder = createQueryBuilder({ data: directedRow(), error: null });
    vi.mocked(supabase.from).mockReturnValue(builder);

    await createDirectedRequest(args);

    expect(supabase.from).toHaveBeenCalledWith("service_requests");
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_id: "cust-1",
        directed_pro_id: "pro-9",
        auto_accept_max: 260,
        status: "awaiting_pro",
      })
    );
  });

  it("writes nothing that would commit the professional", async () => {
    const builder = createQueryBuilder({ data: directedRow(), error: null });
    vi.mocked(supabase.from).mockReturnValue(builder);

    await createDirectedRequest(args);
    const row = builder.insert.mock.calls[0][0];

    // booked_pro_id and any price belong to handle_quote_accepted() acting on a real
    // quote. Setting either here is exactly the shortcut ADR-0012 rejected.
    expect(row.booked_pro_id).toBeUndefined();
    expect(row.price).toBeUndefined();
    expect(row.status).toBe("awaiting_pro");
  });

  it("leaves the exclusive window to the database rather than sending one", async () => {
    const builder = createQueryBuilder({ data: directedRow(), error: null });
    vi.mocked(supabase.from).mockReturnValue(builder);

    await createDirectedRequest(args);
    // How long a professional gets is a platform rule. A client-supplied deadline would
    // be a client-controlled one.
    expect(builder.insert.mock.calls[0][0].directed_until).toBeUndefined();
  });

  it("refuses a request with no professional to direct at", async () => {
    await expect(createDirectedRequest({ ...args, proId: null })).rejects.toThrow(/professional/i);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("refuses a request with no usable ceiling", async () => {
    for (const bad of [null, undefined, 0, -5]) {
      await expect(createDirectedRequest({ ...args, autoAcceptMax: bad })).rejects.toThrow(/ceiling/i);
    }
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("reshapes the directed columns for callers, dates and numbers included", async () => {
    vi.mocked(supabase.from).mockReturnValue(createQueryBuilder({ data: directedRow(), error: null }));

    const result = await createDirectedRequest(args);
    expect(result).toMatchObject({
      id: "req-1",
      status: "awaiting_pro",
      directedProId: "pro-9",
      // numeric(10,2) arrives as a string; a caller comparing it to a price needs a number.
      autoAcceptMax: 260,
    });
    expect(result.directedUntil).toBe(new Date("2026-08-11T00:00:00Z").getTime());
  });

  it("leaves the directed fields null on an ordinary request", async () => {
    vi.mocked(supabase.from).mockReturnValue(
      createQueryBuilder({
        data: directedRow({ status: "collecting", directed_pro_id: null, directed_until: null, auto_accept_max: null }),
        error: null,
      })
    );

    const result = await createDirectedRequest(args);
    expect(result.directedProId).toBeNull();
    expect(result.directedUntil).toBeNull();
    expect(result.autoAcceptMax).toBeNull();
  });

  it("throws on a failed insert rather than reporting a request that does not exist", async () => {
    vi.mocked(supabase.from).mockReturnValue(createQueryBuilder({ data: null, error: { message: "denied" } }));
    await expect(createDirectedRequest(args)).rejects.toMatchObject({ message: "denied" });
  });
});

describe("sendQuote", () => {
  it("inserts into quotes with the real column names", async () => {
    const builder = createQueryBuilder({ error: null });
    vi.mocked(supabase.from).mockReturnValue(builder);

    await sendQuote({ requestId: "req-1", proId: "pro-1", price: 85, message: "Can do today" });

    expect(supabase.from).toHaveBeenCalledWith("quotes");
    expect(builder.insert).toHaveBeenCalledWith({
      request_id: "req-1",
      pro_id: "pro-1",
      price: 85,
      message: "Can do today",
    });
  });

  it("defaults message to null when omitted", async () => {
    const builder = createQueryBuilder({ error: null });
    vi.mocked(supabase.from).mockReturnValue(builder);

    await sendQuote({ requestId: "req-1", proId: "pro-1", price: 85 });

    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ message: null })
    );
  });
});

describe("acceptQuote", () => {
  it("updates the quote's status to accepted by id", async () => {
    const builder = createQueryBuilder({ error: null });
    vi.mocked(supabase.from).mockReturnValue(builder);

    await acceptQuote("quote-1");

    expect(supabase.from).toHaveBeenCalledWith("quotes");
    expect(builder.update).toHaveBeenCalledWith({ status: "accepted" });
    expect(builder.eq).toHaveBeenCalledWith("id", "quote-1");
  });

  it("throws on a Supabase error", async () => {
    const builder = createQueryBuilder({ error: new Error("update failed") });
    vi.mocked(supabase.from).mockReturnValue(builder);

    await expect(acceptQuote("quote-1")).rejects.toThrow("update failed");
  });
});
