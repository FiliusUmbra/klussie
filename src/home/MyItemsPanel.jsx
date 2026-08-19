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
import { LocationFormSheet } from "./LocationFormSheet.jsx";
import { DocumentUploadSheet } from "./DocumentUploadSheet.jsx";
import { interpolate } from "../lib/homeStrings.js";
import { Badge } from "../design-system";
import { HomeSection } from "./panelParts.jsx";

// Platform Activation Slice 1, WP 1.3 wired the real read side of all five engines into
// one panel, Locations/Maintenance/Documents deliberately read-only until their own
// write contracts existed (Tier 2, WP 1.4-1.7). WP 1.8 is that write side, for Locations
// and Documents specifically (per SLICE_1_PROPERTY_ASSET_ACTIVATION.md's own WP 1.8
// scope — no maintenance-creation UI is named there, so none is added here either).
// Maintenance stays read-only in this panel; api.create_maintenance_obligation() (WP 1.7)
// exists but this work package does not name a client caller for it.
function SectionAddButton({ label, onClick }) {
  return (
    <button type="button" className="home-section-action" onClick={onClick} aria-label={label}>
      <Plus size={13} aria-hidden="true" />
    </button>
  );
}

// One node of the location tree (src/lib/homeInventory.js's buildLocationTree()),
// rendered recursively. `type` is a configurable, unconstrained taxonomy value (migration
// 0043 — "kitchen, plant room, cold storage... never hardcoded"), so it is shown as-is,
// the same restraint ItemCard already holds for brand/model: a real field, never a lookup.
function LocationNode({ node }) {
  return (
    <li className="location-node">
      <span className="location-node-name">
        {node.name}
        {node.type && <span className="location-node-type">{node.type}</span>}
      </span>
      {node.children.length > 0 && (
        <ul className="location-tree">
          {node.children.map((child) => (
            <LocationNode key={child.id} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

function LocationTree({ rooms }) {
  return (
    <ul className="location-tree location-tree-root">
      {rooms.map((node) => (
        <LocationNode key={node.id} node={node} />
      ))}
    </ul>
  );
}

// work.my_maintenance_obligations() (migration 0137) already computes is_overdue at read
// time and sorts open-before-settled — see src/lib/maintenance.js's own header — so this
// is display only, no date math of its own.
function MaintenanceList({ t, fmtDate, maintenance }) {
  return (
    <ul className="maintenance-list">
      {maintenance.map((row) => (
        <li key={row.id} className="maintenance-row">
          <span className="maintenance-row-title">{row.title}</span>
          {row.status === "open" && row.dueOn && (
            <span className="maintenance-row-due">
              {row.isOverdue ? (
                <Badge tone="amber">{t.myItemsMaintenanceOverdue}</Badge>
              ) : (
                interpolate(t.myItemsMaintenanceDueOn, { date: fmtDate(row.dueOn) })
              )}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

// property.my_documents() requires exactly one subject and homeInventory.js's
// loadDocuments() scopes this to property-level attachments only — see that function's
// own header for why a location's or an asset's own documents are a later, separate view.
function DocumentList({ t, fmtDate, documents }) {
  const today = new Date();
  return (
    <ul className="document-list">
      {documents.map((doc) => {
        const expired = doc.validUntil && new Date(doc.validUntil) < today;
        return (
          <li key={doc.id} className="document-row">
            <span className="document-row-caption">{doc.caption || doc.typeKey}</span>
            {doc.validUntil && (
              <span className="document-row-validity">
                {expired ? (
                  <Badge tone="amber">{t.myItemsDocumentExpired}</Badge>
                ) : (
                  interpolate(t.myItemsDocumentValidUntil, { date: fmtDate(doc.validUntil) })
                )}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

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

export function MyItemsPanel({
  t, ownerId, items, itemsError, onRefresh, fmtDate, rooms, documents, maintenance, propertyId, workspaceId,
}) {
  // null | { type: "item", item } | { type: "location" } | { type: "document" }
  const [activeSheet, setActiveSheet] = useState(null);
  const canAddRoomsOrDocuments = !!propertyId;

  const groups = groupByCategory(items);
  const loading = items === null && !itemsError;

  return (
    <div className="home-panel">
      <h2 className="home-panel-question">{t.myItemsQuestion}</h2>

      <button type="button" className="home-panel-action" onClick={() => setActiveSheet({ type: "item", item: null })}>
        <Plus size={15} aria-hidden="true" /> {t.itemAddTitle}
      </button>

      {/* Locations, Maintenance and Documents: null while their own fetch is still
          resolving (useHomeContext.js's own "null means not loaded yet" convention,
          reused here) — rendered as their section's empty state until then, never a
          separate loading line of its own, since a wrong-but-brief "nothing yet" costs
          less here than three more loading strings would.
          The "+" action is withheld until a real property exists (canAddRoomsOrDocuments)
          — create_location()/create_document() both require one, and a customer without
          one yet has nowhere for a new room or document to attach to. */}
      <HomeSection
        title={t.myItemsRoomsTitle}
        emptyText={t.myItemsRoomsEmpty}
        isEmpty={!rooms?.length}
        action={canAddRoomsOrDocuments && (
          <SectionAddButton label={t.locationFormAddTitle} onClick={() => setActiveSheet({ type: "location" })} />
        )}
      >
        <LocationTree rooms={rooms || []} />
      </HomeSection>

      <HomeSection
        title={t.myItemsMaintenanceTitle}
        emptyText={t.myItemsMaintenanceEmpty}
        isEmpty={!maintenance?.length}
      >
        <MaintenanceList t={t} fmtDate={fmtDate} maintenance={maintenance || []} />
      </HomeSection>

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
              <ItemCard key={item.id} item={item} onEdit={(i) => setActiveSheet({ type: "item", item: i })} />
            ))}
          </ul>
        </section>
      ))}

      <HomeSection
        title={t.myItemsDocumentsTitle}
        emptyText={t.myItemsDocumentsEmpty}
        isEmpty={!documents?.length}
        action={canAddRoomsOrDocuments && (
          <SectionAddButton label={t.documentFormAddTitle} onClick={() => setActiveSheet({ type: "document" })} />
        )}
      >
        <DocumentList t={t} fmtDate={fmtDate} documents={documents || []} />
      </HomeSection>

      {activeSheet?.type === "item" && (
        <ItemFormSheet
          t={t}
          ownerId={ownerId}
          propertyId={propertyId}
          item={activeSheet.item}
          onClose={() => setActiveSheet(null)}
          onSaved={onRefresh}
        />
      )}

      {activeSheet?.type === "location" && (
        <LocationFormSheet
          t={t}
          propertyId={propertyId}
          actorRef={ownerId}
          rooms={rooms || []}
          onClose={() => setActiveSheet(null)}
          onSaved={onRefresh}
        />
      )}

      {activeSheet?.type === "document" && (
        <DocumentUploadSheet
          t={t}
          propertyId={propertyId}
          workspaceId={workspaceId}
          actorRef={ownerId}
          onClose={() => setActiveSheet(null)}
          onSaved={onRefresh}
        />
      )}
    </div>
  );
}
