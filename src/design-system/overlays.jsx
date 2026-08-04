// klussie design system — overlays. Drawer is the bottom-sheet pattern already used
// everywhere in the app (formerly a standalone `Sheet` component in App.jsx — same
// markup, same CSS classes, just given its real name and moved here so there's one
// source of truth). Modal is new: a centered dialog for short confirmations, where a
// full-height drawer would be more chrome than the moment calls for.
import { X } from "lucide-react";

export function Drawer({ children, onClose }) {
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grabber" />
        <button className="sheet-close" onClick={onClose}><X size={16} /></button>
        <div className="sheet-scroll">{children}</div>
      </div>
    </div>
  );
}

export function Modal({ children, onClose }) {
  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div className="modal-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close"><X size={15} /></button>
        {children}
      </div>
    </div>
  );
}
