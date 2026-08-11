// These codes are written to the reports table, so they are contract. The test exists to
// make renaming one a deliberate act rather than a rename-symbol away.
import { describe, it, expect } from "vitest";
import { REPORT_REASONS, reportReasonLabelKey } from "../reportReasons.js";

describe("REPORT_REASONS", () => {
  it("holds the codes the reports table expects, in offer order", () => {
    expect(REPORT_REASONS).toEqual(["no_show", "poor_quality", "billing_issue", "other"]);
  });

  it("gives every code a locale key, so no reason renders blank", () => {
    for (const reason of REPORT_REASONS) {
      expect(reportReasonLabelKey(reason)).toBeTruthy();
    }
  });
});

describe("reportReasonLabelKey", () => {
  it("names a known code", () => {
    expect(reportReasonLabelKey("no_show")).toBe("reportReasonNoShow");
  });

  it("returns nothing for a code this client doesn't know", () => {
    expect(reportReasonLabelKey("abducted_by_aliens")).toBeUndefined();
  });
});
