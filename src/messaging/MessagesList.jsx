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
import { MessageCircle } from "lucide-react";
import { useLang } from "../lib/lang";
import { Badge, Button, JobCard } from "../design-system";

export function MessagesList({ conversations, onOpen, hasRequests, onViewRequests, onCreateRequest }) {
  const { t, serviceInfo } = useLang();
  const emptyAction = hasRequests ? onViewRequests : onCreateRequest;
  const emptyActionLabel = hasRequests ? t.messagesViewRequestsBtn : t.requestsEmptyCta;
  return (
    <div className="pad">
      <div className="h1" style={{ marginBottom: 14 }}>{t.messagesTitle}</div>
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
      {conversations.map((c) => (
        <JobCard
          key={c.id}
          onClick={() => onOpen(c)}
          title={c.otherName || t.counterpartFallbackName}
          badge={c.unreadCount > 0 && <Badge tone="amber">{c.unreadCount}</Badge>}
          subtitle={c.serviceId ? serviceInfo(c.serviceId).name : ""}
        >
          {c.lastMessage ? (
            <p className="quote-msg" style={{ margin: "8px 0 0" }}>"{c.lastMessage.body}"</p>
          ) : (
            <p className="quote-msg" style={{ margin: "8px 0 0", color: "var(--ink-soft)" }}>{t.messagesConversationEmpty}</p>
          )}
        </JobCard>
      ))}
    </div>
  );
}
