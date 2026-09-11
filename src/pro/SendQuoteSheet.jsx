// Quoting a lead. The price starts at the catalog's base for that service so the common
// case is one tap, and the message starts filled for the same reason — a professional
// mid-job shouldn't have to compose a paragraph to stay in the running.
import { useState } from "react";
import { Send } from "lucide-react";
import { useLang } from "../lib/lang";
import { Drawer } from "../design-system";
import { JobDetailsSummary, AiAnalysisSummary, RequestPhotosStrip } from "../requests";

// Fallback price when the lead names a service this client's catalog doesn't have — a
// figure the professional can edit, rather than an empty required field.
const FALLBACK_QUOTE_PRICE = 65;

export function SendQuoteSheet({ lead, onClose, onSubmit }) {
  const { t, serviceInfo, BASE_SERVICES } = useLang();
  const service = BASE_SERVICES.find((s) => s.id === lead.serviceId);
  // Found by code audit, 2026-09-11: kept as the raw input string, not `Number(...)` on
  // every keystroke -- every other price field in this codebase (QuoteFormSheet.jsx's
  // job-detail number fields, ServiceRecordEditorSheet.jsx's agreedPrice/internalCost/
  // supplierPrice) has both a `min="0"` on the input and a disabled submit until the
  // value is real; this one had neither. A pro clearing the field used to send `Number("")`
  // (0) and typing a bare "-" used to send `Number("-")` (NaN) straight to submit_quote()
  // -- no client-side floor, no guard at all, on the one number that flows into
  // billing.js's own platformFee()/netPayout() and the customer's own invoice.
  const [price, setPrice] = useState(String(service?.base || FALLBACK_QUOTE_PRICE));
  const [msg, setMsg] = useState(t.defaultProMessage);
  const priceValue = Number(price);
  const canSubmit = price.trim() !== "" && Number.isFinite(priceValue) && priceValue > 0;
  return (
    <Drawer onClose={onClose} closeLabel={t.closeBtn}>
      <div className="sheet-title">{t.sendQuoteTitle}</div>
      <div className="sheet-sub">{serviceInfo(lead.serviceId).name}</div>
      <JobDetailsSummary serviceId={lead.serviceId} fields={lead.answers.fields} />
      <AiAnalysisSummary aiAnalysis={lead.answers.aiAnalysis} />
      <RequestPhotosStrip requestId={lead.id} legacy />

      <label className="field-label">{t.yourPriceLabel}</label>
      <div className="search" style={{ marginBottom: 18 }}>
        <span style={{ color: "var(--ink-soft)", fontFamily: "var(--font-mono)" }}>€</span>
        <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>

      <label className="field-label">{t.messageToCustomerLabel}</label>
      <textarea className="textarea" rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} />

      <button className="btn-primary" disabled={!canSubmit} onClick={() => onSubmit(priceValue, msg)}><Send size={15} className="send-icon" /> {t.sendQuoteSubmit}</button>
    </Drawer>
  );
}
