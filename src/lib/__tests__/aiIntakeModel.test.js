// The intake sheet's product rules. Each of these was previously a literal inside a
// render function, which meant "klussie asks at most twice" was a claim nobody could
// verify without clicking through the flow with a mocked model.
import { describe, it, expect } from "vitest";
import {
  AI_FOLLOWUP_ROUND_LIMIT,
  editableFromResult,
  initialStage,
  shouldAskFollowUp,
  confidenceTone,
  servicesForApi,
  canSubmitIntake,
  buildIntakeRequest,
} from "../aiIntakeModel.js";

describe("editableFromResult", () => {
  it("seeds the review form from a result", () => {
    const seeded = editableFromResult({
      matchedServiceId: "svc-1",
      description: "Kitchen tap dripping",
      estimatedBudget: { min: 80, max: 150 },
      urgency: "high",
    });
    expect(seeded).toEqual({
      serviceId: "svc-1",
      description: "Kitchen tap dripping",
      budget: "150",
      when: "this_week",
    });
  });

  it("quotes the top of the estimated range, not the floor", () => {
    // The budget field is what a customer decides they can live with. Showing the
    // cheapest end sets up a disappointment when quotes arrive.
    expect(editableFromResult({ estimatedBudget: { min: 80, max: 150 } }).budget).toBe("150");
  });

  it("falls back to the minimum when the model gave no upper bound", () => {
    expect(editableFromResult({ estimatedBudget: { min: 80 } }).budget).toBe("80");
  });

  it("leaves budget blank rather than guessing when no estimate came back", () => {
    expect(editableFromResult({ description: "x" }).budget).toBe("");
  });

  it("only a low-urgency job defaults to flexible timing", () => {
    expect(editableFromResult({ urgency: "low" }).when).toBe("flexible");
    expect(editableFromResult({ urgency: "medium" }).when).toBe("this_week");
    expect(editableFromResult({ urgency: "high" }).when).toBe("this_week");
  });

  it("produces a usable empty form from no result at all", () => {
    // The sheet calls this before any analysis exists; it must not throw.
    expect(editableFromResult(null)).toEqual({
      serviceId: null,
      description: "",
      budget: "",
      when: "this_week",
    });
  });
});

describe("initialStage", () => {
  it("starts at compose when the customer hasn't described anything yet", () => {
    expect(initialStage(null)).toBe("compose");
  });

  it("opens on the questions when a handed-over result has some", () => {
    expect(initialStage({ followUpQuestions: [{ key: "q1" }] })).toBe("followup");
  });

  it("skips straight to review when the model had nothing more to ask", () => {
    expect(initialStage({ followUpQuestions: [] })).toBe("review");
    expect(initialStage({ confidence: 90 })).toBe("review");
  });
});

describe("shouldAskFollowUp", () => {
  it("asks while there are questions and allowance left", () => {
    const result = { followUpQuestions: [{ key: "q1" }] };
    expect(shouldAskFollowUp(result, 0)).toBe(true);
    expect(shouldAskFollowUp(result, AI_FOLLOWUP_ROUND_LIMIT - 1)).toBe(true);
  });

  it("stops at the limit even when the model keeps asking", () => {
    // A customer who came to report one leaking tap must never be trapped in an
    // interview, however uncertain the model is.
    const result = { followUpQuestions: [{ key: "q1" }] };
    expect(shouldAskFollowUp(result, AI_FOLLOWUP_ROUND_LIMIT)).toBe(false);
    expect(shouldAskFollowUp(result, AI_FOLLOWUP_ROUND_LIMIT + 5)).toBe(false);
  });

  it("does not ask when there is nothing to ask", () => {
    expect(shouldAskFollowUp({ followUpQuestions: [] }, 0)).toBe(false);
    expect(shouldAskFollowUp({}, 0)).toBeFalsy();
    expect(shouldAskFollowUp(null, 0)).toBeFalsy();
  });
});

describe("confidenceTone", () => {
  it("reserves the confident tone for genuinely confident results", () => {
    expect(confidenceTone({ confidence: 85 })).toBe("forest");
    expect(confidenceTone({ confidence: 100 })).toBe("forest");
  });

  it("flags the middle band rather than presenting it as certain", () => {
    expect(confidenceTone({ confidence: 60 })).toBe("amber");
    expect(confidenceTone({ confidence: 84 })).toBe("amber");
  });

  it("stays neutral when the model is unsure or absent", () => {
    expect(confidenceTone({ confidence: 59 })).toBe("sage");
    expect(confidenceTone({ confidence: 0 })).toBe("sage");
    expect(confidenceTone(null)).toBe("sage");
  });
});

describe("servicesForApi", () => {
  it("sends the model the localised words the customer is reading", () => {
    const services = [{ id: "s1", cat: "plumbing" }];
    const serviceInfo = (id) => ({ name: `name-${id}`, blurb: `blurb-${id}` });
    expect(servicesForApi(services, serviceInfo)).toEqual([
      { id: "s1", name: "name-s1", category: "plumbing", blurb: "blurb-s1" },
    ]);
  });
});

describe("canSubmitIntake", () => {
  it("requires both a matched service and a description", () => {
    expect(canSubmitIntake({ serviceId: "s1", description: "leaking tap" })).toBe(true);
    expect(canSubmitIntake({ serviceId: null, description: "leaking tap" })).toBe(false);
    expect(canSubmitIntake({ serviceId: "s1", description: "" })).toBe(false);
  });

  it("does not accept whitespace as a description", () => {
    // A professional cannot quote on "   ".
    expect(canSubmitIntake({ serviceId: "s1", description: "   " })).toBe(false);
  });
});

describe("buildIntakeRequest", () => {
  const baseServices = [{ id: "s1", cat: "plumbing" }];
  const edited = { serviceId: "s1", description: "Tap drips", budget: "150", city: "Antwerp", when: "this_week" };

  it("resolves the category from the chosen service", () => {
    const payload = buildIntakeRequest({ edited, result: {}, baseServices, photos: [] });
    expect(payload.categoryId).toBe("plumbing");
  });

  it("records the customer's choice as the matched service, overruling the model", () => {
    // The stored analysis has to agree with the request it produced, or a later reader
    // sees klussie claiming a match the customer rejected.
    const result = { matchedServiceId: "something-else", confidence: 90 };
    const payload = buildIntakeRequest({ edited, result, baseServices, photos: [] });
    expect(payload.aiAnalysis.matchedServiceId).toBe("s1");
    expect(payload.aiAnalysis.confidence).toBe(90);
  });

  it("carries the model's structured fields through, defaulting to none", () => {
    expect(buildIntakeRequest({ edited, result: { structuredFields: { rooms: 3 } }, baseServices, photos: [] }).detailsJson)
      .toEqual({ rooms: 3 });
    expect(buildIntakeRequest({ edited, result: null, baseServices, photos: [] }).detailsJson).toEqual({});
  });

  it("passes the chosen service location straight through, defaulting to null", () => {
    expect(buildIntakeRequest({ edited, result: {}, baseServices, photos: [] }).location).toBeNull();
    const location = { type: "home", propertyId: "p1" };
    expect(buildIntakeRequest({ edited: { ...edited, location }, result: {}, baseServices, photos: [] }).location).toBe(location);
  });

  it("leaves categoryId undefined when the catalog has no such service", () => {
    // Better an absent category than a wrong one — it routes the lead to the wrong pros.
    const payload = buildIntakeRequest({ edited: { ...edited, serviceId: "unknown" }, result: {}, baseServices, photos: [] });
    expect(payload.categoryId).toBeUndefined();
  });
});
