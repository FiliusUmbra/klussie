// klussie design system — overlays. Drawer is the bottom-sheet pattern already used
// everywhere in the app (formerly a standalone `Sheet` component in App.jsx — same
// markup, same CSS classes, just given its real name and moved here so there's one
// source of truth). Modal is a centered dialog for short confirmations and for the
// first-login tour, where a full-height drawer would be more chrome than the moment
// calls for.
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export function Drawer({ children, onClose, closeLabel = "Close" }) {
  return (
    <div
      className="sheet-overlay"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grabber" />
        <button className="sheet-close" onClick={onClose} aria-label={closeLabel}><X size={16} /></button>
        <div className="sheet-scroll">{children}</div>
      </div>
    </div>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Keeps Tab inside the dialog and puts focus back where it came from on close.
//
// docs/design/ACCESSIBILITY.md named this as the clearest outstanding task in the
// whole document set — both overlays closed on Escape but neither trapped focus, so
// Tab walked straight out of an open dialog into the page behind it. Implemented here
// rather than duplicated per overlay so every existing Modal call site (the two
// delete confirmations) gains it too.
function useFocusTrap(panelRef, active) {
  useEffect(() => {
    if (!active) return undefined;
    const panel = panelRef.current;
    if (!panel) return undefined;

    const previouslyFocused = document.activeElement;
    const first = panel.querySelector(FOCUSABLE);
    // The panel itself is the fallback target: a dialog with nothing focusable inside
    // still has to receive focus, or the screen reader stays on the page behind it.
    (first || panel).focus();

    const onKeyDown = (e) => {
      if (e.key !== "Tab") return;
      // Filtered on attributes rather than on offsetParent: the overlay this sits in is
      // position:fixed, and offsetParent is null for everything inside a fixed ancestor
      // — the check would have excluded every control in the dialog it was meant to
      // keep focus within.
      const items = Array.from(panel.querySelectorAll(FOCUSABLE))
        .filter((el) => !el.hasAttribute("hidden") && el.getAttribute("aria-hidden") !== "true");
      if (items.length === 0) { e.preventDefault(); return; }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstItem) { e.preventDefault(); lastItem.focus(); }
      else if (!e.shiftKey && document.activeElement === lastItem) { e.preventDefault(); firstItem.focus(); }
    };

    panel.addEventListener("keydown", onKeyDown);
    return () => {
      panel.removeEventListener("keydown", onKeyDown);
      // Restoring to a detached node does nothing and throws nothing; guarding on
      // isConnected keeps focus on <body> rather than silently nowhere.
      if (previouslyFocused && previouslyFocused.isConnected) previouslyFocused.focus();
    };
  }, [panelRef, active]);
}

export function Modal({ children, onClose, closeLabel = "Close", labelledBy, describedBy }) {
  const panelRef = useRef(null);
  useFocusTrap(panelRef, true);

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}
    >
      <div
        ref={panelRef}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label={closeLabel}><X size={15} /></button>
        {children}
      </div>
    </div>
  );
}
