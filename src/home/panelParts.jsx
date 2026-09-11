// Shared building block for the My Home and My Items panels.
//
// This used to also hold QuickActions and NotBuiltYetNote — a row of disabled buttons and
// a sentence explaining that klussie did not store anything yet. Both were honest while
// the surfaces were placeholders and became false the moment they weren't: My Items now
// has storage (0016) and My Home is derived from real requests. They are deleted rather
// than left unused, because a component that says "not built yet" is exactly the kind of
// stale claim that outlives the condition it described.
import { documentTypeLabelKey } from "../lib/documents.js";
import { interpolate } from "../lib/homeStrings.js";
import { isPastLocalDate } from "../lib/dates.js";
import { Badge } from "../design-system";

// A section that shows a plain-language line when it holds nothing, and its real
// content when it does. Progressive disclosure (DESIGN_SYSTEM.md): a customer opening
// My Home should see calm headings, not empty tables.
//
// The empty line is always a real sentence about that specific section — "no professional
// has finished a job here yet" — rather than one generic "nothing saved" repeated down the
// page, which tells someone nothing about what would fill it.
//
// `action` (Platform Activation Slice 1, WP 1.8): an optional node rendered beside the
// title, for a section that can add its own content (a "+ Add" button). Optional and
// additive — every existing caller (MyHomePanel.jsx's five read-only sections) renders
// exactly as before without it.
export function HomeSection({ title, emptyText, children, isEmpty, action }) {
  return (
    <section className="home-group">
      <h3 className="home-group-title">
        {title}
        {action}
      </h3>
      {isEmpty ? <p className="home-group-empty">{emptyText}</p> : children}
    </section>
  );
}

// The caption + validity content of one document row, without the <li> wrapper — shared
// by DocumentList below (a plain, non-interactive list) and Item Detail's own document
// rows (each one a real <button>, opening a signed URL — a <ul> cannot nest inside a
// <button>, so that caller needs the content alone, not another full list).
export function DocumentRowContent({ t, fmtDate, doc }) {
  // Found by code audit, 2026-09-11: this used to be
  // `doc.validUntil && new Date(doc.validUntil) < new Date()` -- see lib/dates.js's own
  // header for why comparing a date-only value to "now" as an instant reads a document as
  // expired for most of the actual day it expires.
  const expired = isPastLocalDate(doc.validUntil);
  return (
    <>
      <span className="document-row-caption">
        {doc.caption || (() => {
          // A real bug, found live 2026-08-28: DocumentUploadSheet.jsx has no caption
          // field at all, so doc.caption is always empty for every document created
          // through this app's own UI -- the fallback below used to render the raw,
          // untranslated typeKey ("warranty") instead of the real localized label
          // ("Garantie"/"Warranty"/...) every single time, matching the idiom
          // ProJobDetailSheet.jsx's own twin section and DocumentUploadSheet.jsx's own
          // dropdown already use correctly.
          //
          // Found live during a UX review, 2026-09-06: two of a customer's real
          // documents both fell back to this exact label ("Warranty", "Warranty"),
          // genuinely indistinguishable in the list -- even though DocumentUploadSheet.jsx
          // has always asked for and saved an `issuer` (e.g. "Vaillant"), already
          // threaded through every fetch path (fetchDocumentsForAsset(), homeInventory.js's
          // own loadDocuments(), and the raw api.my_documents() row ProJobDetailSheet.jsx
          // reads directly). Appending it here — the one place every document row's own
          // label is decided — fixes every caller at once.
          const labelKey = documentTypeLabelKey(doc.typeKey);
          const label = labelKey ? t[labelKey] : doc.typeKey;
          return doc.issuer ? `${label} — ${doc.issuer}` : label;
        })()}
      </span>
      {doc.validUntil && (
        <span className="document-row-validity">
          {expired ? (
            <Badge tone="amber">{t.myItemsDocumentExpired}</Badge>
          ) : (
            interpolate(t.myItemsDocumentValidUntil, { date: fmtDate(doc.validUntil) })
          )}
        </span>
      )}
    </>
  );
}

// Renders any subject's document list identically — property, or (0199, "Ask Klussie"
// slice) one specific asset. Moved out of MyItemsPanel.jsx, which held the only caller
// until ItemFormSheet.jsx's own Documents section (asset-scoped) became the second, so
// the "real bug found live 2026-08-28" caption fallback stays fixed in one place rather
// than risking a second, independently-drifting copy.
export function DocumentList({ t, fmtDate, documents }) {
  return (
    <ul className="document-list">
      {documents.map((doc) => (
        <li key={doc.id} className="document-row">
          <DocumentRowContent t={t} fmtDate={fmtDate} doc={doc} />
        </li>
      ))}
    </ul>
  );
}
