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
import { Camera, HelpCircle, Briefcase, ThumbsUp, Users } from "lucide-react";
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
import { JoinBusinessSheet } from "./JoinBusinessSheet.jsx";
import { completedCount, reviewedRequests } from "../lib/requestStatus.js";
import { updateProServices, updateProProfile, boostProfile, trustScore } from "../lib/pros";
import { uploadPortfolioImage, addPortfolioItem, fetchPortfolioItems } from "../lib/portfolio";
import { fetchTestimonials, deleteTestimonial } from "../lib/testimonials";
import { fetchJoinRequests, decideJoinRequest } from "../lib/workspaceJoin.js";
import { FLEXI_TAX_FREE_THRESHOLD, BOOST_WEEKLY_PRICE, flexiProgressPct } from "../lib/billing.js";
import { isBoosted, isCategoryLocked, PRO_TYPE_FLEXI } from "../lib/proStatus.js";
import { interpolate } from "../lib/homeStrings.js";

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
  const { user, profile, proProfile, activeWorkspace, refreshProfile, signOut } = useAuth();
  const [editOpen, setEditOpen] = useState(false);

  // Pro-only local state — declared unconditionally (hooks must run every render), but the
  // fetch effect below no-ops for a customer mount. `variant` is constant for the lifetime
  // of any one mount (CustomerApp always passes "customer", ProApp always passes "pro"), so
  // this never toggles mid-life.
  const [selected, setSelected] = useState(offeredServiceIds);
  const [saving, setSaving] = useState(false);
  const [proTypeError, setProTypeError] = useState("");
  const [portfolioItems, setPortfolioItems] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [editingPortfolioItem, setEditingPortfolioItem] = useState(null);
  const [testimonials, setTestimonials] = useState(null);
  const [addTestimonialOpen, setAddTestimonialOpen] = useState(false);
  const [confirmDeleteTestimonialId, setConfirmDeleteTestimonialId] = useState(null);
  const [portfolioError, setPortfolioError] = useState("");
  const [testimonialError, setTestimonialError] = useState("");
  const [testimonialBusy, setTestimonialBusy] = useState(false);
  const [saveServicesError, setSaveServicesError] = useState("");
  const [boosting, setBoosting] = useState(false);
  const [boostError, setBoostError] = useState("");
  const [pausing, setPausing] = useState(false);
  const [pauseError, setPauseError] = useState("");
  // null while unresolved, [] once resolved with nothing pending — see the fetch effect
  // below for why a permission refusal (not the workspace's own owner/admin) also
  // resolves to [], the same "silently show nothing" shape membership.join.approve's own
  // deny-by-default already gives every other real caller.
  const [joinRequests, setJoinRequests] = useState(null);
  const [decidingRequestId, setDecidingRequestId] = useState(null);
  const [joinRequestsError, setJoinRequestsError] = useState("");
  const [joinBusinessOpen, setJoinBusinessOpen] = useState(false);
  const portfolioFileRef = useRef(null);

  const refreshPortfolio = () => fetchPortfolioItems(user.id).then(setPortfolioItems);
  const refreshTestimonials = () => fetchTestimonials(user.id).then(setTestimonials);

  useEffect(() => {
    if (variant !== "pro") return;
    // Found by code audit: fetchPortfolioItems()/fetchTestimonials() both throw on a
    // real Postgres error, and neither call here had a catch of its own -- a genuine
    // unhandled promise rejection on every failure. Harmless for what actually renders
    // (both lists already fall back to [] when their state is still null --
    // "(portfolioItems || []).map(...)" below -- so a failed load looked identical to a
    // genuinely empty portfolio/testimonials list either way), but a real defect
    // regardless, the same shape RequestPhotosStrip.jsx had and was fixed the same way:
    // resolve to an empty list on failure rather than leaving the rejection unhandled.
    // Deliberately not baked into refreshPortfolio()/refreshTestimonials() themselves --
    // handlePortfolioUpload() and removeTestimonial() below both await those inside their
    // own try/catch and need a real rejection to reach it, the same reasoning
    // CustomerApp.jsx's identical refresh()/loadRequests() split already established.
    refreshPortfolio().catch(() => setPortfolioItems([]));
    refreshTestimonials().catch(() => setTestimonials([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, user.id]);

  const refreshJoinRequests = () => fetchJoinRequests(activeWorkspace?.workspace_id).then(setJoinRequests);

  // Pro Workspace remarks, 2026-09-12 (Theme C) — api.list_join_requests() itself refuses
  // (throws) a caller without membership.join.approve on this workspace (ADR-0027,
  // case-fixed 0219); every real professional workspace today has exactly one member, its
  // owner, so that refusal is not yet reachable live, but the moment a second, non-owner
  // membership exists (this same slice's own approval path creates one), this must fail
  // closed, not open — resolving to [] on ANY failure, permission refusal included, is
  // deliberately indistinguishable from "nothing pending": an employee with no approval
  // rights sees no section at all, never an error banner for a capability they don't have.
  useEffect(() => {
    if (variant !== "pro" || !activeWorkspace?.workspace_id) return;
    refreshJoinRequests().catch(() => setJoinRequests([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, activeWorkspace?.workspace_id]);

  // Approve/decline each carry their own busy state (decidingRequestId), not a single
  // shared `saving` flag — two real pending requests must be independently actionable,
  // never both disabled because one is mid-flight.
  const decideRequest = async (requestId, decision) => {
    setDecidingRequestId(requestId);
    setJoinRequestsError("");
    try {
      await decideJoinRequest(requestId, decision, user.id);
    } catch {
      setJoinRequestsError(t.joinRequestDecideFailed);
      setDecidingRequestId(null);
      return;
    }
    try {
      await refreshJoinRequests();
    } catch {
      // Best-effort; the decision itself already succeeded regardless.
    } finally {
      setDecidingRequestId(null);
    }
  };

  // Only ever invoked from the variant === "pro" JSX below — safe to define unconditionally
  // (never called, so never evaluated) rather than branching on variant here too, same
  // reasoning as the fetch effect above.
  const toggle = (id) => setSelected((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  // Found by code audit: try/finally but no catch -- uploadingPhoto always reset
  // correctly (the finally already did that much), but a real failure (Storage, RLS,
  // network) was never shown at all, an unhandled rejection with nothing on screen.
  //
  // Found by code audit, 2026-09-11: refreshPortfolio() used to sit inside this same
  // try too -- the same bug shape fixed repeatedly elsewhere today (see e.g. ProApp.jsx's
  // sendQuote() for the fullest write-up): a refresh-only failure right after a genuinely
  // successful upload+addPortfolioItem() showed portfolioUploadFailed for an upload that
  // had actually gone through. refreshPortfolio() is now best-effort once the real
  // writes are confirmed.
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
  // Found by code audit: no try/catch at all -- a real refusal left the confirm modal's
  // own Delete button re-clickable with no explanation, and never closed the modal
  // (setConfirmDeleteTestimonialId(null) only ran on success), an unhandled rejection.
  //
  // Found by code audit, 2026-09-11: refreshTestimonials() used to sit inside this same
  // try, with the modal-closing setConfirmDeleteTestimonialId(null) gated behind it
  // succeeding too -- so a refresh-only failure right after a genuinely successful
  // deleteTestimonial() both showed testimonialDeleteFailed for a deletion that had
  // already gone through AND kept the confirm modal open on a testimonial that no longer
  // existed. The modal now closes as soon as the real deletion is confirmed, and
  // refreshTestimonials() is best-effort from there.
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
  // Found by code audit: no try/catch, and critically no finally either -- a real
  // refusal left `saving` stuck at true forever (setSaving(false) sat after the await
  // with nothing to run it on rejection), the button permanently disabled with no way
  // back in short of leaving and re-opening this screen. The exact "no dead end" shape
  // this codebase has already found and fixed repeatedly elsewhere (PortfolioItemSheet.jsx's
  // own identical gap, ServiceRecordSummary.jsx's own identical gap, among others) --
  // just not yet swept in this file, on the pro's own core "which services do I offer" setting.
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
  // Found live during a UX review, 2026-09-06: switching to "business" here failed with
  // zero visible feedback whenever business_name/vat_number were still unset — the real,
  // reproducible case for any pro who has never filled them in, since public.pro_profiles'
  // own business_requires_details check constraint (0001) refuses the row otherwise.
  // updateProProfile()'s own .update() is a sparse PATCH (only pro_type here), so this
  // never clobbers business_name/vat_number saved separately through EditProfileSheet.jsx
  // -- fill those in first (now reachable there regardless of the caller's current
  // pro_type, closing the chicken-and-egg gap this same review found), then this succeeds.
  // Found by code audit, 2026-09-11: refreshProfile() used to sit inside this same try
  // -- the same bug shape fixed repeatedly elsewhere today (see e.g. ProApp.jsx's
  // sendQuote() for the fullest write-up): a refresh-only failure right after a
  // genuinely successful switch fell into the catch below and showed proTypeSwitchFailed
  // for a switch that had actually gone through. refreshProfile() is now best-effort
  // once the real write is confirmed.
  const setProType = async (proType) => {
    setProTypeError("");
    try {
      await updateProProfile(user.id, { pro_type: proType });
    } catch (err) {
      setProTypeError(
        err.message?.includes("business_requires_details") ? t.proTypeBusinessRequiresDetails : t.proTypeSwitchFailed
      );
      return;
    }
    try {
      await refreshProfile();
    } catch {
      // Best-effort; the pro_type switch itself already succeeded regardless.
    }
  };
  // Found by code audit, 2026-09-11: refreshProfile() used to sit inside the same try as
  // boostProfile() itself -- worse than most instances of this same bug shape (see e.g.
  // ProApp.jsx's sendQuote() for the fullest write-up), since Boost is a genuine paid
  // action (€{BOOST_WEEKLY_PRICE}/week): a false boostFailed for a purchase that had
  // actually gone through could invite a pro to tap Boost again, risking a second charge
  // for the same week. refreshProfile() is now best-effort once the purchase itself is
  // confirmed.
  const boost = async () => {
    setBoosting(true);
    setBoostError("");
    try {
      await boostProfile(user.id);
    } catch {
      setBoostError(t.boostFailed);
      setBoosting(false);
      return;
    }
    try {
      await refreshProfile();
    } catch {
      // Best-effort; the boost itself was already purchased regardless.
    } finally {
      setBoosting(false);
    }
  };
  // Found by code audit, 2026-09-11: refreshProfile() and onPauseToggled() both used to
  // sit inside the same try as updateProProfile() itself -- worse than most instances of
  // this same bug shape, since togglePaused() is a TOGGLE, not an idempotent write: a
  // pro who saw the false togglePausedFailed and, believing their first tap never took
  // effect, tapped Pause/Resume again would flip the real, already-applied change
  // straight back -- silently leaving them un-paused (still receiving new leads) while
  // believing the opposite. Both refreshes are now best-effort once the real toggle is
  // confirmed.
  const togglePaused = async () => {
    setPausing(true);
    setPauseError("");
    try {
      await updateProProfile(user.id, { paused: !proProfile.paused });
    } catch {
      setPauseError(t.togglePausedFailed);
      setPausing(false);
      return;
    }
    try {
      await refreshProfile();
    } catch {
      // Best-effort; the pause toggle itself already succeeded regardless.
    }
    try {
      if (onPauseToggled) await onPauseToggled();
    } catch {
      // Best-effort; same as refreshProfile() above.
    }
    setPausing(false);
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
          name={proInfo.name || t.proFallbackName}
          subtitle={<TrustBadge rating={proInfo.rating} reviewCount={proInfo.reviews} fmt={fmt} ratingLabel={interpolate(t.ratingLabel, { value: proInfo.rating })} />}
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
            <QuoteCard key={r.id}><div className="quote-name">{serviceInfo(r.serviceId).name}</div><Rating value={r.review.stars} size={12} label={interpolate(t.ratingLabel, { value: r.review.stars })} /><p className="quote-msg">"{r.review.text}"</p></QuoteCard>
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
          <button className="btn-secondary" style={{ marginBottom: pauseError ? 6 : 14 }} disabled={pausing} onClick={togglePaused}>
            {proProfile.paused ? t.resumeProfileBtn : t.pauseProfileBtn}
          </button>
          {pauseError && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start", marginBottom: 14 }}>{pauseError}</div>}

          <div className="section-title">{t.proTypeLabel}</div>
          <div className="segmented segmented-block">
            <button className={proProfile.pro_type === "flexi" ? "seg-on" : ""} onClick={() => setProType("flexi")}>{t.proTypeFlexi}</button>
            <button className={proProfile.pro_type === "business" ? "seg-on" : ""} onClick={() => setProType("business")}>{t.proTypeBusiness}</button>
          </div>
          {proTypeError && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start", marginTop: 6 }}>{proTypeError}</div>}

          {proProfile.pro_type === PRO_TYPE_FLEXI && (
            <div className="flexi-box">
              <div className="ticket-title" style={{ fontSize: 13.5, marginBottom: 8 }}>{t.flexiTrackerTitle}</div>
              <div className="flexi-bar"><div className="flexi-bar-fill" style={{ width: `${flexiPct}%` }} /></div>
              <div className="ticket-sub" style={{ marginTop: 6 }}>€{fmt(Math.round(earnedGross))} {t.flexiUsedOf} €{fmt(FLEXI_TAX_FREE_THRESHOLD)}</div>
              <div className="fineprint" style={{ marginTop: 8, justifyContent: "flex-start", textAlign: "start" }}>{t.flexiThresholdNote}</div>
            </div>
          )}

          {/* Pro Workspace remarks, 2026-09-12 (Theme C) — absent entirely rather than an
              empty "no requests" line, matching this file's own restraint elsewhere
              (portfolio/testimonials show their own explicit empty state because a
              customer chose to look at that section; a join-request queue nobody has
              asked to see yet is not worth a permanent row for zero rows). */}
          {joinRequests && joinRequests.length > 0 && (
            <>
              <div className="section-title">{t.joinRequestsTitle}</div>
              {joinRequestsError && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start", marginBottom: 10 }}>{joinRequestsError}</div>}
              {joinRequests.map((req) => (
                <QuoteCard key={req.request_id}>
                  <div className="quote-name">{req.full_name || t.counterpartFallbackName}</div>
                  {req.message && <p className="quote-msg">"{req.message}"</p>}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <Button variant="secondary" disabled={decidingRequestId === req.request_id} onClick={() => decideRequest(req.request_id, "declined")}>
                      {t.joinRequestDeclineBtn}
                    </Button>
                    <Button variant="primary" disabled={decidingRequestId === req.request_id} onClick={() => decideRequest(req.request_id, "approved")}>
                      {t.joinRequestApproveBtn}
                    </Button>
                  </div>
                </QuoteCard>
              ))}
            </>
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
          <button className="btn-secondary" style={{ marginBottom: saveServicesError ? 6 : 14 }} disabled={saving} onClick={saveServices}>{t.saveServicesBtn}</button>
          {saveServicesError && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start", marginBottom: 14 }}>{saveServicesError}</div>}

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

          <div className="section-title">{t.boostTitle}</div>
          <div className="quote-card">
            <p className="sheet-blurb" style={{ margin: "0 0 10px" }}>{t.boostDesc}</p>
            {boosted ? (
              <Badge tone="amber">{t.boostActive}</Badge>
            ) : (
              <>
                <button className="btn-primary" disabled={boosting} onClick={boost}>{t.boostBtn} €{BOOST_WEEKLY_PRICE}</button>
                {boostError && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start", marginTop: 8 }}>{boostError}</div>}
              </>
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
      {/* Pro Workspace remarks, 2026-09-12 (Theme C) — available to either variant: a
          customer taking on staff work for someone else's business, or a pro joining a
          second one, are both real, not gated behind already being a pro oneself. */}
      <button className="btn-secondary" style={{ marginTop: 8 }} onClick={() => setJoinBusinessOpen(true)}>
        <Users size={13} aria-hidden="true" /> {t.joinBusinessBtn}
      </button>
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
      {joinBusinessOpen && (
        <JoinBusinessSheet t={t} actorRef={user.id} onClose={() => setJoinBusinessOpen(false)} />
      )}
    </div>
  );
}
