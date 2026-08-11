// What a professional reads before quoting. An empty row is worse than no row: it looks
// like an answer that says nothing, when in fact the question was never answered.
import { describe, it, expect } from "vitest";
import { fieldValueLabel, jobDetailRows } from "../serviceFields.js";
import { SERVICE_QUESTIONS } from "../serviceQuestions.js";

const t = {
  yesLabel: "Yes",
  noLabel: "No",
  optLaminate: "Laminate",
  fieldRooms: "Rooms",
};

describe("fieldValueLabel", () => {
  it("renders a number answer as text", () => {
    expect(fieldValueLabel({ type: "number" }, 3, t)).toBe("3");
  });

  it("treats a zero answer as an answer, not a blank", () => {
    // "0 rooms" is nonsense, but "0 outlets" is a real answer to a real question.
    expect(fieldValueLabel({ type: "number" }, 0, t)).toBe("0");
  });

  it("renders both sides of a boolean, because 'no' is information", () => {
    // "No, don't paint the ceiling" changes the quote as much as "yes" does.
    expect(fieldValueLabel({ type: "boolean" }, true, t)).toBe("Yes");
    expect(fieldValueLabel({ type: "boolean" }, false, t)).toBe("No");
  });

  it("resolves a select answer through its label key", () => {
    const field = { type: "select", options: [{ value: "laminate", label: "optLaminate" }] };
    expect(fieldValueLabel(field, "laminate", t)).toBe("Laminate");
  });

  it("falls back to the raw value when a select option has no translation", () => {
    const field = { type: "select", options: [{ value: "marble", label: "optMarble" }] };
    expect(fieldValueLabel(field, "marble", t)).toBe("marble");
  });

  it("returns nothing for a question the customer skipped", () => {
    expect(fieldValueLabel({ type: "number" }, undefined, t)).toBeNull();
    expect(fieldValueLabel({ type: "number" }, null, t)).toBeNull();
    expect(fieldValueLabel({ type: "number" }, "", t)).toBeNull();
  });
});

describe("jobDetailRows", () => {
  // Use a real service so the test breaks if the catalog's question shapes change.
  const serviceId = Object.keys(SERVICE_QUESTIONS)[0];
  const questions = SERVICE_QUESTIONS[serviceId];

  it("returns a row per answered question, in the order they are asked", () => {
    const fields = Object.fromEntries(questions.map((q) => [q.key, q.type === "boolean" ? true : q.type === "select" ? q.options[0].value : 2]));
    const rows = jobDetailRows(serviceId, fields, t);
    expect(rows).toHaveLength(questions.length);
    expect(rows.every((r) => r.value !== null)).toBe(true);
  });

  it("drops the questions the customer skipped instead of rendering blank rows", () => {
    const rows = jobDetailRows(serviceId, { [questions[0].key]: 2 }, t);
    expect(rows).toHaveLength(1);
  });

  it("returns nothing for a service with no structured questions", () => {
    expect(jobDetailRows("a-consultative-service-with-no-questions", { anything: 1 }, t)).toEqual([]);
  });

  it("returns nothing for a request that carries no answers at all", () => {
    // Manual requests predate structured fields, and AI intake can return none.
    expect(jobDetailRows(serviceId, null, t)).toEqual([]);
    expect(jobDetailRows(serviceId, undefined, t)).toEqual([]);
  });

  it("returns nothing when every question was skipped, so no summary box renders", () => {
    expect(jobDetailRows(serviceId, {}, t)).toEqual([]);
  });
});
