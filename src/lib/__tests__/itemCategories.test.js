// The category list is contract with 0016's check constraint, and the grouping rule is
// what keeps My Items a calm record rather than six empty headings.
import { describe, it, expect } from "vitest";
import {
  ITEM_CATEGORIES,
  DEFAULT_ITEM_CATEGORY,
  SUGGESTED_ROOMS,
  categoryLabelKey,
  groupByCategory,
  canSaveItem,
} from "../itemCategories.js";

const item = (over) => ({ id: "i", name: "Thing", category: "other", ...over });

describe("ITEM_CATEGORIES", () => {
  it("matches the values household_items.category accepts in 0016", () => {
    // Changing this list is a migration, not a rename. Pinned so that is deliberate.
    expect(ITEM_CATEGORIES.map((c) => c.id)).toEqual([
      "appliance", "electronics", "furniture", "garden", "tool", "other",
    ]);
  });

  it("gives every category a locale key, so none renders blank", () => {
    for (const category of ITEM_CATEGORIES) {
      expect(category.labelKey, `${category.id} has no labelKey`).toBeTruthy();
    }
  });

  it("defaults to a category that exists", () => {
    expect(ITEM_CATEGORIES.some((c) => c.id === DEFAULT_ITEM_CATEGORY)).toBe(true);
  });

  it("offers rooms as suggestions, each with a locale key", () => {
    expect(SUGGESTED_ROOMS.length).toBeGreaterThan(0);
    for (const room of SUGGESTED_ROOMS) {
      expect(room.labelKey, `${room.id} has no labelKey`).toBeTruthy();
    }
  });
});

describe("categoryLabelKey", () => {
  it("names a known category", () => {
    expect(categoryLabelKey("appliance")).toBe("itemCatAppliance");
  });

  it("falls back to 'other' for a value this client doesn't know", () => {
    // A category added by a later migration must not render a blank heading.
    expect(categoryLabelKey("spaceship")).toBe("itemCatOther");
    expect(categoryLabelKey(undefined)).toBe("itemCatOther");
  });
});

describe("groupByCategory", () => {
  it("groups items in catalog order, not insertion order", () => {
    const groups = groupByCategory([
      item({ id: "a", category: "tool" }),
      item({ id: "b", category: "appliance" }),
    ]);
    expect(groups.map((g) => g.id)).toEqual(["appliance", "tool"]);
  });

  it("drops empty categories rather than showing headings with nothing under them", () => {
    // A person with one lamp should see one lamp, not six empty sections.
    const groups = groupByCategory([item({ category: "furniture" })]);
    expect(groups.map((g) => g.id)).toEqual(["furniture"]);
  });

  it("keeps every item of a category together", () => {
    const groups = groupByCategory([
      item({ id: "a", category: "appliance" }),
      item({ id: "b", category: "appliance" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("returns nothing to render for an empty or unloaded inventory", () => {
    expect(groupByCategory([])).toEqual([]);
    expect(groupByCategory(null)).toEqual([]);
    expect(groupByCategory(undefined)).toEqual([]);
  });

  it("silently omits an item whose category this client doesn't know", () => {
    // Better a missing row than a crash or an invented heading; the row is still in the
    // database and reappears once the client learns the category.
    expect(groupByCategory([item({ category: "spaceship" })])).toEqual([]);
  });
});

describe("canSaveItem", () => {
  it("requires a name, matching the only NOT NULL column in 0016", () => {
    expect(canSaveItem({ name: "Boiler" })).toBe(true);
    expect(canSaveItem({ name: "" })).toBe(false);
    expect(canSaveItem({})).toBe(false);
    expect(canSaveItem(null)).toBe(false);
  });

  it("does not accept whitespace as a name", () => {
    expect(canSaveItem({ name: "   " })).toBe(false);
  });

  it("asks for nothing else, so an unknown brand is not a blocked save", () => {
    // A form that refuses to save teaches people to invent a brand rather than leave it
    // blank, which would poison the one record this table is meant to be.
    expect(canSaveItem({ name: "Hand-me-down sofa" })).toBe(true);
  });
});
