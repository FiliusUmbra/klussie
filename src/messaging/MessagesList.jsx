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
import { MessageCircle } from "lucide-react";
import { useLang } from "../lib/lang";
import { Avatar, Badge, Button } from "../design-system";
import { messageStamp } from "../lib/messageStamp.js";

export function MessagesList({ conversations, onOpen, hasRequests, onViewRequests, onCreateRequest }) {
  const { t, serviceInfo, fmtDate, langCode } = useLang();
  const [filter, setFilter] = useState("all");
  const emptyAction = hasRequests ? onViewRequests : onCreateRequest;
  const emptyActionLabel = hasRequests ? t.messagesViewRequestsBtn : t.requestsEmptyCta;
  const visible = filter === "unread" ? conversations.filter((c) => c.unreadCount > 0) : conversations;
  return (
    <div className="pad">
      <div className="h1" style={{ marginBottom: 14 }}>{t.messagesTitle}</div>
      {conversations.length > 0 && (
        <div className="messages-filter" role="group" aria-label={t.messagesTitle}>
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
          <p>{t.messagesEmpty}</p>
          {emptyAction && (
            <Button variant="secondary" style={{ width: "auto", padding: "9px 16px" }} onClick={emptyAction}>
              {emptyActionLabel}
            </Button>
          )}
        </div>
      )}
      {visible.map((c) => {
        const name = c.otherName || t.counterpartFallbackName;
        const unread = c.unreadCount > 0;
        return (
          // Visual-refresh direction, 2026-10-02 — the drafted row: avatar initial, name
          // with the service as the secondary line, a one-line preview, the time of the
          // last message, and the unread count. Same data as the JobCard it replaces.
          <button key={c.id} type="button" className={"msg-row" + (unread ? " msg-row-unread" : "")} onClick={() => onOpen(c)}>
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
