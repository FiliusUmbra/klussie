// Turning the structured answers on a request (rooms, m², "ceiling included?") into the
// rows a summary renders.
//
// Extracted from src/App.jsx's JobDetailsSummary, which mixed the decision of *which*
// answers are worth showing with the markup that shows them. The decision is the part
// worth testing: an unanswered field must vanish rather than render an empty row, and a
// service with no answers at all must produce no summary rather than an empty box.
//
// `t` is passed in as a lookup table rather than imported, matching the rest of src/lib:
// this module resolves label keys, it never owns copy.
import { SERVICE_QUESTIONS } from "./serviceQuestions.js";

/**
 * One answer as display text, or null when the customer left it blank.
 *
 * `false` is an answer, not a blank — "no, don't paint the ceiling" is exactly the kind
 * of thing a professional needs before quoting, so the emptiness check is explicit about
 * undefined/null/"" rather than falsiness.
 */
export function fieldValueLabel(field, value, t) {
  if (value === undefined || value === null || value === "") return null;
  if (field.type === "boolean") return value ? t.yesLabel : t.noLabel;
  if (field.type === "select") return t[field.options.find((o) => o.value === value)?.label] || value;
  return String(value);
}

/**
 * The answered fields for a service, as label/value rows in the order the questions are
 * asked. Returns an empty array for a service with no structured questions, for a request
 * with no answers, and for one where every question was skipped — all three mean the same
 * thing to the caller: render nothing.
 */
export function jobDetailRows(serviceId, fields, t) {
  const questions = SERVICE_QUESTIONS[serviceId];
  if (!questions || !fields) return [];
  return questions
    .map((f) => ({ label: t[f.label], value: fieldValueLabel(f, fields[f.key], t) }))
    .filter((r) => r.value !== null);
}
