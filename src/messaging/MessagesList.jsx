// The conversation list, shared by the customer and professional apps — the same rows
// mean the same thing on both sides, so there is one component rather than two that
// drift.
//
// UX redesign, 2026-09-28 — the empty state used to explain the (true) rule that
// conversations start after quote acceptance and then stop, with no onward action at
// all. onViewRequests/onCreateRequest are optional: the customer side (the only caller
// with a real distinction to offer) passes both and hasRequests decides which shows; a
// caller with neither (professional side — Jobs, not Requests, is its own equivalent
// destination, not yet wired here) still gets the same honest explanation as before,
// just without a dead end.
//
// All / Unread filter (visual-refresh direction, 2026-10-01). The design canvas also
// showed "Professionals" and "System" tabs; neither exists as real data here — every
// conversation is with a counterpart professional and no system-message conversation
// type exists — so they are not rendered (a tab that is always identical to "All", or
// always empty, would be a claim with no data behind it). Unread is real: it filters on
// the same unreadCount the row badge already shows.
import { useState } from "react";
import { MessageCircle, HelpCircle } from "lucide-react";
import { useLang } from "../lib/lang";
import { Avatar, Badge, Button } from "../design-system";
import { PageTour } from "../ui/PageTour.jsx";
import { usePageTour } from "../ui/usePageTour.js";
import { messageStamp } from "../lib/messageStamp.js";

// PageTour.jsx steps (2026-10-03) — only shown once there is a conversation to point at.
const MESSAGES_TOUR_STEPS = [
  { id: "messages-first", titleKey: "pageTourMessagesStep1Title", bodyKey: "pageTourMessagesStep1Body" },
  { id: "messages-filter", titleKey: "pageTourMessagesStep2Title", bodyKey: "pageTourMessagesStep2Body" },
];
// The professional's own wording (live review 2026-10-04, item 12): the customer copy talked
// about "your professional" and accepting a quote, which is backwards on the pro side.
const MESSAGES_TOUR_STEPS_PRO = [
  { id: "messages-first", titleKey: "pageTourMessagesProStep1Title", bodyKey: "pageTourMessagesProStep1Body" },
  { id: "messages-filter", titleKey: "pageTourMessagesProStep2Title", bodyKey: "pageTourMessagesProStep2Body" },
];

export function MessagesList({ conversations, onOpen, hasRequests, onViewRequests, onCreateRequest, role = "customer" }) {
  const { t, serviceInfo, fmtDate, langCode } = useLang();
  const [filter, setFilter] = useState("all");
  const tour = usePageTour("messages");
  const emptyAction = hasRequests ? onViewRequests : onCreateRequest;
  const emptyActionLabel = hasRequests ? t.messagesViewRequestsBtn : t.requestsEmptyCta;
  const visible = filter === "unread" ? conversations.filter((c) => c.unreadCount > 0) : conversations;
  return (
    <div className="pad">
      <div className="hello" style={{ marginBottom: 14 }}>
        <div className="h1">{t.messagesTitle}</div>
        <button type="button" className="icon-btn" aria-label={t.helpReplayTour} onClick={tour.replay}><HelpCircle size={18} aria-hidden="true" /></button>
      </div>
      {tour.open && conversations.length > 0 && <PageTour steps={role === "pro" ? MESSAGES_TOUR_STEPS_PRO : MESSAGES_TOUR_STEPS} onFinish={tour.finish} />}
      {conversations.length > 0 && (
        <div className="messages-filter" data-tour="messages-filter" role="group" aria-label={t.messagesTitle}>
          {[["all", t.messagesFilterAll], ["unread", t.messagesFilterUnread]].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={"messages-filter-pill" + (filter === id ? " messages-filter-pill-on" : "")}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {conversations.length > 0 && visible.length === 0 && (
        <div className="empty-block"><p>{t.messagesUnreadEmpty}</p></div>
      )}
      {conversations.length === 0 && (
        <div className="empty-block">
          <MessageCircle size={26} color="var(--ink-soft)" />
          <p>{role === "pro" ? t.messagesEmptyPro : t.messagesEmpty}</p>
          {emptyAction && (
            <Button variant="secondary" style={{ width: "auto", padding: "9px 16px" }} onClick={emptyAction}>
              {emptyActionLabel}
            </Button>
          )}
        </div>
      )}
      {visible.map((c, i) => {
        const name = c.otherName || t.counterpartFallbackName;
        const unread = c.unreadCount > 0;
        return (
          // Visual-refresh direction, 2026-10-02 — the drafted row: avatar initial, name
          // with the service as the secondary line, a one-line preview, the time of the
          // last message, and the unread count. Same data as the JobCard it replaces.
          <button key={c.id} type="button" data-tour={i === 0 ? "messages-first" : undefined} className={"msg-row" + (unread ? " msg-row-unread" : "")} onClick={() => onOpen(c)}>
            <Avatar initials={name.trim()[0]?.toUpperCase()} />
            <span className="msg-row-main">
              <span className="msg-row-top">
                <strong>{name}</strong>
                {c.lastMessage && <time>{messageStamp(c.lastMessage.createdAt, { fmtDate, langCode })}</time>}
              </span>
              {c.serviceId && <small className="msg-row-service">{serviceInfo(c.serviceId).name}</small>}
              <span className="msg-row-bottom">
                <span className="msg-row-preview">{c.lastMessage ? c.lastMessage.body : t.messagesConversationEmpty}</span>
                {unread && <Badge tone="amber">{c.unreadCount}</Badge>}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
