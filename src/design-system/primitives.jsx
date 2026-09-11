// klussie design system — primitives. Small, generic building blocks with no
// domain knowledge of jobs/quotes/pros. See src/design-system/domain.jsx for the
// composed, klussie-specific components built on top of these.
//
// These reuse the CSS custom properties (--forest, --ink, etc.) already defined
// globally by the CSS template string in App.jsx — no separate token file needed,
// there's exactly one place those values live (Product Constitution, rule 8).
import { Star } from "lucide-react";

// Both branches are decorative: the photo has empty alt, and the initials are a visual
// shorthand for a name that is always rendered next to it. Without aria-hidden a screen
// reader announces "PP" and then "Peter Painter" — found during Epic 03's WP11 audit,
// where the initials were being read into the unfold's live region.
export function Avatar({ url, initials, size }) {
  return (
    <div className={"avatar" + (size ? ` avatar-${size}` : "")} aria-hidden="true">
      {url ? <img src={url} alt="" /> : initials}
    </div>
  );
}

export function Badge({ children, tone = "sage" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

// Found by code audit, 2026-09-11: aria-label was a hardcoded English template string
// -- not one of any caller's own t.* keys -- in every one of this codebase's own ten
// call sites (RequestDetailSheet, ProDashboard, ProJobs, Profile, ProPublicProfileSheet,
// myHomeParts, ServiceSheet, and domain.jsx's own ServiceCard/TrustBadge), the exact
// "reachable-but-announced-in-the-wrong-language" gap ReviewSheet.jsx's own star-picker
// had and this same pass already fixed. `label` follows this design system's own
// established slot convention (TrustBadge's scoreLabel, ServiceCard's certifiedLabel) --
// primitives.jsx has no lang context of its own, callers pass their own real, translated
// t.ratingLabel (interpolated with the value) instead. The English literal stays only as
// a last-resort default for a caller that forgets to pass one, matching Drawer's own
// closeLabel="Close" convention -- never expected to fire against a real call site.
export function Rating({ value, size = 13, label }) {
  return (
    <span className="stars" role="img" aria-label={label ?? `${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        // --amber-dark, not --amber: the aria-label above already carries the rating
        // as real text, but the filled stars are still a real non-text UI component for
        // a sighted low-vision user, so the 3:1 floor still applies -- #E8A33D only
        // reaches ~2.16:1 against a white/paper card. See ACCESSIBILITY.md.
        <Star
          key={i}
          size={size}
          fill={i <= Math.round(value) ? "var(--amber-dark)" : "none"}
          color={i <= Math.round(value) ? "var(--amber-dark)" : "var(--line-strong)"}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

// variant: "primary" | "secondary". icon: an optional lucide-react component,
// rendered at a fixed size consistent with the rest of the app's buttons.
//
// COMPONENT_LIBRARY.md flagged icon-only usage (icon with no children) as "not checked
// for a required label" — checked, 2026-09-11: every real call site in this codebase
// passes real text as children alongside its icon (RequestDetailSheet.jsx,
// ProJobDetailSheet.jsx, both icon={MessageCircle}), so no icon-only instance actually
// exists today. This component has no aria-label fallback of its own, though — an
// icon-only Button (icon set, children omitted) added later would silently ship with no
// accessible name, the exact class of gap this whole file's own comments elsewhere warn
// about. Pass a real aria-label if that ever becomes a real call site.
export function Button({ variant = "primary", icon: Icon, iconSize = 15, children, className = "", ...props }) {
  const base = variant === "primary" ? "btn-primary" : "btn-secondary";
  return (
    <button className={`${base} ${className}`.trim()} {...props}>
      {Icon && <Icon size={iconSize} />} {children}
    </button>
  );
}

// A generic bordered/rounded/padded container — the base every domain card
// (ServiceCard, JobCard, QuoteCard) builds on. Renders a <button> when onClick is
// given (so it's keyboard/focus accessible the same way the rest of the app's
// clickable cards already are), a <div> otherwise.
export function Card({ children, onClick, className = "", ...props }) {
  const classes = `ds-card ${className}`.trim();
  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick} {...props}>
        {children}
      </button>
    );
  }
  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}

// The €-prefixed, tabular-mono price display used throughout quotes, invoices, and
// budgets. `fmt` is the same number-formatting function useLang() already exposes
// (locale-aware thousands separators) — passed in rather than imported, since
// PriceTag is a presentation-only primitive with no context dependency of its own.
//
// Always exactly two decimals: money, never a bare toLocaleString()'s dropped trailing
// zero (a 25.2 VAT line rendering "€25,2" instead of "€25,20" — every real caller of
// this component is a quote, fee, payout, or budget figure, never a count or rating).
const MONEY_FORMAT_OPTIONS = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

export function PriceTag({ amount, fmt, size = "md" }) {
  const formatted = fmt ? fmt(amount, MONEY_FORMAT_OPTIONS) : amount;
  return <span className={`price-tag price-tag-${size}`}>€{formatted}</span>;
}
