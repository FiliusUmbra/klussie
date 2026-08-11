// The demo invoice for a booked job. Says so in its own fine print — it is not a legally
// valid document, and klussie has no payments integration behind it yet.
//
// The VAT and total come from src/lib/billing.js: a tax figure computed inline in a
// render function is the kind of thing that quietly disagrees with itself once a second
// screen needs it.
import { useLang } from "../lib/lang";
import { Drawer } from "../design-system";
import { invoiceTotals } from "../lib/billing.js";

export function InvoiceSheet({ request, quote, onClose }) {
  const { t, fmt, serviceInfo } = useLang();
  const info = serviceInfo(request.serviceId);
  const pro = quote.pro;
  const { vat, total } = invoiceTotals(quote.price);
  return (
    <Drawer onClose={onClose}>
      <div className="sheet-title">{t.invoiceTitle}</div>
      <div className="invoice-box">
        <div className="invoice-row"><span>{t.invoiceRef}</span><span>KLS-{request.id.toUpperCase()}</span></div>
        <div className="invoice-row"><span>{t.invoiceSupplier}</span><span>{pro.name}</span></div>
        <div className="invoice-row"><span>{t.invoiceCustomer}</span><span>{t.profileYou}</span></div>
        <div className="invoice-row"><span>{t.invoiceService}</span><span>{info.name}</span></div>
        <div className="ticket-divider" />
        {/* Literal escape sequences preserved verbatim — see the note in ServiceSheet.jsx. */}
        <div className="invoice-row"><span>{t.invoiceAmount}</span><span>\u20ac{fmt(quote.price)}</span></div>
        <div className="invoice-row"><span>{t.invoiceVat}</span><span>\u20ac{fmt(vat)}</span></div>
        <div className="invoice-row invoice-total"><span>{t.invoiceTotal}</span><span>\u20ac{fmt(total)}</span></div>
      </div>
      <div className="fineprint" style={{ marginTop: 12 }}>{t.invoiceNote}</div>
    </Drawer>
  );
}
