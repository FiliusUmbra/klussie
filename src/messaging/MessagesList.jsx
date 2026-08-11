// The conversation list, shared by the customer and professional apps — the same rows
// mean the same thing on both sides, so there is one component rather than two that
// drift.
import { MessageCircle } from "lucide-react";
import { useLang } from "../lib/lang";
import { Badge, JobCard } from "../design-system";

export function MessagesList({ conversations, onOpen }) {
  const { t, serviceInfo } = useLang();
  return (
    <div className="pad">
      <div className="h1" style={{ marginBottom: 14 }}>{t.messagesTitle}</div>
      {conversations.length === 0 && (
        <div className="empty-block"><MessageCircle size={26} color="var(--ink-soft)" /><p>{t.messagesEmpty}</p></div>
      )}
      {conversations.map((c) => (
        <JobCard
          key={c.id}
          onClick={() => onOpen(c)}
          title={c.otherName}
          badge={c.unreadCount > 0 && <Badge tone="amber">{c.unreadCount}</Badge>}
          subtitle={c.serviceId ? serviceInfo(c.serviceId).name : ""}
        >
          {c.lastMessage && <p className="quote-msg" style={{ margin: "8px 0 0" }}>"{c.lastMessage.body}"</p>}
        </JobCard>
      ))}
    </div>
  );
}
