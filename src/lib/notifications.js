// The Notification engine's client wiring (Slice 4, WP 4.0/4.1's own contract and
// producer). No dedicated inbox screen exists yet — see this session's own
// SLICE_4_CONVERSATION_NOTIFICATION_ACTIVATION.md, WP 4.2's revised scope note, for why:
// conversation-message notifications are, today, the ONLY producer onto this engine, and
// their content is already fully visible, live (real-time, translated), via the Messages
// tab — ROADMAP_A/ROADMAP_B's own "one inbox" language argues for making that existing
// surface the real inbox, not building a second, duplicate one. This file is what makes
// the engine reachable: ConversationSheet.jsx calls markConversationNotificationsSeen()
// on open, closing the loop on WP 4.0's own write contract with a real caller for the
// first time.
import { supabase } from "./supabaseClient";
import { uuidv7 } from "./ids.js";

export async function fetchInbox() {
  const { data, error } = await supabase.schema("api").rpc("my_inbox");
  if (error) throw error;
  return data || [];
}

export async function markNotificationSeen(deliveryId, actorRef) {
  const { error } = await supabase.schema("api").rpc("mark_notification_seen", {
    p_delivery_id: deliveryId,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: actorRef,
  });
  if (error) throw error;
}

export async function markNotificationActed(deliveryId, actorRef) {
  const { error } = await supabase.schema("api").rpc("mark_notification_acted", {
    p_delivery_id: deliveryId,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: actorRef,
  });
  if (error) throw error;
}

// The one real integration point this pass wires in: opening a conversation is both
// "seeing" and "acting on" any notification that named it — there is no separate inbox
// tap-through today for those two moments to differ. platform.mark_notification_seen()/
// mark_notification_acted() (0117) each refuse a delivery already in that state (a real
// exception, not a silent no-op), so both calls are pre-filtered against the inbox's own
// current seen_at/acted_at rather than called unconditionally.
//
// Best-effort, deliberately: a failure here must never block reading an actual message,
// so every failure is swallowed, matching translateMessage()'s own established
// "falls back silently on error rather than blocking the conversation" restraint in this
// same file's caller (ConversationSheet.jsx).
export async function markConversationNotificationsSeen(conversationId, actorRef) {
  try {
    const inbox = await fetchInbox();
    const forThisConversation = inbox.filter((n) => n.subject_type === "conversation" && n.subject_id === conversationId);
    const unseen = forThisConversation.filter((n) => !n.seen_at);
    const unacted = forThisConversation.filter((n) => !n.acted_at);
    await Promise.all(unseen.map((n) => markNotificationSeen(n.delivery_id, actorRef)));
    await Promise.all(unacted.map((n) => markNotificationActed(n.delivery_id, actorRef)));
  } catch {
    // ignore — the conversation itself already opened successfully
  }
}
