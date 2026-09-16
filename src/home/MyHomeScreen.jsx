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
import { useState } from "react";
import { SegmentedTabs, TabPanel } from "../design-system";
import { useLang } from "../lib/lang";
import { useAuth } from "../lib/auth.jsx";
import { MyHomePanel } from "./MyHomePanel.jsx";
import { MyItemsPanel } from "./MyItemsPanel.jsx";
import { useHomeContext } from "./useHomeContext.js";

const SECTIONS = [
  { id: "myHome", labelKey: "homeTabMyHome" },
  { id: "myItems", labelKey: "homeTabMyItems" },
];

const ID_PREFIX = "myhome";

export function MyHomeScreen({ requests = [], onOpenRequest, onReportProblem }) {
  const { t, dir, fmtDate, serviceInfo } = useLang();
  const { profile } = useAuth();
  const [section, setSection] = useState("myHome");

  const homeCtx = useHomeContext({ t, profile, requests });
  const openRequest = onOpenRequest || (() => {});
  const reportProblem = onReportProblem || (() => {});

  const tabs = SECTIONS.map((s) => ({ id: s.id, label: t[s.labelKey] }));

  return (
    <div className="home">
      <div className="home-body">
        <SegmentedTabs
          tabs={tabs}
          activeId={section}
          onChange={setSection}
          label={t.homeTabsLabel}
          idPrefix={ID_PREFIX}
          dir={dir}
        />

        <TabPanel id={`${ID_PREFIX}-panel-myHome`} tabId={`${ID_PREFIX}-tab-myHome`} active={section === "myHome"}>
          <MyHomePanel
            t={t}
            homeCtx={homeCtx}
            ownerId={profile?.id}
            requests={requests}
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
    </div>
  );
}
