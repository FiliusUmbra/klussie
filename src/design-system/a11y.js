// DOM-level accessibility wiring shared by Drawer and Modal (live review 2026-10-04, item 13).
//
// The app writes hundreds of `<label className="field-label">` + input pairs and `.sheet-title`
// headings by hand; none connected a label to its control or a dialog to its title, so screen
// readers met unnamed inputs and unnamed dialogs. Rather than touch ~80 call sites, the dialog
// shell wires them once, and keeps doing so as the sheet's own content changes (steps, errors).

const CONTROL = "input, textarea, select";

/** Gives an element an id (stable within a root) and returns it. */
function ensureId(el, prefix, n) {
  if (!el.id) el.id = `${prefix}-${n}`;
  return el.id;
}

/**
 * Connects every bare `label.field-label` to the first form control that follows it before the
 * next label, via `for`/`id`. Labels already connected (`for` set, or wrapping a control) are
 * left alone, as are controls that already carry their own aria-label / aria-labelledby.
 * Returns how many labels it connected.
 */
export function associateFieldLabels(root, prefix = "a11y") {
  let n = 0;
  root.querySelectorAll("label.field-label").forEach((label) => {
    if (label.getAttribute("for") || label.querySelector(CONTROL)) return;
    let sib = label.nextElementSibling;
    while (sib && !sib.matches("label.field-label")) {
      const control = sib.matches(CONTROL) ? sib : sib.querySelector(CONTROL);
      if (control) {
        if (!control.hasAttribute("aria-label") && !control.hasAttribute("aria-labelledby")) {
          n += 1;
          label.setAttribute("for", ensureId(control, `${prefix}-ctl`, n));
        }
        return;
      }
      sib = sib.nextElementSibling;
    }
  });
  return n;
}

/**
 * Names a dialog from its own `.sheet-title` heading when the caller gave no explicit
 * `labelledBy`/aria-label. Idempotent.
 */
export function nameDialogFromTitle(panel, prefix = "a11y") {
  if (panel.getAttribute("aria-labelledby") || panel.getAttribute("aria-label")) return false;
  const title = panel.querySelector(".sheet-title");
  if (!title) return false;
  panel.setAttribute("aria-labelledby", ensureId(title, `${prefix}-title`, 1));
  return true;
}
