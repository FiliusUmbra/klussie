// The unified "themselves" screen — UNIFIED_PROFILE_DESIGN.md, implementing
// UNIFIED_PRODUCT_IA_REVIEW.md §2/§9.3: one screen owned by subject, not by backend role,
// revealing more sections as capability grows rather than three separate files that happen
// to look similar because one was built by copying the other.
//
// Replaces src/customer/CustomerProfile.jsx and src/pro/ProProfile.jsx — folded in near
// verbatim (same markup classes, same copy, same behavior; see the design note's own §4 for
// what this deliberately does not change). `variant` selects which capability-gated
// sections render; the shared sections (identity header, switchers, help/replay-tour, edit
// profile, sign out) render once regardless of variant.
//
// Operator is NOT a third variant here — its Profile tab is genuinely the unified shape's
// own minimum (no avatar, no stats, no edit-profile), not a third audience needing the same
// capability-gated sections this file composes. See ProfileIdentityHeader.jsx's own header
// for why forcing it through here would change Operator's actual visual output. Operator
// reuses WorkspaceSwitcher and SignOutButton directly instead (OperatorApp.jsx).
import { useState, useEffect, useRef } from "react";
import { Camera, HelpCircle, Briefcase, ThumbsUp } from "lucide-react";
import { useLang } from "../lib/lang";
import { useAuth } from "../lib/auth.jsx";
import { Badge, Button, QuoteCard, Rating, TrustBadge, Modal } from "../design-system";
import { WorkspaceSwitcher } from "../shell/WorkspaceSwitcher.jsx";
import { LanguageSwitcher } from "../shell/LanguageSwitcher.jsx";
import { ProfileIdentityHeader } from "./ProfileIdentityHeader.jsx";
import { StatRow } from "./StatRow.jsx";
import { SignOutButton } from "./SignOutButton.jsx";
import { EditProfileSheet } from "./EditProfileSheet.jsx";
import { PortfolioItemSheet } from "./PortfolioItemSheet.jsx";
import { AddTestimonialSheet } from "./AddTestimonialSheet.jsx";
import { completedCount, reviewedRequests } from "../lib/requestStatus.js";
import { updateProServices, updateProProfile, boostProfile, trustScore } from "../lib/pros";
import { uploadPortfolioImage, addPortfolioItem, fetchPortfolioItems } from "../lib/portfolio";
import { fetchTestimonials, deleteTestimonial } from "../lib/testimonials";
import { FLEXI_TAX_FREE_THRESHOLD, BOOST_WEEKLY_PRICE, flexiProgressPct } from "../lib/billing.js";
import { isBoosted, isCategoryLocked, PRO_TYPE_FLEXI } from "../lib/proStatus.js";

export function Profile({
  variant,
  onReplayTour,
  // customer-only
  requests,
  onBecomePro,
  // pro-only
  proInfo,
  completedCount: proCompletedCount,
  earnedGross,
  offeredServiceIds,
  onServicesChange,
  onProfileSaved,
  onPauseToggled,
}) {
  const { t, fmt, catName, serviceInfo, proBadgeLabel, CATS, BASE_SERVICES } = useLang();
  const { user, profile, proProfile, refreshProfile, signOut } = useAuth();
  const [editOpen, setEditOpen] = useState(false);

  // Pro-only local state — declared unconditionally (hooks must run every render), but the
  // fetch effect below no-ops for a customer mount. `variant` is constant for the lifetime
  // of any one mount (CustomerApp always passes "customer", ProApp always passes "pro"), so
  // this never toggles mid-life.
  const [selected, setSelected] = useState(offeredServiceIds);
  const [saving, setSaving] = useState(false);
  const [portfolioItems, setPortfolioItems] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [editingPortfolioItem, setEditingPortfolioItem] = useState(null);
  const [testimonials, setTestimonials] = useState(null);
  const [addTestimonialOpen, setAddTestimonialOpen] = useState(false);
  const [confirmDeleteTestimonialId, setConfirmDeleteTestimonialId] = useState(null);
  const portfolioFileRef = useRef(null);

  const refreshPortfolio = () => fetchPortfolioItems(user.id).then(setPortfolioItems);
  const refreshTestimonials = () => fetchTestimonials(user.id).then(setTestimonials);

  useEffect(() => {
    if (variant !== "pro") return;
    refreshPortfolio();
    refreshTestimonials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, user.id]);

  // Only ever invoked from the variant === "pro" JSX below — safe to define unconditionally
  // (never called, so never evaluated) rather than branching on variant here too, same
  // reasoning as the fetch effect above.
  const toggle = (id) => setSelected((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const handlePortfolioUpload = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const { url, path } = await uploadPortfolioImage(user.id, file);
      await addPortfolioItem({ proId: user.id, imageUrl: url, storagePath: path });
      await refreshPortfolio();
    } finally {
      setUploadingPhoto(false);
    }
  };
  const removeTestimonial = async (id) => {
    await deleteTestimonial(id);
    await refreshTestimonials();
    setConfirmDeleteTestimonialId(null);
  };
  const saveServices = async () => {
    setSaving(true);
    await updateProServices(user.id, selected);
    onServicesChange(selected);
    setSaving(false);
  };
  const setProType = async (proType) => {
    await updateProProfile(user.id, { pro_type: proType });
    await refreshProfile();
  };
  const boost = async () => {
    await boostProfile(user.id);
    await refreshProfile();
  };
  const togglePaused = async () => {
    await updateProProfile(user.id, { paused: !proProfile.paused });
    await refreshProfile();
    if (onPauseToggled) await onPauseToggled();
  };

  const displayName = profile?.full_name || t.profileYou;
  const flexiPct = variant === "pro" ? flexiProgressPct(earnedGross) : 0;
  const boosted = variant === "pro" ? isBoosted(proProfile) : false;

  return (
    <div className="pad">
      {variant === "customer" ? (
        <ProfileIdentityHeader
          avatarUrl={profile?.avatar_url}
          initials={displayName[0]}
          name={displayName}
          subtitle={<div className="ticket-sub">{user.email}</div>}
        />
      ) : (
        <ProfileIdentityHeader
          avatarUrl={proInfo.avatarUrl}
          initials={proInfo.initials}
          name={proInfo.name}
          subtitle={<TrustBadge rating={proInfo.rating} reviewCount={proInfo.reviews} fmt={fmt} />}
        />
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
        <WorkspaceSwitcher t={t} />
        <LanguageSwitcher light />
      </div>

      {variant === "pro" && proProfile.bio && <p className="sheet-blurb">{proProfile.bio}</p>}

      {variant === "customer" ? (
        <StatRow items={[
          { key: "sent", value: requests.length, label: t.requestsSent },
          { key: "done", value: completedCount(requests), label: t.jobsCompleted },
        ]} />
      ) : (
        <StatRow items={[
          { key: "done", value: proCompletedCount, label: t.proJobsDone },
          { key: "status", value: proBadgeLabel(proInfo.badgeTier) || "—", label: t.proStatus },
          { key: "trust", value: trustScore(proInfo), label: t.trustScoreLabel },
        ]} />
      )}

      {variant === "customer" && (
        <>
          <div className="section-title">{t.yourReviews}</div>
          {reviewedRequests(requests).length === 0 && <div className="empty-block"><p>{t.noReviewsYet}</p></div>}
          {reviewedRequests(requests).map((r) => (
            <QuoteCard key={r.id}><div className="quote-name">{serviceInfo(r.serviceId).name}</div><Rating value={r.review.stars} size={12} /><p className="quote-msg">"{r.review.text}"</p></QuoteCard>
          ))}
          {/* The real, reachable "become a pro" entry point (UNIFIED_PRODUCT_IA_REVIEW.md
              §5). Only for someone who hasn't already (proProfile null); a real dual-role
              person viewing their Personal Workspace already has one and needs no invitation. */}
          {onBecomePro && !proProfile && (
            <div className="empty-block" style={{ marginTop: 18 }}>
              <Briefcase size={22} color="var(--ink-soft)" />
              <p>{t.becomeProPrompt}</p>
              <button className="btn-primary" onClick={onBecomePro}>{t.becomeProBtn}</button>
            </div>
          )}
        </>
      )}

      {variant === "pro" && (
        <>
          <button className="btn-secondary" style={{ marginBottom: 14 }} onClick={togglePaused}>
            {proProfile.paused ? t.resumeProfileBtn : t.pauseProfileBtn}
          </button>

          <div className="section-title">{t.proTypeLabel}</div>
          <div className="segmented segmented-block">
            <button className={proProfile.pro_type === "flexi" ? "seg-on" : ""} onClick={() => setProType("flexi")}>{t.proTypeFlexi}</button>
            <button className={proProfile.pro_type === "business" ? "seg-on" : ""} onClick={() => setProType("business")}>{t.proTypeBusiness}</button>
          </div>

          {proProfile.pro_type === PRO_TYPE_FLEXI && (
            <div className="flexi-box">
              <div className="ticket-title" style={{ fontSize: 13.5, marginBottom: 8 }}>{t.flexiTrackerTitle}</div>
              <div className="flexi-bar"><div className="flexi-bar-fill" style={{ width: `${flexiPct}%` }} /></div>
              {/* Literal escape sequences preserved verbatim — see the note in ServiceSheet.jsx. */}
              <div className="ticket-sub" style={{ marginTop: 6 }}>\u20ac{fmt(Math.round(earnedGross))} {t.flexiUsedOf} \u20ac{fmt(FLEXI_TAX_FREE_THRESHOLD)}</div>
              <div className="fineprint" style={{ marginTop: 8, justifyContent: "flex-start", textAlign: "start" }}>{t.flexiThresholdNote}</div>
            </div>
          )}

          <div className="section-title">{t.proServicesTitle}</div>
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
          <button className="btn-secondary" style={{ marginBottom: 14 }} disabled={saving} onClick={saveServices}>{t.saveServicesBtn}</button>

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
          {portfolioItems && portfolioItems.length === 0 && <div className="fineprint" style={{ justifyContent: "flex-start", marginBottom: 14 }}>{t.noPortfolioYet}</div>}

          <div className="section-title">{t.testimonialsTitle}</div>
          <div className="fineprint" style={{ marginBottom: 10, justifyContent: "flex-start" }}>{t.unverifiedTestimonialNote}</div>
          {testimonials && testimonials.length === 0 && <div className="empty-block" style={{ marginBottom: 14 }}><p>{t.noTestimonialsYet}</p></div>}
          {(testimonials || []).map((tst) => (
            <QuoteCard key={tst.id}>
              {tst.client_name && <div className="quote-name">{tst.client_name}</div>}
              <p className="quote-msg">"{tst.quote_text}"</p>
              <button className="btn-secondary" onClick={() => setConfirmDeleteTestimonialId(tst.id)}>{t.deleteBtn}</button>
            </QuoteCard>
          ))}
          {confirmDeleteTestimonialId && (
            <Modal onClose={() => setConfirmDeleteTestimonialId(null)}>
              <p style={{ marginTop: 8 }}>{t.confirmDeleteMsg}</p>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <Button variant="secondary" onClick={() => setConfirmDeleteTestimonialId(null)}>{t.cancelBtn}</Button>
                <Button variant="primary" onClick={() => removeTestimonial(confirmDeleteTestimonialId)}>{t.deleteBtn}</Button>
              </div>
            </Modal>
          )}
          <button className="btn-secondary" style={{ marginBottom: 14 }} onClick={() => setAddTestimonialOpen(true)}>{t.addTestimonialBtn}</button>

          <div className="section-title">{t.boostTitle}</div>
          <div className="quote-card">
            <p className="sheet-blurb" style={{ margin: "0 0 10px" }}>{t.boostDesc}</p>
            {boosted ? (
              <Badge tone="amber">{t.boostActive}</Badge>
            ) : (
              <button className="btn-primary" onClick={boost}>{t.boostBtn} \u20ac{BOOST_WEEKLY_PRICE}</button>
            )}
          </div>

          <div className="fineprint" style={{ marginTop: 14 }}><ThumbsUp size={12} /> {t.proFineprint}</div>
        </>
      )}

      {/* Profiel → Hulp & uitleg → Rondleiding opnieuw bekijken. A tour that can only ever
          be seen once is a tour nobody can go back to when they finally need it. Same block,
          same strings, for both variants — folded from CustomerProfile.jsx/ProProfile.jsx's
          own identical copies. */}
      {onReplayTour && (
        <>
          <div className="section-title" style={{ marginTop: 18 }}>{t.helpSectionTitle}</div>
          <button className="btn-secondary" onClick={onReplayTour}>
            <HelpCircle size={13} /> {t.helpReplayTour}
          </button>
        </>
      )}
      <button className="btn-secondary" style={{ marginTop: variant === "pro" ? 10 : 14 }} onClick={() => setEditOpen(true)}>{t.editProfileBtn}</button>
      <SignOutButton onClick={signOut} label={t.authSignOut} style={{ marginTop: 8 }} />

      {editOpen && (
        <EditProfileSheet onClose={() => setEditOpen(false)} onSaved={variant === "pro" ? onProfileSaved : undefined} />
      )}
      {variant === "pro" && editingPortfolioItem && (
        <PortfolioItemSheet item={editingPortfolioItem} onClose={() => setEditingPortfolioItem(null)} onChanged={refreshPortfolio} />
      )}
      {variant === "pro" && addTestimonialOpen && (
        <AddTestimonialSheet proId={user.id} onClose={() => setAddTestimonialOpen(false)} onAdded={refreshTestimonials} />
      )}
    </div>
  );
}
