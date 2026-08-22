// The professional's own profile and settings: standing, availability, registration type,
// the flexi-job earnings tracker, offered services, portfolio, testimonials, and boost.
//
// The rules it renders live in src/lib — earnings and the tax-free ceiling in billing.js,
// boost state and category locking in proStatus.js. This file decides layout and nothing
// about eligibility.
//
// WorkspaceSwitcher and LanguageSwitcher both live here too, mirroring CustomerProfile.jsx's
// own reasoning — AppShell's topbar (where they also render) is display:none below 460px,
// every real phone. Every real pro holds two live memberships (personal + professional)
// and had no way to reach the personal one on an actual device before this; changing
// language was equally unreachable.
import { useState, useEffect, useRef } from "react";
import { Camera, LogOut, ThumbsUp, HelpCircle } from "lucide-react";
import { useLang } from "../lib/lang";
import { useAuth } from "../lib/auth.jsx";
import { Avatar, Badge, Button, QuoteCard, TrustBadge, Modal } from "../design-system";
import { WorkspaceSwitcher } from "../shell/WorkspaceSwitcher.jsx";
import { LanguageSwitcher } from "../shell/LanguageSwitcher.jsx";
import { updateProServices, updateProProfile, boostProfile, trustScore } from "../lib/pros";
import { uploadPortfolioImage, addPortfolioItem, fetchPortfolioItems } from "../lib/portfolio";
import { fetchTestimonials, deleteTestimonial } from "../lib/testimonials";
import { EditProfileSheet } from "../profile/EditProfileSheet.jsx";
import { PortfolioItemSheet } from "../profile/PortfolioItemSheet.jsx";
import { AddTestimonialSheet } from "../profile/AddTestimonialSheet.jsx";
import { FLEXI_TAX_FREE_THRESHOLD, BOOST_WEEKLY_PRICE, flexiProgressPct } from "../lib/billing.js";
import { isBoosted, isCategoryLocked, PRO_TYPE_FLEXI } from "../lib/proStatus.js";

export function ProProfile({ proInfo, completedCount, earnedGross, offeredServiceIds, onServicesChange, onProfileSaved, onPauseToggled, onReplayTour }) {
  const { t, fmt, catName, serviceInfo, proBadgeLabel, CATS, BASE_SERVICES } = useLang();
  const { user, proProfile, refreshProfile, signOut } = useAuth();
  const [selected, setSelected] = useState(offeredServiceIds);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [portfolioItems, setPortfolioItems] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [editingPortfolioItem, setEditingPortfolioItem] = useState(null);
  const [testimonials, setTestimonials] = useState(null);
  const [addTestimonialOpen, setAddTestimonialOpen] = useState(false);
  const [confirmDeleteTestimonialId, setConfirmDeleteTestimonialId] = useState(null);
  const portfolioFileRef = useRef(null);
  const flexiPct = flexiProgressPct(earnedGross);
  const boosted = isBoosted(proProfile);

  const refreshPortfolio = () => fetchPortfolioItems(user.id).then(setPortfolioItems);
  const refreshTestimonials = () => fetchTestimonials(user.id).then(setTestimonials);

  useEffect(() => {
    refreshPortfolio();
    refreshTestimonials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

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

  return (
    <div className="pad">
      <div className="profile-head"><Avatar url={proInfo.avatarUrl} initials={proInfo.initials} size="lg" /><div><div className="h1" style={{ fontSize: 19 }}>{proInfo.name}</div><TrustBadge rating={proInfo.rating} reviewCount={proInfo.reviews} fmt={fmt} /></div></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
        <WorkspaceSwitcher t={t} />
        <LanguageSwitcher light />
      </div>
      {proProfile.bio && <p className="sheet-blurb">{proProfile.bio}</p>}
      <div className="stat-row">
        <div className="stat"><div className="stat-num">{completedCount}</div><div className="stat-label">{t.proJobsDone}</div></div>
        <div className="stat"><div className="stat-num">{proBadgeLabel(proInfo.badgeTier) || "—"}</div><div className="stat-label">{t.proStatus}</div></div>
        <div className="stat"><div className="stat-num">{trustScore(proInfo)}</div><div className="stat-label">{t.trustScoreLabel}</div></div>
      </div>

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
      {/* Mirrors CustomerProfile.jsx's own "Hulp & uitleg → Rondleiding opnieuw
          bekijken" — same section title, same reasoning: a tour seen only once is a
          tour nobody can return to when they actually need it. */}
      {onReplayTour && (
        <>
          <div className="section-title" style={{ marginTop: 18 }}>{t.helpSectionTitle}</div>
          <button className="btn-secondary" onClick={onReplayTour}>
            <HelpCircle size={13} /> {t.helpReplayTour}
          </button>
        </>
      )}
      <button className="btn-secondary" style={{ marginTop: 10 }} onClick={() => setEditOpen(true)}>{t.editProfileBtn}</button>
      <button className="btn-secondary" style={{ marginTop: 8 }} onClick={signOut}><LogOut size={13} /> {t.authSignOut}</button>
      {editOpen && <EditProfileSheet onClose={() => setEditOpen(false)} onSaved={onProfileSaved} />}
      {editingPortfolioItem && (
        <PortfolioItemSheet item={editingPortfolioItem} onClose={() => setEditingPortfolioItem(null)} onChanged={refreshPortfolio} />
      )}
      {addTestimonialOpen && (
        <AddTestimonialSheet proId={user.id} onClose={() => setAddTestimonialOpen(false)} onAdded={refreshTestimonials} />
      )}
    </div>
  );
}
