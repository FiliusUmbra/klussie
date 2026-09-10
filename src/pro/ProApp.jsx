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
import { ProJobDetailSheet } from "./ProJobDetailSheet.jsx";
import { Profile } from "../profile/Profile.jsx";
import { MyBusinessPanel } from "./MyBusinessPanel.jsx";
import { SendQuoteSheet } from "./SendQuoteSheet.jsx";
import { ProOnboarding } from "./ProOnboarding.jsx";
import { useProTour } from "./useProTour.js";
import { offeredCategoryIds } from "../lib/proStatus.js";
import { netEarnings } from "../lib/billing.js";
import { unreadTotal } from "../lib/conversationSelectors.js";

export function ProApp({ showToast }) {
  // Platform Activation Slice 1, WP 1.10 — fmtDate added for MyBusinessPanel.jsx's own
  // reuse of MyItemsPanel.jsx, which formats maintenance due-dates and document validity
  // dates the same way ConversationHome.jsx's own customer surface already does.
  const { t, BASE_SERVICES, fmtDate } = useLang();
  const { user, activeWorkspace } = useAuth();
  // Epic 03 WP11 / Platform Activation Slice 2 WP 2.6 — a pro's own Professional
  // Workspace. api.my_conversations() (0157) is person-scoped, not workspace-filtered
  // (resolved via public.current_identity(), participant membership) — workspaceId here
  // identifies which side of each conversation is "mine" for computing unreadCount, not a
  // read filter, so it threads into fetchConversations/subscribeToConversationsForUser too.
  const workspaceId = activeWorkspace?.workspace_id;
  const tour = useProTour();
  const [tab, setTab] = useState("dashboard");
  const [quoteLead, setQuoteLead] = useState(null);
  const [leads, setLeads] = useState(null);
  const [jobs, setJobs] = useState(null);
  const [offeredServiceIds, setOfferedServiceIds] = useState(null);
  const [proInfo, setProInfo] = useState(null);
  const [conversations, setConversations] = useState(null);
  const [openConversation, setOpenConversation] = useState(null);
  const [openJob, setOpenJob] = useState(null);
  // Found by code audit: none of the five fetches this screen gates its render on below
  // had a catch anywhere -- fetchProServices/fetchPublicProInfo/fetchProLeads/
  // fetchProJobs/fetchConversations all throw on a real Postgres error, and with the
  // render gated on all five being non-null, any single one failing hung the entire
  // ProApp on a spinner forever. Same bug, same fix shape as CustomerApp.jsx's identical
  // one (see that file's own comment) and AppShell.jsx's original catalogError before it
  // -- one boolean per fetch, set only around the very first load so a later background
  // refresh failure (a realtime event, a lead-category change) leaves whatever's already
  // on screen alone instead of tearing down a working screen over a transient hiccup.
  const [servicesLoadError, setServicesLoadError] = useState(false);
  const [proInfoLoadError, setProInfoLoadError] = useState(false);
  const [leadsLoadError, setLeadsLoadError] = useState(false);
  const [jobsLoadError, setJobsLoadError] = useState(false);
  const [conversationsLoadError, setConversationsLoadError] = useState(false);

  const categoryIds = offeredCategoryIds(offeredServiceIds, BASE_SERVICES);
  const categoryKey = categoryIds.join(",");

  const refreshLeads = () => fetchProLeads(user.id).then(setLeads);
  const refreshJobs = () => fetchProJobs(user.id, workspaceId).then(setJobs);
  const refreshConversations = () => fetchConversations(user.id, workspaceId).then(setConversations);
  const refreshProInfo = () => fetchPublicProInfo([user.id]).then((m) => setProInfo(m[user.id]));
  const refreshServices = () => fetchProServices(user.id, workspaceId).then(setOfferedServiceIds);

  const track = (promise, setError) => promise.then(() => setError(false)).catch(() => setError(true));
  const loadInitial = () => {
    track(refreshServices(), setServicesLoadError);
    track(refreshProInfo(), setProInfoLoadError);
    track(refreshLeads(), setLeadsLoadError);
    track(refreshJobs(), setJobsLoadError);
  };
  const loadConversations = () => track(refreshConversations(), setConversationsLoadError);

  useEffect(() => {
    loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, workspaceId]);

  useEffect(() => subscribeToProQuoteUpdates(workspaceId, refreshJobs), [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // This fires on mount too (categoryKey already has a value on first render), landing
    // right alongside loadInitial()'s own tracked refreshLeads() above -- that one is
    // what leadsLoadError/the render gate below actually watch, so this one only needs
    // to not become a bare unhandled rejection if it fails; caught and found by this
    // fix's own new test.
    refreshLeads().catch(() => {});
    return subscribeToProLeads(categoryIds, refreshLeads);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryKey]);

  useEffect(() => {
    loadConversations();
    return subscribeToConversationsForUser(user.id, workspaceId, refreshConversations);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, workspaceId]);

  if (
    (offeredServiceIds === null && servicesLoadError) ||
    (proInfo === null && proInfoLoadError) ||
    (leads === null && leadsLoadError) ||
    (jobs === null && jobsLoadError) ||
    (conversations === null && conversationsLoadError)
  ) {
    return (
      <div className="pad">
        <div className="empty-block">
          <p>{t.catalogLoadFailed}</p>
          <button type="button" className="btn-secondary" onClick={() => { loadInitial(); loadConversations(); }}>
            {t.retryBtn}
          </button>
        </div>
      </div>
    );
  }

  if (!leads || !jobs || !proInfo || !offeredServiceIds || !conversations) {
    return <LoadingScreen />;
  }

  const earnedGross = netEarnings([...jobs.booked, ...jobs.completed], user.id);

  // Same shape as CustomerApp.jsx's own submitReview() fix: this was fire-and-forget
  // from its own JSX call site (no await, no catch) and had none of its own either, so
  // any failure -- 0212's own "a quote could be submitted against a request that was no
  // longer open" guard included, a real, reachable refusal whenever two pros race the
  // same lead -- became an unhandled promise rejection. The sheet had no busy state
  // either, so the professional had no way to tell an attempt had even been made,
  // let alone that it failed. setQuoteLead(null) only runs on success (unchanged from
  // before), so a failure leaves the sheet open with the price/message already typed,
  // ready to retry, rather than silently discarding them.
  const sendQuote = async (lead, price, message) => {
    try {
      await sendQuoteApi({ requestId: lead.id, proId: user.id, workspaceId, price, message });
      setQuoteLead(null);
      await refreshLeads();
      await refreshJobs();
      showToast(t.toastQuoteSent);
    } catch (err) {
      console.warn("sendQuote failed:", err.message);
      showToast(t.toastQuoteFailed);
    }
  };

  return (
    <div className="view">
      <div className="content">
        {tab === "dashboard" && <ProDashboard leads={leads} onQuote={(l) => setQuoteLead(l)} proInfo={proInfo} />}
        {tab === "jobs" && <ProJobs sent={jobs.sent} booked={jobs.booked} completed={jobs.completed} proId={user.id} onOpenJob={setOpenJob} />}
        {tab === "messages" && <MessagesList conversations={conversations} onOpen={setOpenConversation} />}
        {tab === "profile" && (
          <Profile variant="pro" proInfo={proInfo} completedCount={jobs.completed.length} earnedGross={earnedGross} offeredServiceIds={offeredServiceIds} onServicesChange={setOfferedServiceIds} onProfileSaved={refreshProInfo} onPauseToggled={refreshLeads} onReplayTour={tour.replay} />
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

      {tour.open && <ProOnboarding t={t} onFinish={tour.finish} />}

      {quoteLead && <SendQuoteSheet lead={quoteLead} onClose={() => setQuoteLead(null)} onSubmit={(price, msg) => sendQuote(quoteLead, price, msg)} />}
      {openJob && (() => {
        // A job and its conversation share one join key today: request id — 0148 opens
        // exactly one conversation per accepted engagement, and fetchProJobs()/
        // fetchConversations() both already carry it (job.id, conversation.requestId).
        const jobConversation = conversations.find((c) => c.requestId === openJob.id);
        return (
          <ProJobDetailSheet
            job={openJob}
            customerName={jobConversation?.otherName}
            onMessage={jobConversation ? () => { setOpenConversation(jobConversation); setOpenJob(null); } : undefined}
            onClose={() => setOpenJob(null)}
            actorRef={user.id}
            workspaceId={workspaceId}
            onRecordSaved={refreshJobs}
          />
        );
      })()}
      {openConversation && (
        <ConversationSheet
          conversationId={openConversation.id}
          userId={user.id}
          workspaceId={workspaceId}
          otherName={openConversation.otherName}
          onClose={() => { setOpenConversation(null); refreshConversations(); }}
        />
      )}
    </div>
  );
}
