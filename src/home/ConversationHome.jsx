// The authenticated customer's homepage.
//
// One surface, three sections, no new navigation. ADR-0007 made the conversational
// canvas the front door and ADR-0008 refused a new bottom-nav tab for the home
// operating surface — the segmented control below is how both hold at once: My Home
// and My Items are sections *of* the front door, not destinations beside it. The
// bottom nav's four items are untouched.
//
// Composition only. The greeting band, the trust-signal rules, today's priority, the
// intent sequence and the conversation state machine all live in hooks and lib
// modules; this file decides what sits where.
import { useEffect, useRef, useState } from "react";
import { SegmentedTabs, TabPanel, TrustStrip } from "../design-system";
import { useLang } from "../lib/lang";
import { useAuth } from "../lib/auth.jsx";
import { HomeHero } from "./HomeHero.jsx";
import { KlussiePanel } from "./KlussiePanel.jsx";
import { MyHomePanel } from "./MyHomePanel.jsx";
import { MyItemsPanel } from "./MyItemsPanel.jsx";
import { useHomeContext } from "./useHomeContext.js";
import { useConversation } from "./useConversation.js";

const SECTIONS = [
  { id: "klussie", labelKey: "homeTabKlussie" },
  { id: "myHome", labelKey: "homeTabMyHome" },
  { id: "myItems", labelKey: "homeTabMyItems" },
];

const ID_PREFIX = "home";

// Each section keeps its own scroll position, so switching to My Home and back doesn't
// dump the customer at the top of a conversation they were reading. The scroll owner is
// CustomerApp's `.content` region, above this component — hence the lookup rather than a
// ref we own. A missing container simply means no restoration, never a crash.
function useSectionScroll(rootRef, section) {
  const positions = useRef({});
  const previous = useRef(section);

  useEffect(() => {
    const container = rootRef.current?.closest(".content");
    if (!container) return;
    positions.current[previous.current] = container.scrollTop;
    container.scrollTop = positions.current[section] ?? 0;
    previous.current = section;
  }, [section, rootRef]);
}

export function ConversationHome({ onStart, requests = [], section = "klussie", onSectionChange, onOpenRequest }) {
  const { t, dir, fmt, fmtDate, serviceInfo, proBadgeLabel } = useLang();
  const { profile } = useAuth();
  const rootRef = useRef(null);
  const photoInputRef = useRef(null);
  const [uncontrolledSection, setUncontrolledSection] = useState("klussie");

  // Controlled when CustomerApp passes a handler (the tour needs to land somebody on
  // My Home), self-managed otherwise — which is what keeps this component renderable
  // on its own in tests.
  const activeSection = onSectionChange ? section : uncontrolledSection;
  const setSection = onSectionChange || setUncontrolledSection;

  useSectionScroll(rootRef, activeSection);

  const homeCtx = useHomeContext({ t, profile, requests });
  const conv = useConversation({ onStart });

  const tabs = SECTIONS.map((s) => ({ id: s.id, label: t[s.labelKey] }));
  const openRequest = onOpenRequest || (() => {});

  return (
    <div className="home" ref={rootRef}>
      <HomeHero greeting={homeCtx.greeting} question={t.homeQuestion} />

      <div className="home-body">
        <SegmentedTabs
          tabs={tabs}
          activeId={activeSection}
          onChange={setSection}
          label={t.homeTabsLabel}
          idPrefix={ID_PREFIX}
          dir={dir}
        />

        <TabPanel id={`${ID_PREFIX}-panel-klussie`} tabId={`${ID_PREFIX}-tab-klussie`} active={activeSection === "klussie"}>
          <KlussiePanel
            t={t}
            fmt={fmt}
            serviceInfo={serviceInfo}
            proBadgeLabel={proBadgeLabel}
            homeCtx={homeCtx}
            conv={conv}
            photoInputRef={photoInputRef}
            onOpenRequest={openRequest}
            onSetUpHome={() => setSection("myHome")}
          />
        </TabPanel>

        <TabPanel id={`${ID_PREFIX}-panel-myHome`} tabId={`${ID_PREFIX}-tab-myHome`} active={activeSection === "myHome"}>
          <MyHomePanel
            t={t}
            homeProfile={homeCtx.homeProfile}
            previousWork={homeCtx.previousWork}
            serviceInfo={serviceInfo}
            fmtDate={fmtDate}
            onReportProblem={() => setSection("klussie")}
            onOpenRequest={openRequest}
          />
        </TabPanel>

        <TabPanel id={`${ID_PREFIX}-panel-myItems`} tabId={`${ID_PREFIX}-tab-myItems`} active={activeSection === "myItems"}>
          <MyItemsPanel t={t} inventory={homeCtx.inventory} onReportProblem={() => setSection("klussie")} />
        </TabPanel>

        {/* capture="environment" opens the rear camera directly on mobile rather than a
            file browser. Kept mounted across sections so the ref is always live. */}
        <input ref={photoInputRef} type="file" accept="image/*" capture="environment" hidden onChange={conv.pickPhoto} />

        <TrustStrip items={homeCtx.trustItems} label={t.trustStripLabel} />
      </div>
    </div>
  );
}
