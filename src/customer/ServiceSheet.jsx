// One service, before any professional has been involved: what it covers, how many
// professionals offer it, and the price band a customer can expect. The band comes from
// src/lib/billing.js rather than being multiplied out here — it's a claim about price,
// which is exactly the kind of thing that belongs in one auditable place.
import { ChevronRight } from "lucide-react";
import { useLang } from "../lib/lang";
import { Badge, Rating, PriceTag, Drawer } from "../design-system";
import { typicalPriceRange } from "../lib/billing.js";

export function ServiceSheet({ service, onClose, onRequest }) {
  const { t, fmt, serviceInfo, CATS } = useLang();
  const info = serviceInfo(service.id);
  const Icon = CATS.find((c) => c.id === service.cat).icon;
  const { low, high } = typicalPriceRange(service.base);
  return (
    <Drawer onClose={onClose}>
      <div className="sheet-icon-lg"><Icon size={22} color="var(--forest)" /></div>
      <div className="sheet-title">{info.name}</div>
      {service.certifiedOnly && <Badge tone="forest">{t.certifiedOnlyBadge}</Badge>}
      {/* The literal \uXXXX sequences below are a known defect carried over unchanged,
          not typos: JSX text content doesn't interpret backslash escapes the way a JS
          string does, so these render as the escape sequence itself. Listed under
          ENGINEERING_STANDARDS.md's known follow-up — fixing it changes what a customer
          reads, so it belongs in a copy pass, not in a refactor whose contract is
          identical behaviour. */}
      <div className="sheet-sub">{fmt(service.pros)} {t.prosSuffix} \u00b7 <Rating value={service.rating} size={12} /> {service.rating} ({fmt(service.reviews)})</div>
      <p className="sheet-blurb">{info.blurb}</p>
      <div className="price-hint">{t.typicalPrice} <b><PriceTag amount={low} fmt={fmt} /> \u2013 <PriceTag amount={high} fmt={fmt} /></b></div>
      <button className="btn-primary" onClick={onRequest}>{service.mode === "book" ? t.serviceBookNow : t.serviceGetQuotes} <ChevronRight size={16} /></button>
    </Drawer>
  );
}
