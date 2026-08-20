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
  const [price, setPrice] = useState(service?.base || FALLBACK_QUOTE_PRICE);
  const [msg, setMsg] = useState(t.defaultProMessage);
  return (
    <Drawer onClose={onClose}>
      <div className="sheet-title">{t.sendQuoteTitle}</div>
      <div className="sheet-sub">{serviceInfo(lead.serviceId).name}</div>
      <JobDetailsSummary serviceId={lead.serviceId} fields={lead.answers.fields} />
      <AiAnalysisSummary aiAnalysis={lead.answers.aiAnalysis} />
      <RequestPhotosStrip requestId={lead.id} legacy />

      <label className="field-label">{t.yourPriceLabel}</label>
      <div className="search" style={{ marginBottom: 18 }}>
        {/* Literal escape sequence preserved verbatim — see the note in ServiceSheet.jsx. */}
        <span style={{ color: "var(--ink-soft)", fontFamily: "var(--font-mono)" }}>\u20ac</span>
        <input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
      </div>

      <label className="field-label">{t.messageToCustomerLabel}</label>
      <textarea className="textarea" rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} />

      <button className="btn-primary" onClick={() => onSubmit(price, msg)}><Send size={15} /> {t.sendQuoteSubmit}</button>
    </Drawer>
  );
}
