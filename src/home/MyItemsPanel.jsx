// "Mijn spullen" V1 — household products, appliances and possessions the customer has
// recorded.
//
// Naming note, since the original brief called it out: "spullen" / "items", never
// "apparel" — apparel means clothing, which is not what this holds.
//
// This replaces four quick actions that all said "not yet available". One of them —
// entering something by hand — is now real, backed by household_items (0016). The other
// three (scanning a product, reading a receipt, checking a guarantee) are still
// capabilities klussie does not have: nothing in this repository recognises a product from
// a photo or looks one up in a manufacturer database. They are therefore not shown at all
// rather than shown disabled, because a surface that can genuinely do something should
// lead with that rather than surround it with four things it cannot.
//
// The AI path those actions describe is designed and waiting in the schema, not faked
// here: household_items carries `source` and `ai_suggestion`, and 0016's check constraint
// has no value for unconfirmed model output. When recognition lands, this panel gains a
// camera button that fills the same form for the customer to confirm — no migration, no
// new table, and no moment where klussie saves a guess about someone's home unasked.
import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { groupByCategory } from "../lib/itemCategories.js";
import { ItemFormSheet } from "./ItemFormSheet.jsx";
import { interpolate } from "../lib/homeStrings.js";

function ItemCard({ item, onEdit }) {
  // Brand and model are the two facts a professional would ask for first, so they form the
  // subtitle when present. Absent, the card simply does not have one — no "Unknown brand".
  const subtitle = [item.brand, item.model].filter(Boolean).join(" ");
  return (
    <li>
      <button type="button" className="item-card" onClick={() => onEdit(item)}>
        <span className="item-card-photo">
          {item.photoUrl ? <img src={item.photoUrl} alt="" /> : <span className="item-card-initial" aria-hidden="true">{item.name[0]}</span>}
        </span>
        <span className="item-card-text">
          <span className="item-card-name">{item.name}</span>
          {subtitle && <span className="item-card-sub">{subtitle}</span>}
          {item.room && <span className="item-card-room">{item.room}</span>}
        </span>
        <Pencil className="item-card-edit" size={14} aria-hidden="true" />
      </button>
    </li>
  );
}

export function MyItemsPanel({ t, ownerId, items, itemsError, onRefresh }) {
  const [formFor, setFormFor] = useState(null); // { item } | { item: null } | null

  const groups = groupByCategory(items);
  const loading = items === null && !itemsError;

  return (
    <div className="home-panel">
      <h2 className="home-panel-question">{t.myItemsQuestion}</h2>

      <button type="button" className="home-panel-action" onClick={() => setFormFor({ item: null })}>
        <Plus size={15} aria-hidden="true" /> {t.itemAddTitle}
      </button>

      {/* A failed read must not look like an empty inventory — that would invite the
          customer to enter everything a second time. */}
      {itemsError && (
        <p className="home-group-empty" role="status">{t.myItemsLoadFailed}</p>
      )}

      {loading && <p className="home-group-empty">{t.myItemsLoading}</p>}

      {!loading && !itemsError && groups.length === 0 && (
        <div className="items-empty">
          <p className="items-empty-line">{t.myItemsEmptyTitle}</p>
          <p className="items-empty-hint">{t.myItemsEmptyHint}</p>
        </div>
      )}

      {groups.map((group) => (
        <section key={group.id} className="home-group">
          <h3 className="home-group-title">
            {t[group.labelKey]}
            <span className="home-group-count">
              {group.items.length === 1 ? t.myItemsOneItem : interpolate(t.myItemsCount, { count: group.items.length })}
            </span>
          </h3>
          <ul className="item-grid">
            {group.items.map((item) => (
              <ItemCard key={item.id} item={item} onEdit={(i) => setFormFor({ item: i })} />
            ))}
          </ul>
        </section>
      ))}

      {formFor && (
        <ItemFormSheet
          t={t}
          ownerId={ownerId}
          item={formFor.item}
          onClose={() => setFormFor(null)}
          onSaved={onRefresh}
        />
      )}
    </div>
  );
}
