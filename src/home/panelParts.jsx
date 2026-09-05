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

// Renders any subject's document list identically — property, or (0199, "Ask Klussie"
// slice) one specific asset. Moved out of MyItemsPanel.jsx, which held the only caller
// until ItemFormSheet.jsx's own Documents section (asset-scoped) became the second, so
// the "real bug found live 2026-08-28" caption fallback below stays fixed in one place
// rather than risking a second, independently-drifting copy.
export function DocumentList({ t, fmtDate, documents }) {
  const today = new Date();
  return (
    <ul className="document-list">
      {documents.map((doc) => {
        const expired = doc.validUntil && new Date(doc.validUntil) < today;
        return (
          <li key={doc.id} className="document-row">
            <span className="document-row-caption">
              {doc.caption || (() => {
                // A real bug, found live 2026-08-28: DocumentUploadSheet.jsx has no
                // caption field at all, so doc.caption is always empty for every
                // document created through this app's own UI -- the fallback below used
                // to render the raw, untranslated typeKey ("warranty") instead of the
                // real localized label ("Garantie"/"Warranty"/...) every single time,
                // matching the idiom ProJobDetailSheet.jsx's own twin section and
                // DocumentUploadSheet.jsx's own dropdown already use correctly.
                const labelKey = documentTypeLabelKey(doc.typeKey);
                return labelKey ? t[labelKey] : doc.typeKey;
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
          </li>
        );
      })}
    </ul>
  );
}
