// klussie design system — primitives. Small, generic building blocks with no
// domain knowledge of jobs/quotes/pros. See src/design-system/domain.jsx for the
// composed, klussie-specific components built on top of these.
//
// These reuse the CSS custom properties (--forest, --ink, etc.) already defined
// globally by the CSS template string in App.jsx — no separate token file needed,
// there's exactly one place those values live (Product Constitution, rule 8).
import { Star } from "lucide-react";

export function Avatar({ url, initials, size }) {
  return (
    <div className={"avatar" + (size ? ` avatar-${size}` : "")}>
      {url ? <img src={url} alt="" /> : initials}
    </div>
  );
}

export function Badge({ children, tone = "sage" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Rating({ value, size = 13 }) {
  return (
    <span className="stars" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          fill={i <= Math.round(value) ? "var(--amber)" : "none"}
          color={i <= Math.round(value) ? "var(--amber)" : "var(--line-strong)"}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

// variant: "primary" | "secondary". icon: an optional lucide-react component,
// rendered at a fixed size consistent with the rest of the app's buttons.
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
export function PriceTag({ amount, fmt, size = "md" }) {
  const formatted = fmt ? fmt(amount) : amount;
  return <span className={`price-tag price-tag-${size}`}>€{formatted}</span>;
}
