// Business > Public profile & services — UX_TAB_SCOPE.md P3, 2026-09-28. Moved here
// verbatim from Profile.jsx's own pro variant (same state, same handlers, same markup):
// "move services, portfolio, testimonials, public profile preview... out of personal
// Account into the appropriate business section." None of this is a personal-account
// setting — it's the professional's own public-facing business identity, which is what
// this whole destination is for.
//
// NO BOOST — UX_TAB_SCOPE.md P5's own explicit instruction: "Remove paid promotion from
// the new model." boostProfile() never charged anyone or touched any commerce/billing
// schema — it was a client-side updateProProfile({ boosted_until }) write with a fake "€9"
// label next to it and no Stripe call, no ledger row, nothing isBoosted() feeds anywhere
// customer-facing (confirmed: proStatus.js's own isBoosted() and pro_profiles.boosted_until
// had exactly one real caller each, both here). Displaying a price for a charge that never
// happened is the opposite of "trust beats growth" (Product Constitution Rule 9) and of the
// monetization brief's own two sanctioned revenue streams (acquisition fee, Klussie Pro) —
// this was a third, uncoordinated one outside that model. The `boosted_until` DB column
// itself is left alone (P5's own "requires explicit migration treatment, not silent
// deletion" for any real data) — only the purchase UI and its now-dead call sites are gone.
import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { useLang } from "../lib/lang";
import { useAuth } from "../lib/auth.jsx";
import { Button, QuoteCard, Modal } from "../design-system";
import { PortfolioItemSheet } from "../profile/PortfolioItemSheet.jsx";
import { AddTestimonialSheet } from "../profile/AddTestimonialSheet.jsx";
import { SuggestServiceSheet } from "../profile/SuggestServiceSheet.jsx";
import { ProPublicProfileSheet } from "../profile/ProPublicProfileSheet.jsx";
import { updateProServices } from "../lib/pros";
import { uploadPortfolioImage, addPortfolioItem, fetchPortfolioItems } from "../lib/portfolio";
import { fetchTestimonials, deleteTestimonial } from "../lib/testimonials";
import { isCategoryLocked } from "../lib/proStatus.js";

export function BusinessProfileSection({ offeredServiceIds, onServicesChange }) {
  const { t, catName, serviceInfo, CATS, BASE_SERVICES, langCode } = useLang();
  const { user, proProfile, activeWorkspace } = useAuth();
  const [selected, setSelected] = useState(offeredServiceIds);
  const [saving, setSaving] = useState(false);
  const [saveServicesError, setSaveServicesError] = useState("");
  const [suggestServiceOpen, setSuggestServiceOpen] = useState(false);
  const [portfolioItems, setPortfolioItems] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [editingPortfolioItem, setEditingPortfolioItem] = useState(null);
  const [portfolioError, setPortfolioError] = useState("");
  const [testimonials, setTestimonials] = useState(null);
  const [addTestimonialOpen, setAddTestimonialOpen] = useState(false);
  const [confirmDeleteTestimonialId, setConfirmDeleteTestimonialId] = useState(null);
  const [testimonialError, setTestimonialError] = useState("");
  const [testimonialBusy, setTestimonialBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const portfolioFileRef = useRef(null);

  const refreshPortfolio = () => fetchPortfolioItems(user.id).then(setPortfolioItems);
  const refreshTestimonials = () => fetchTestimonials(user.id).then(setTestimonials);

  useEffect(() => {
    // Same "resolve to an empty list on a real fetch failure rather than an unhandled
    // rejection" fix this had in Profile.jsx — see that file's own former header for the
    // full write-up (both calls throw on a real Postgres error).
    refreshPortfolio().catch(() => setPortfolioItems([]));
    refreshTestimonials().catch(() => setTestimonials([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const toggle = (id) => setSelected((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const saveServices = async () => {
    setSaving(true);
    setSaveServicesError("");
    try {
      await updateProServices(user.id, selected, activeWorkspace?.workspace_id);
      onServicesChange(selected);
    } catch {
      setSaveServicesError(t.saveServicesFailed);
    } finally {
      setSaving(false);
    }
  };

  const onServiceMatched = async (matchedServiceId) => {
    const next = selected.includes(matchedServiceId) ? selected : [...selected, matchedServiceId];
    setSelected(next);
    await updateProServices(user.id, next, activeWorkspace?.workspace_id);
    onServicesChange(next);
  };

  const handlePortfolioUpload = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setUploadingPhoto(true);
    setPortfolioError("");
    try {
      const { url, path } = await uploadPortfolioImage(user.id, file);
      await addPortfolioItem({ proId: user.id, imageUrl: url, storagePath: path });
    } catch {
      setPortfolioError(t.portfolioUploadFailed);
      setUploadingPhoto(false);
      return;
    }
    try {
      await refreshPortfolio();
    } catch {
      // Best-effort; the upload itself already succeeded regardless.
    } finally {
      setUploadingPhoto(false);
    }
  };

  const removeTestimonial = async (id) => {
    setTestimonialBusy(true);
    setTestimonialError("");
    try {
      await deleteTestimonial(id);
    } catch {
      setTestimonialError(t.testimonialDeleteFailed);
      setTestimonialBusy(false);
      return;
    }
    setConfirmDeleteTestimonialId(null);
    try {
      await refreshTestimonials();
    } catch {
      // Best-effort; the deletion itself already succeeded regardless.
    } finally {
      setTestimonialBusy(false);
    }
  };

  return (
    <>
      {/* UX_TAB_SCOPE.md P5, 2026-09-29 — "add clearly labelled shortcuts to... public-profile
          preview." ProPublicProfileSheet.jsx already existed (customer-side: opened from a
          quote or booked job) but a pro had no way to see their own, the same real gap the
          spec names. Reused as-is, not rebuilt — its own header explains the deliberate
          verified-before-unverified section order this shows back to the pro. */}
      <button className="btn-secondary" style={{ marginBottom: 18 }} onClick={() => setPreviewOpen(true)}>{t.previewPublicProfileBtn}</button>

      <div className="section-title" style={{ marginTop: 0 }}>{t.proServicesTitle}</div>
      {CATS.map((c) => {
        const services = BASE_SERVICES.filter((s) => s.cat === c.id);
        if (services.length === 0) return null;
        const locked = isCategoryLocked(c.id, proProfile.pro_type);
        return (
          <div key={c.id} style={{ marginBottom: 10 }}>
            <div className="ticket-sub" style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}><c.icon size={12} /> {catName(c.id)}</div>
            <div className="chiprow" style={{ paddingBottom: 4 }}>
              {services.map((s) => (
                <button key={s.id} className={"chip" + (selected.includes(s.id) && !locked ? " chip-on" : "") + (locked ? " chip-locked" : "")} disabled={locked} onClick={() => !locked && toggle(s.id)}>
                  {serviceInfo(s.id).name}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <button className="btn-secondary" style={{ marginBottom: saveServicesError ? 6 : 8 }} disabled={saving} onClick={saveServices}>{t.saveServicesBtn}</button>
      {saveServicesError && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start", marginBottom: 8 }}>{saveServicesError}</div>}
      <button className="btn-secondary" style={{ marginBottom: 8 }} onClick={() => setSuggestServiceOpen(true)}>{t.suggestServiceEntryBtn}</button>
      <div className="fineprint" style={{ marginBottom: 14, justifyContent: "flex-start" }}>{t.proFineprint}</div>

      <div className="section-title">{t.portfolioTitle}</div>
      <div className="portfolio-grid">
        {(portfolioItems || []).map((item) => (
          <button key={item.id} type="button" className="portfolio-thumb" onClick={() => setEditingPortfolioItem(item)}>
            <img src={item.image_url} alt={item.caption || ""} />
          </button>
        ))}
        <button type="button" className="portfolio-thumb portfolio-add" disabled={uploadingPhoto} onClick={() => portfolioFileRef.current.click()}>
          <Camera size={20} />
        </button>
        <input ref={portfolioFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePortfolioUpload} />
      </div>
      {portfolioError && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start", marginBottom: 8 }}>{portfolioError}</div>}
      {portfolioItems && portfolioItems.length === 0 && <div className="fineprint" style={{ justifyContent: "flex-start", marginBottom: 14 }}>{t.noPortfolioYet}</div>}

      <div className="section-title">{t.testimonialsTitle}</div>
      <div className="fineprint" style={{ marginBottom: 10, justifyContent: "flex-start" }}>{t.unverifiedTestimonialNote}</div>
      {testimonials && testimonials.length === 0 && <div className="empty-block" style={{ marginBottom: 14 }}><p>{t.noTestimonialsYet}</p></div>}
      {(testimonials || []).map((tst) => (
        <QuoteCard key={tst.id}>
          {tst.client_name && <div className="quote-name">{tst.client_name}</div>}
          <p className="quote-msg">"{tst.quote_text}"</p>
          <button className="btn-secondary" onClick={() => { setTestimonialError(""); setConfirmDeleteTestimonialId(tst.id); }}>{t.deleteBtn}</button>
        </QuoteCard>
      ))}
      {confirmDeleteTestimonialId && (
        <Modal onClose={() => setConfirmDeleteTestimonialId(null)} closeLabel={t.closeBtn}>
          <p style={{ marginTop: 8 }}>{t.confirmDeleteMsg}</p>
          {testimonialError && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start", marginTop: 8 }}>{testimonialError}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <Button variant="secondary" disabled={testimonialBusy} onClick={() => setConfirmDeleteTestimonialId(null)}>{t.cancelBtn}</Button>
            <Button variant="primary" disabled={testimonialBusy} onClick={() => removeTestimonial(confirmDeleteTestimonialId)}>{t.deleteBtn}</Button>
          </div>
        </Modal>
      )}
      <button className="btn-secondary" style={{ marginBottom: 14 }} onClick={() => setAddTestimonialOpen(true)}>{t.addTestimonialBtn}</button>

      {editingPortfolioItem && (
        <PortfolioItemSheet item={editingPortfolioItem} onClose={() => setEditingPortfolioItem(null)} onChanged={refreshPortfolio} />
      )}
      {addTestimonialOpen && (
        <AddTestimonialSheet proId={user.id} onClose={() => setAddTestimonialOpen(false)} onAdded={refreshTestimonials} />
      )}
      {suggestServiceOpen && (
        <SuggestServiceSheet
          t={t}
          workspaceId={activeWorkspace?.workspace_id}
          locale={langCode}
          onClose={() => setSuggestServiceOpen(false)}
          onMatched={onServiceMatched}
        />
      )}
      {previewOpen && (
        <ProPublicProfileSheet proId={user.id} onClose={() => setPreviewOpen(false)} />
      )}
    </>
  );
}
