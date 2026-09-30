// Business — Professional grouped-destinations landing (UX_TAB_SCOPE.md P3, 2026-09-28).
//
// Replaces the old direct MyBusinessPanel.jsx landing, which WAS this tab's entire
// content: an inventory panel that auto-created a property named "My Business" the moment
// the tab was opened. The spec's own "Observed" line names exactly this: "it is not
// currently a business-management home." Fixed by giving Business a real landing with
// grouped destinations, matching Customer/Professional's own Home/Today pattern instead of
// dropping a pro straight into one tool.
//
// FOUR REAL DESTINATIONS, NOT SIX — the spec's own P3 layout names six: Customers, Public
// profile/services, Automations, Billing, Team, Equipment/premises. Customers (a searchable
// relationship list) and Automations (quote follow-ups, recurring maintenance) have no real
// backend behind them yet — both stay explicitly deferred (this session's own status
// report), not silently dropped. Shipping either as a row here would be exactly the inert
// card the spec itself warns against ("do not ship a grid of inert feature cards"). The
// other four already have real, working functionality, moved here from Profile.jsx
// (Account) rather than rebuilt — see BusinessProfileSection.jsx/BusinessBillingSection.jsx/
// BusinessTeamSection.jsx for what moved and why.
//
// VIEWING THIS LANDING NEVER CREATES A PROPERTY — the spec's own explicit acceptance
// criterion. MyBusinessPanel.jsx's own auto-create-on-mount (see its own header) now only
// fires once a pro actually taps into Equipment & premises, since this landing itself never
// mounts MyBusinessPanel — only the "equipment" view below does.
//
// NO SLIDING SHEETS — a plain inline view switch (this app's own standing "no sliding
// Drawer/bottom-sheet menus" rule), the same pattern AiIntakeSheet.jsx's compose stage and
// the operator menu (AppNav.jsx) already use.
//
// PRO TYPE TOGGLE — UX_TAB_SCOPE.md P5, 2026-09-29: "business configuration to Business...
// avoid making a professional-type toggle look like a casual visual preference." Moved
// here verbatim from Profile.jsx (Account), with one real addition — proTypeExplainer —
// since the spec's own instruction is "explain them," not merely relocate them. Flexi vs.
// registered business is a real Belgian regulatory distinction (a flexi-job worker may not
// take certified-specialist work — isCategoryLocked() enforces this on the services chips
// in BusinessProfileSection.jsx), not a cosmetic segmented control.
import { useState } from "react";
import { ArrowLeft, ChevronRight, Sparkles, CreditCard, Users, Wrench } from "lucide-react";
import { useAuth } from "../lib/auth.jsx";
import { updateProProfile } from "../lib/pros";
import { MyBusinessPanel } from "./MyBusinessPanel.jsx";
import { BusinessProfileSection } from "./BusinessProfileSection.jsx";
import { BusinessBillingSection } from "./BusinessBillingSection.jsx";
import { BusinessTeamSection } from "./BusinessTeamSection.jsx";

const VIEWS = ["profile", "billing", "team", "equipment"];

export function BusinessApp({ t, fmtDate, proInfo, offeredServiceIds, onServicesChange, earnedGross }) {
  const [view, setView] = useState(null);
  const { user, proProfile, refreshProfile } = useAuth();
  const [proTypeError, setProTypeError] = useState("");

  // Found by code audit, 2026-09-11 (Profile.jsx, moved here 2026-09-29): refreshProfile()
  // used to sit inside the same try as the real write — a refresh-only failure right after
  // a genuinely successful switch showed proTypeSwitchFailed for a switch that had actually
  // gone through.
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

  if (view && VIEWS.includes(view)) {
    const titles = { profile: t.bizProfileTitle, billing: t.bizBillingTitle, team: t.bizTeamTitle, equipment: t.bizEquipmentTitle };
    return (
      <div className="pad">
        <button type="button" className="btn-secondary" style={{ width: "auto", padding: "8px 12px", marginBottom: 14 }} onClick={() => setView(null)}>
          <ArrowLeft size={13} aria-hidden="true" className="biz-back-icon" /> {t.backBtn}
        </button>
        <div className="h1" style={{ marginBottom: 14 }}>{titles[view]}</div>
        {view === "profile" && <BusinessProfileSection offeredServiceIds={offeredServiceIds} onServicesChange={onServicesChange} />}
        {view === "billing" && <BusinessBillingSection earnedGross={earnedGross} />}
        {view === "team" && <BusinessTeamSection />}
        {view === "equipment" && <MyBusinessPanel t={t} fmtDate={fmtDate} />}
      </div>
    );
  }

  return (
    <div className="pad">
      <div className="h1" style={{ marginBottom: 4 }}>{proInfo?.name || t.proFallbackName}</div>
      <div className="fineprint" style={{ justifyContent: "flex-start", marginBottom: 16 }}>{t.businessLandingSub}</div>

      <div className="section-title">{t.proTypeLabel}</div>
      <div className="segmented segmented-block">
        <button className={proProfile.pro_type === "flexi" ? "seg-on" : ""} onClick={() => setProType("flexi")}>{t.proTypeFlexi}</button>
        <button className={proProfile.pro_type === "business" ? "seg-on" : ""} onClick={() => setProType("business")}>{t.proTypeBusiness}</button>
      </div>
      {proTypeError && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start", marginTop: 6 }}>{proTypeError}</div>}
      <div className="fineprint" style={{ justifyContent: "flex-start", marginTop: 6, marginBottom: 18 }}>{t.proTypeExplainer}</div>

      <BusinessRow icon={Sparkles} label={t.bizProfileTitle} sub={t.bizProfileRowSub} onClick={() => setView("profile")} />
      <BusinessRow icon={CreditCard} label={t.bizBillingTitle} sub={t.bizBillingRowSub} onClick={() => setView("billing")} />
      <BusinessRow icon={Users} label={t.bizTeamTitle} sub={t.bizTeamRowSub} onClick={() => setView("team")} />
      <BusinessRow icon={Wrench} label={t.bizEquipmentTitle} sub={t.bizEquipmentRowSub} onClick={() => setView("equipment")} />
    </div>
  );
}

function BusinessRow({ icon: Icon, label, sub, onClick }) {
  return (
    <button type="button" className="sidebar-nav-item" style={{ height: "auto", padding: "10px 12px", marginBottom: 6 }} onClick={onClick}>
      <span className="tab-icon-wrap"><Icon size={17} /></span>
      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, minWidth: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink)" }}>{label}</span>
        <span style={{ fontSize: 11, color: "var(--ink-soft)", fontWeight: 400 }}>{sub}</span>
      </span>
      <ChevronRight size={15} aria-hidden="true" className="biz-row-chevron" style={{ marginInlineStart: "auto", color: "var(--ink-soft)", flexShrink: 0 }} />
    </button>
  );
}
