// My Home — its own bottom-nav destination (ADR-0033, 2026-09-15, supersedes ADR-0007/
// ADR-0008's "not a new tab"). Carries the segmented My Home / My Items control that used
// to live inside ConversationHome.jsx as two of its three sections; the third,
// conversational section stayed there.
//
// Resolves its own useHomeContext() rather than receiving one from a shared parent —
// CustomerApp.jsx mounts exactly one top-level tab body at a time (ConversationHome and
// this screen are siblings, never both mounted), so there is no tree to share a hook
// through. This does mean switching Home <-> My Home re-fetches the property twin on
// each mount, the same remount-refetch behavior Profile's own tab switch already has.
//
// SHARED PROPERTY HEADER — UX_TAB_SCOPE.md C4, 2026-09-29: "property name/address,
// property switcher, 'Add' menu... above all subsections so Items cannot lose visible
// property context." Real gap before this: PropertySwitcher.jsx used to render only
// inside MyHomePanel.jsx (Overview), so a customer on My Items had no property context
// at all, and — PropertySwitcher.jsx's own header even said so on purpose — "My Home has
// no creation entry point of its own." Both fixed here: the switcher (plus a name label
// for the single-property case, where the switcher itself renders nothing — its own
// header explains why) now sits above the segmented tabs, and Add property is reachable
// from here directly, with Profile.jsx (Account) now only a management shortcut back
// to this same list (its own header explains that half).
import { useState } from "react";
import { Plus, House, HelpCircle } from "lucide-react";
import { SegmentedTabs, TabPanel } from "../design-system";
import { useLang } from "../lib/lang";
import { useAuth } from "../lib/auth.jsx";
import { MyHomePanel } from "./MyHomePanel.jsx";
import { MyItemsPanel } from "./MyItemsPanel.jsx";
import { PropertySwitcher } from "./PropertySwitcher.jsx";
import { HomeStatRow } from "./HomeStatRow.jsx";
import { usePropertyPhoto } from "./usePropertyPhoto.js";
import { PageTour } from "../ui/PageTour.jsx";
import { usePageTour } from "../ui/usePageTour.js";
import { AddPropertySheet } from "../profile/AddPropertySheet.jsx";
import { useHomeContext } from "./useHomeContext.js";

const SECTIONS = [
  { id: "myHome", labelKey: "homeTabMyHome" },
  { id: "myItems", labelKey: "homeTabMyItems" },
];

const ID_PREFIX = "myhome";

// PageTour.jsx steps — the hero's real-data strip and the section switch.
const MYHOME_TOUR_STEPS = [
  { id: "myhome-hero", titleKey: "pageTourHomeStep1Title", bodyKey: "pageTourHomeStep1Body" },
  { id: "myhome-tabs", titleKey: "pageTourHomeStep2Title", bodyKey: "pageTourHomeStep2Body" },
];

export function MyHomeScreen({ requests = [], onOpenRequest, onReportProblem, activeSection, onSectionChange }) {
  const { t, dir, fmtDate, serviceInfo } = useLang();
  const { user, profile } = useAuth();
  // activeSection/onSectionChange come from CustomerApp.jsx's own destination/onNavigate
  // (App.jsx's <SignedInShell>, real URLs — customerNavigation.js's own `/app/home/items`)
  // when a caller wires real routing; every existing caller and test keeps its own local
  // section state exactly as before, the same optional-routing shape CustomerApp.jsx's
  // own tab state already has.
  const [localSection, setLocalSection] = useState("myHome");
  const section = activeSection || localSection;
  const setSection = (next) => { if (onSectionChange) onSectionChange(next); else setLocalSection(next); };
  const [addPropertyOpen, setAddPropertyOpen] = useState(false);

  const tour = usePageTour("myHome");
  const homeCtx = useHomeContext({ t, profile, requests });
  const { properties, activePropertyId, selectProperty, workspaceId, refreshItems } = homeCtx;
  const photoUrl = usePropertyPhoto(activePropertyId);
  const openRequest = onOpenRequest || (() => {});
  const reportProblem = onReportProblem || (() => {});

  const tabs = SECTIONS.map((s) => ({ id: s.id, label: t[s.labelKey] }));
  // Always a real heading, regardless of how many properties exist — the switcher
  // (below two properties, invisible by design; its own header explains why) is not a
  // substitute for one: a page needs a stable, announced title independent of whether a
  // <select> also happens to be showing the same name.
  const activeName = properties?.find((p) => p.id === activePropertyId)?.name;
  const activeCity = homeCtx.homeProfile?.property?.municipality;

  return (
    <div className="home">
      <div className="home-body">
        {/* The drafted My Home hero (visual-refresh direction, 2026-10-02). The gradient
            cover stands in for the property photo — the Street View hero is deferred — and
            the stat row is the same real-data strip Today's card shows. */}
        <div className="myhome-header" data-tour="myhome-hero">
          <div className="myhome-hero-cover" aria-hidden="true">
            {photoUrl ? <img className="myhome-hero-photo" src={photoUrl} alt="" /> : <House size={56} strokeWidth={1.3} />}
          </div>
          <div className="myhome-hero-body">
            {activeName && <h1 className="myhome-header-name">{activeName}</h1>}
            {activeCity && <p className="myhome-hero-city">{activeCity}</p>}
            <HomeStatRow items={homeCtx.items} homeProfile={homeCtx.homeProfile} maintenance={homeCtx.maintenance} requests={requests} />
            <div className="myhome-hero-actions">
              <PropertySwitcher t={t} properties={properties} activePropertyId={activePropertyId} onSelect={selectProperty} />
              <button type="button" className="myhome-header-add" onClick={() => setAddPropertyOpen(true)}>
                <Plus size={13} aria-hidden="true" /> {t.addPropertyBtn}
              </button>
              <button type="button" className="icon-btn" aria-label={t.helpReplayTour} onClick={tour.replay}><HelpCircle size={18} aria-hidden="true" /></button>
            </div>
          </div>
        </div>

        <div data-tour="myhome-tabs">
        <SegmentedTabs
          tabs={tabs}
          activeId={section}
          onChange={setSection}
          label={t.homeTabsLabel}
          idPrefix={ID_PREFIX}
          dir={dir}
        />
        </div>

        <TabPanel id={`${ID_PREFIX}-panel-myHome`} tabId={`${ID_PREFIX}-tab-myHome`} active={section === "myHome"}>
          <MyHomePanel
            t={t}
            homeCtx={homeCtx}
            ownerId={profile?.id}
            serviceInfo={serviceInfo}
            fmtDate={fmtDate}
            onReportProblem={reportProblem}
            onOpenRequest={openRequest}
          />
        </TabPanel>

        <TabPanel id={`${ID_PREFIX}-panel-myItems`} tabId={`${ID_PREFIX}-tab-myItems`} active={section === "myItems"}>
          <MyItemsPanel
            t={t}
            ownerId={profile?.id}
            items={homeCtx.items}
            itemsError={homeCtx.itemsError}
            onRefresh={homeCtx.refreshItems}
            fmtDate={fmtDate}
            rooms={homeCtx.homeProfile?.rooms}
            documents={homeCtx.homeProfile?.documents}
            maintenance={homeCtx.maintenance}
            propertyId={homeCtx.propertyId}
            workspaceId={homeCtx.workspaceId}
            // Home Builder slice: rooms live prominently in My Home instead (see
            // MyHomePanel.jsx's own HomeBuilderSection) — kept here, defaulted on, for
            // ProApp.jsx's own "My Business" reuse (MyBusinessPanel.jsx), which has no
            // My Home equivalent.
            showRoomsSection={false}
            // Item Detail slice — "Report a problem" hands back to the conversation.
            // Now a real bottom-nav tab switch (CustomerApp.jsx), not an internal section
            // change — ADR-0007's "hands back to the conversation" still holds; only the
            // mechanism changed.
            onReportProblem={reportProblem}
          />
        </TabPanel>
      </div>

      {tour.open && <PageTour steps={MYHOME_TOUR_STEPS} onFinish={tour.finish} />}

      {addPropertyOpen && (
        <AddPropertySheet
          t={t}
          workspaceId={workspaceId}
          actorRef={user.id}
          onClose={() => setAddPropertyOpen(false)}
          onSaved={refreshItems}
        />
      )}
    </div>
  );
}
