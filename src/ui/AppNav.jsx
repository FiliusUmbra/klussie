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
import { Fragment, useContext, useState } from "react";
import { Menu } from "lucide-react";
import { Modal } from "../design-system";
import { LangContext } from "../lib/lang";

export function AppNav({ tab, setTab, items, variant = "tabbar", fab, children }) {
  // Optional on purpose: the landmark name is translated when a language context exists and
  // falls back to English when it does not (OperatorApp's tests, and any bare render).
  const lang = useContext(LangContext);
  const [menuOpen, setMenuOpen] = useState(false);
  const current = items.find((it) => it.id === tab);
  // Splits the flat items around the FAB rather than appending it — a trailing FAB
  // reads as a sixth tab, not a break from the row. floor(), not ceil(): for an odd
  // count (five, today's real case) this puts one more item after the FAB than before
  // it, closer to centered than the reverse (2-and-3 beats 3-and-2 for an off-center
  // circle people's thumbs actually have to find).
  const fabIndex = fab ? Math.floor(items.length / 2) : -1;

  return (
    <>
      <nav className="app-sidebar" aria-label={lang?.t?.navPrimaryAria || "Main navigation"}>
        {fab && (
          <button type="button" className="sidebar-fab" onClick={fab.onClick}>
            <fab.icon size={17} strokeWidth={2.2} aria-hidden="true" /> {fab.label}
          </button>
        )}
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
            {items.map((it, i) => (
              <Fragment key={it.id}>
                {i === fabIndex && (
                  <div className="tabbar-fab-slot">
                    <button type="button" className="tabbar-fab" aria-label={fab.label} onClick={fab.onClick}>
                      <fab.icon size={22} strokeWidth={2.2} />
                    </button>
                  </div>
                )}
                <button className={"tab" + (tab === it.id ? " tab-on" : "")} onClick={() => setTab(it.id)}>
                  <span className="tab-icon-wrap"><it.icon size={19} />{!!it.badge && <span className="tab-badge">{it.badge}</span>}</span>
                  {it.label}
                </button>
              </Fragment>
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
