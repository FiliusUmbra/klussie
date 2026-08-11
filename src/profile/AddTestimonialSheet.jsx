// A professional adding a testimonial from their own past work. Client name is optional,
// the quote is not — and everywhere these render, they carry an explicit "shared by the
// professional, not verified by klussie" note, because an unverified testimonial
// presented as a review would be a trust claim klussie hasn't earned.
import { useState } from "react";
import { useLang } from "../lib/lang";
import { Drawer } from "../design-system";
import { addTestimonial } from "../lib/testimonials";

export function AddTestimonialSheet({ proId, onClose, onAdded }) {
  const { t } = useLang();
  const [clientName, setClientName] = useState("");
  const [quoteText, setQuoteText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!quoteText.trim()) return;
    setError("");
    setBusy(true);
    try {
      await addTestimonial({ proId, clientName, quoteText });
      await onAdded();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer onClose={onClose}>
      <div className="sheet-title">{t.addTestimonialBtn}</div>

      <label className="field-label">{t.clientNameLabel}</label>
      <div className="search" style={{ marginBottom: 14 }}>
        <input value={clientName} onChange={(e) => setClientName(e.target.value)} />
      </div>

      <label className="field-label">{t.testimonialTextLabel}</label>
      <textarea className="textarea" rows={3} value={quoteText} onChange={(e) => setQuoteText(e.target.value)} />

      {error && <div className="fineprint" style={{ color: "#b3432f" }}>{error}</div>}
      <button className="btn-primary" disabled={busy} onClick={submit}>{t.addTestimonialBtn}</button>
    </Drawer>
  );
}
