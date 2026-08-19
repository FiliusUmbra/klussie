// The professional side of the app: dashboard, jobs, messages, profile — and the
// subscriptions that keep leads and quote updates live.
//
// Lead delivery is category-scoped rather than service-scoped: a professional subscribes
// to the categories their offered services fall into (src/lib/proStatus.js), so the
// subscription only has to be rebuilt when that set actually changes, not on every
// re-render. `categoryKey` is what makes that comparison cheap.
import { useState, useEffect } from "react";
import { User, ClipboardList, MessageCircle, Briefcase, Building2 } from "lucide-react";
import { useLang } from "../lib/lang";
import { useAuth } from "../lib/auth.jsx";
import {
  fetchProLeads,
  fetchProJobs,
  sendQuote as sendQuoteApi,
  subscribeToProLeads,
  subscribeToProQuoteUpdates,
} from "../lib/requests";
import { fetchProServices, fetchPublicProInfo } from "../lib/pros";
import { fetchConversations, subscribeToConversationsForUser } from "../lib/messages";
import { MessagesList } from "../messaging/MessagesList.jsx";
import { ConversationSheet } from "../messaging/ConversationSheet.jsx";
import { BottomNav } from "../ui/BottomNav.jsx";
import { LoadingScreen } from "../ui/Loading.jsx";
import { ProDashboard } from "./ProDashboard.jsx";
import { ProJobs } from "./ProJobs.jsx";
import { ProProfile } from "./ProProfile.jsx";
import { MyBusinessPanel } from "./MyBusinessPanel.jsx";
import { SendQuoteSheet } from "./SendQuoteSheet.jsx";
import { offeredCategoryIds } from "../lib/proStatus.js";
import { netEarnings } from "../lib/billing.js";
import { unreadTotal } from "../lib/conversationSelectors.js";

export function ProApp({ showToast }) {
  // Platform Activation Slice 1, WP 1.10 — fmtDate added for MyBusinessPanel.jsx's own
  // reuse of MyItemsPanel.jsx, which formats maintenance due-dates and document validity
  // dates the same way ConversationHome.jsx's own customer surface already does.
  const { t, BASE_SERVICES, fmtDate } = useLang();
  const { user, activeWorkspace } = useAuth();
  // Epic 03 WP11 — a pro's own Professional Workspace, threaded into fetchProServices only.
  // Not threaded into fetchConversations/subscribeToConversationsForUser: those match on
  // the REQUESTING (customer) workspace, which a pro's own workspace id never equals — see
  // messages.js for the reasoning.
  const workspaceId = activeWorkspace?.workspace_id;
  const [tab, setTab] = useState("dashboard");
  const [quoteLead, setQuoteLead] = useState(null);
  const [leads, setLeads] = useState(null);
  const [jobs, setJobs] = useState(null);
  const [offeredServiceIds, setOfferedServiceIds] = useState(null);
  const [proInfo, setProInfo] = useState(null);
  const [conversations, setConversations] = useState(null);
  const [openConversation, setOpenConversation] = useState(null);

  const categoryIds = offeredCategoryIds(offeredServiceIds, BASE_SERVICES);
  const categoryKey = categoryIds.join(",");

  const refreshLeads = () => fetchProLeads(user.id).then(setLeads);
  const refreshJobs = () => fetchProJobs(user.id).then(setJobs);
  const refreshConversations = () => fetchConversations(user.id).then(setConversations);
  const refreshProInfo = () => fetchPublicProInfo([user.id]).then((m) => setProInfo(m[user.id]));

  useEffect(() => {
    fetchProServices(user.id, workspaceId).then(setOfferedServiceIds);
    fetchPublicProInfo([user.id]).then((m) => setProInfo(m[user.id]));
    refreshLeads();
    refreshJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, workspaceId]);

  useEffect(() => subscribeToProQuoteUpdates(user.id, refreshJobs), [user.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    refreshLeads();
    return subscribeToProLeads(categoryIds, refreshLeads);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryKey]);

  useEffect(() => {
    refreshConversations();
    // No workspaceId: see the note above this component's workspaceId declaration.
    return subscribeToConversationsForUser(user.id, undefined, refreshConversations);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  if (!leads || !jobs || !proInfo || !offeredServiceIds || !conversations) {
    return <LoadingScreen />;
  }

  const earnedGross = netEarnings([...jobs.booked, ...jobs.completed], user.id);

  const sendQuote = async (lead, price, message) => {
    await sendQuoteApi({ requestId: lead.id, proId: user.id, price, message });
    setQuoteLead(null);
    await refreshLeads();
    await refreshJobs();
    showToast(t.toastQuoteSent);
  };

  return (
    <div className="view">
      <div className="content">
        {tab === "dashboard" && <ProDashboard leads={leads} onQuote={(l) => setQuoteLead(l)} proInfo={proInfo} />}
        {tab === "jobs" && <ProJobs sent={jobs.sent} booked={jobs.booked} completed={jobs.completed} proId={user.id} />}
        {tab === "messages" && <MessagesList conversations={conversations} onOpen={setOpenConversation} />}
        {tab === "profile" && (
          <ProProfile proInfo={proInfo} completedCount={jobs.completed.length} earnedGross={earnedGross} offeredServiceIds={offeredServiceIds} onServicesChange={setOfferedServiceIds} onProfileSaved={refreshProInfo} onPauseToggled={refreshLeads} />
        )}
        {tab === "business" && <MyBusinessPanel t={t} fmtDate={fmtDate} />}
      </div>

      <BottomNav tab={tab} setTab={setTab} items={[
        { id: "dashboard", label: t.navDashboard, icon: Briefcase, badge: leads.length },
        { id: "jobs", label: t.navMyJobs, icon: ClipboardList },
        { id: "business", label: t.navMyBusiness, icon: Building2 },
        { id: "messages", label: t.navMessages, icon: MessageCircle, badge: unreadTotal(conversations) },
        { id: "profile", label: t.navProfile, icon: User },
      ]} />

      {quoteLead && <SendQuoteSheet lead={quoteLead} onClose={() => setQuoteLead(null)} onSubmit={(price, msg) => sendQuote(quoteLead, price, msg)} />}
      {openConversation && (
        <ConversationSheet
          conversationId={openConversation.id}
          userId={user.id}
          otherName={openConversation.otherName}
          onClose={() => { setOpenConversation(null); refreshConversations(); }}
        />
      )}
    </div>
  );
}
