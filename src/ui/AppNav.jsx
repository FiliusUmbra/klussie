// The shared tabbed-app layout — UX redesign, 2026-09-28. Replaces the old pattern every
// composition root (CustomerApp/ProApp/OperatorApp) used to hand-roll for itself
// (`<div className="view"><div className="content">{tabs}</div><BottomNav .../></div>`):
// one real content area, a mobile bottom tab bar OR a desktop sidebar rendered from the
// SAME items array, so a selected-state or icon change never has to be made twice.
//
// TWO VARIANTS, NOT ONE GENERIC SHAPE — SIX DESTINATIONS DO NOT FIT A BOTTOM BAR
//
// "tabbar" (Customer/Pro's five public destinations): mobile bottom tab bar, desktop
// sidebar. "menu" (Operator's six): desktop sidebar, same as tabbar — but no bottom bar
// at all on mobile; six equal-width columns fail the 44px touch-target floor and clip
// labels in several real locales long before five do. Mobile falls back to a compact
// header row naming the current destination plus a button opening a plain, centered
// Modal list of the other five — not a bottom sheet (this codebase's own standing "no
// sliding Drawer/bottom-sheet menus" rule), and not a second bottom bar.
import { useState } from "react";
import { Menu } from "lucide-react";
import { Modal } from "../design-system";

export function AppNav({ tab, setTab, items, variant = "tabbar", children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const current = items.find((it) => it.id === tab);

  return (
    <>
      <nav className="app-sidebar" aria-label="Primary">
        {items.map((it) => (
          <button
            key={it.id}
            className={"sidebar-nav-item" + (tab === it.id ? " sidebar-nav-item-on" : "")}
            aria-current={tab === it.id ? "page" : undefined}
            onClick={() => setTab(it.id)}
          >
            <span className="tab-icon-wrap"><it.icon size={17} /></span>
            {it.label}
            {!!it.badge && <span className="tab-badge">{it.badge}</span>}
          </button>
        ))}
      </nav>

      <div className="view">
        {variant === "menu" && (
          <div className="op-menu-trigger-row">
            <button type="button" className="op-menu-trigger" onClick={() => setMenuOpen(true)}>
              <Menu size={15} /> {current?.label}
            </button>
          </div>
        )}

        <div className="content">{children}</div>

        {variant === "tabbar" && (
          <div className="tabbar">
            {items.map((it) => (
              <button key={it.id} className={"tab" + (tab === it.id ? " tab-on" : "")} onClick={() => setTab(it.id)}>
                <span className="tab-icon-wrap"><it.icon size={19} />{!!it.badge && <span className="tab-badge">{it.badge}</span>}</span>
                {it.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {variant === "menu" && menuOpen && (
        <Modal onClose={() => setMenuOpen(false)} closeLabel="Close" labelledBy="op-menu-title">
          <div id="op-menu-title" className="sheet-title">Menu</div>
          <div className="op-menu-list">
            {items.map((it) => (
              <button
                key={it.id}
                className={"op-menu-item" + (tab === it.id ? " op-menu-item-on" : "")}
                aria-current={tab === it.id ? "page" : undefined}
                onClick={() => { setTab(it.id); setMenuOpen(false); }}
              >
                <it.icon size={17} /> {it.label}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
