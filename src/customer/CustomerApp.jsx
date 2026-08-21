// The customer side of the app: the four tabs, the sheets they open, and the live
// subscriptions that keep requests and conversations current.
//
// This is the composition root for the customer experience — it owns the data every tab
// reads and the handlers that mutate it, and delegates all rendering. The request-writing
// helpers below stay here rather than in src/lib because they are orchestration (create,
// then upload photos, then refresh), not rules; src/lib/requests.js owns the actual
// writes.
import { useState, useEffect } from "react";
import { User, Home, ClipboardList, MessageCircle } from "lucide-react";
import { useLang } from "../lib/lang";
import { useAuth } from "../lib/auth.jsx";
import {
  createServiceRequest,
  fetchCustomerRequests,
  acceptQuote as acceptQuoteApi,
  markComplete as markCompleteApi,
  submitReview as submitReviewApi,
  subscribeToCustomerRequests,
  subscribeToRequestQuotes,
} from "../lib/requests";
import { fetchConversations, subscribeToConversationsForUser } from "../lib/messages";
import { uploadRequestPhoto } from "../lib/requestPhotos";
import { ConversationHome } from "../home/ConversationHome.jsx";
import { CustomerOnboarding } from "../home/CustomerOnboarding.jsx";
import { useHomeTour } from "../home/useHomeTour.js";
import { MessagesList } from "../messaging/MessagesList.jsx";
import { ConversationSheet } from "../messaging/ConversationSheet.jsx";
import { BottomNav } from "../ui/BottomNav.jsx";
import { LoadingScreen } from "../ui/Loading.jsx";
import { ServiceSheet } from "./ServiceSheet.jsx";
import { QuoteFormSheet } from "./QuoteFormSheet.jsx";
import { AiIntakeSheet } from "./AiIntakeSheet.jsx";
import { RequestsList } from "./RequestsList.jsx";
import { RequestDetailSheet } from "./RequestDetailSheet.jsx";
import { ReviewSheet } from "./ReviewSheet.jsx";
import { CustomerProfile } from "./CustomerProfile.jsx";
import { awaitingDecisionCount } from "../lib/requestStatus.js";
import { unreadTotal } from "../lib/conversationSelectors.js";

// An empty budget field and an absent budget mean the same thing to a professional:
// "flexible". Neither should reach the database as the string "".
const numericBudget = (budget) => (budget === "" || budget == null ? null : Number(budget));

export function CustomerApp({ showToast }) {
  const { t } = useLang();
  const { user, activeWorkspace } = useAuth();
  const workspaceId = activeWorkspace?.workspace_id;
  const [tab, setTab] = useState("discover");
  const [activeService, setActiveService] = useState(null);
  const [quoteForm, setQuoteForm] = useState(null);
  const [aiIntakeOpen, setAiIntakeOpen] = useState(false);
  const [openRequest, setOpenRequest] = useState(null);
  const [reviewFor, setReviewFor] = useState(null);
  const [requests, setRequests] = useState(null);
  const [conversations, setConversations] = useState(null);
  const [openConversation, setOpenConversation] = useState(null);
  // Which section of the homepage is showing. Lifted out of ConversationHome only
  // because the tour can end on "Stel eerst mijn woning in" and has to land the
  // customer there — nothing else reaches in.
  const [homeSection, setHomeSection] = useState("klussie");
  const tour = useHomeTour();

  // Epic 03 WP11 — workspaceId is undefined until WP 03.09's resolver places this person in
  // exactly one workspace; both helpers fall back to the pre-Epic-03 owner-id filter when it
  // is, so this reads identically either way for today's single-workspace customer.
  const refresh = () => fetchCustomerRequests(user.id, workspaceId).then(setRequests);
  const refreshConversations = () => fetchConversations(user.id, workspaceId).then(setConversations);

  useEffect(() => {
    refresh();
    return subscribeToCustomerRequests(user.id, workspaceId, refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, workspaceId]);

  useEffect(() => {
    if (!openRequest) return;
    return subscribeToRequestQuotes(openRequest, refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest]);

  useEffect(() => {
    refreshConversations();
    return subscribeToConversationsForUser(user.id, workspaceId, refreshConversations);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, workspaceId]);

  if (!requests || !conversations) return <LoadingScreen />;

  const openRequestObj = requests.find((r) => r.id === openRequest);
  const reviewReq = requests.find((r) => r.id === reviewFor);

  // Photos upload after the request exists because they are stored against its id. A
  // failed upload therefore leaves a real request with fewer photos rather than no
  // request at all — the better of the two failure modes for someone with a leak.
  const attachPhotos = async (requestId, photos) => {
    for (const file of photos || []) {
      await uploadRequestPhoto(requestId, user.id, workspaceId, file);
    }
  };

  const createRequest = async (service, { whenPref, details, detailsJson, budget, city, photos }) => {
    const created = await createServiceRequest({
      customerId: user.id,
      workspaceId,
      serviceId: service.id,
      categoryId: service.cat,
      details,
      detailsJson,
      whenPref,
      budget: numericBudget(budget),
      city: city || null,
    });
    await attachPhotos(created.id, photos);
    await refresh();
  };

  // AI intake already resolves its own serviceId/categoryId (with the user able to
  // override the AI's guess before submitting), so this bypasses createRequest's
  // `service` object indirection rather than reshaping the payload to fit it.
  const createRequestFromAi = async ({ serviceId, categoryId, details, detailsJson, aiAnalysis, whenPref, budget, city, photos }) => {
    const created = await createServiceRequest({
      customerId: user.id,
      workspaceId,
      serviceId,
      categoryId,
      details,
      detailsJson,
      aiAnalysis,
      whenPref,
      budget: numericBudget(budget),
      city: city || null,
    });
    await attachPhotos(created.id, photos);
    await refresh();
  };

  const acceptQuote = async (quoteId) => {
    await acceptQuoteApi(quoteId, user.id);
    await refresh();
    showToast(t.toastBooked);
  };

  const markComplete = async (requestId) => {
    await markCompleteApi(requestId, user.id);
    await refresh();
  };

  const submitReview = async (request, review) => {
    await submitReviewApi({ requestId: request.id, customerId: user.id, stars: review.stars, text: review.text });
    await refresh();
    showToast(t.toastThanks);
  };

  return (
    <div className="view">
      <div className="content">
        {tab === "discover" && (
          <ConversationHome
            onStart={(seed) => setAiIntakeOpen(seed || {})}
            requests={requests}
            section={homeSection}
            onSectionChange={setHomeSection}
            onOpenRequest={(id) => setOpenRequest(id)}
          />
        )}
        {tab === "requests" && <RequestsList requests={requests} onOpen={(id) => setOpenRequest(id)} />}
        {tab === "messages" && <MessagesList conversations={conversations} onOpen={setOpenConversation} />}
        {tab === "profile" && <CustomerProfile requests={requests} onReplayTour={tour.replay} />}
      </div>

      <BottomNav tab={tab} setTab={setTab} items={[
        { id: "discover", label: t.navDiscover, icon: Home },
        { id: "requests", label: t.navRequests, icon: ClipboardList, badge: awaitingDecisionCount(requests) },
        { id: "messages", label: t.navMessages, icon: MessageCircle, badge: unreadTotal(conversations) },
        { id: "profile", label: t.navProfile, icon: User },
      ]} />

      {/* Ending the tour on "set up my home first" is the only thing that moves the
          homepage's section from outside it — hence the tab switch alongside it, so the
          customer is looking at what they just chose rather than at the Klussie tab. */}
      {tour.open && (
        <CustomerOnboarding
          t={t}
          onFinish={async (result) => {
            const destination = await tour.finish(result);
            setTab("discover");
            setHomeSection(destination === "myHome" ? "myHome" : "klussie");
          }}
        />
      )}

      {activeService && <ServiceSheet service={activeService} onClose={() => setActiveService(null)} onRequest={() => { setQuoteForm(activeService); setActiveService(null); }} />}
      {quoteForm && <QuoteFormSheet service={quoteForm} onClose={() => setQuoteForm(null)} onSubmit={(answers) => { createRequest(quoteForm, answers); setQuoteForm(null); setTab("requests"); }} />}
      {aiIntakeOpen && (
        <AiIntakeSheet
          initialText={aiIntakeOpen.text || ""}
          initialPhotos={aiIntakeOpen.photos || []}
          initialResult={aiIntakeOpen.result || null}
          onClose={() => setAiIntakeOpen(false)}
          onSubmitted={async (payload) => { await createRequestFromAi(payload); setTab("requests"); }}
        />
      )}
      {openRequestObj && (() => {
        // Same join key as ProApp.jsx's own mirror of this: api.my_conversations()
        // carries request_id, and fetchConversations() already exposes it as
        // requestId — one conversation per accepted engagement (0148), matched
        // without a second round trip.
        const requestConversation = conversations.find((c) => c.requestId === openRequestObj.id);
        return (
          <RequestDetailSheet
            request={openRequestObj}
            onClose={() => setOpenRequest(null)}
            onAccept={acceptQuote}
            onComplete={() => markComplete(openRequestObj.id)}
            onReview={() => { setOpenRequest(null); setReviewFor(openRequestObj.id); }}
            onMessage={requestConversation ? () => { setOpenConversation(requestConversation); setOpenRequest(null); } : undefined}
          />
        );
      })()}
      {reviewReq && <ReviewSheet onClose={() => setReviewFor(null)} onSubmit={(review) => { submitReview(reviewReq, review); setReviewFor(null); }} />}
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
