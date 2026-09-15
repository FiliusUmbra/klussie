// The vocabularies My Items offers: what kind of thing something is, and where it lives.
//
// Configuration, not rendering (Constitution Rule 2: business decisions are data). The
// panel reads this; it never hardcodes a category, an order, or a room inside JSX. Adding
// a category is an edit here, a value in 0016's check constraint, and two locale keys.
//
// `labelKey` values are keys into `t` (src/lib/homeStrings.js) — never literal copy, so
// all 10 locales stay real.
import { Refrigerator, Tv, Sofa, Trees, Wrench, Package } from "lucide-react";

/**
 * Item categories, in the order they are offered and grouped on the list.
 *
 * The `id` values are the contract with household_items.category's check constraint in
 * 0016 — changing one is a migration, not a rename. 'other' is last and is the default
 * because a person who does not know how to classify their thing must still be able to
 * save it.
 *
 * `icon` — Item Detail redesign, 2026-09-15 — one representative glyph per broad
 * category (never per specific device: this codebase has no "washing machine vs.
 * dishwasher" taxonomy, only these six broad groups, so the icon reads as "this is an
 * appliance," not a claim about which one). Same `{id, icon}` shape and lookup idiom
 * catalog.js's own CATS already established, matched here rather than invented fresh.
 */
export const ITEM_CATEGORIES = [
  { id: "appliance", labelKey: "itemCatAppliance", icon: Refrigerator },
  { id: "electronics", labelKey: "itemCatElectronics", icon: Tv },
  { id: "furniture", labelKey: "itemCatFurniture", icon: Sofa },
  { id: "garden", labelKey: "itemCatGarden", icon: Trees },
  { id: "tool", labelKey: "itemCatTool", icon: Wrench },
  { id: "other", labelKey: "itemCatOther", icon: Package },
];

export const DEFAULT_ITEM_CATEGORY = "other";

/**
 * Suggested rooms. Deliberately suggestions rather than a closed list: household_items.room
 * is free text (0016), because no rooms table exists and a fixed vocabulary would refuse
 * "zolderkamer" or "garage achteraan". These are the taps that save typing for the common
 * cases; anything else can be written.
 */
export const SUGGESTED_ROOMS = [
  { id: "kitchen", labelKey: "itemRoomKitchen" },
  { id: "living", labelKey: "itemRoomLiving" },
  { id: "bedroom", labelKey: "itemRoomBedroom" },
  { id: "bathroom", labelKey: "itemRoomBathroom" },
  { id: "garage", labelKey: "itemRoomGarage" },
  { id: "garden", labelKey: "itemRoomGarden" },
  { id: "attic", labelKey: "itemRoomAttic" },
  { id: "basement", labelKey: "itemRoomBasement" },
];

/** Locale key naming a category, or the 'other' key for one this client doesn't know. */
export function categoryLabelKey(categoryId) {
  const hit = ITEM_CATEGORIES.find((c) => c.id === categoryId);
  return (hit ?? ITEM_CATEGORIES.find((c) => c.id === DEFAULT_ITEM_CATEGORY)).labelKey;
}

/** The icon component representing a category, or 'other's for one this client doesn't
 * know (an item with no category at all included — same fallback shape as
 * categoryLabelKey() above). */
export function categoryIcon(categoryId) {
  const hit = ITEM_CATEGORIES.find((c) => c.id === categoryId);
  return (hit ?? ITEM_CATEGORIES.find((c) => c.id === DEFAULT_ITEM_CATEGORY)).icon;
}

/**
 * Items arranged for display: one group per category, in catalog order, with empty
 * categories dropped.
 *
 * Empty groups are dropped rather than shown as headings with nothing under them —
 * six empty categories is the "dense dashboard" the brief rules out, and a person with
 * one lamp should see one lamp.
 */
export function groupByCategory(items) {
  const list = items || [];
  return ITEM_CATEGORIES
    .map((category) => ({
      id: category.id,
      labelKey: category.labelKey,
      items: list.filter((item) => item.category === category.id),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * Whether a form is complete enough to save. Name is the only requirement, matching
 * 0016's only NOT NULL column: everything else about an object can be genuinely unknown
 * to the person who owns it, and a form that refuses to save teaches people to invent
 * a brand rather than leave it blank.
 */
export function canSaveItem(draft) {
  return (draft?.name || "").trim().length > 0;
}
