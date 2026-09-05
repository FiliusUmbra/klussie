// Platform Activation Slice 2, WP 2.6 — the client cutover for conversations, onto the
// Conversation engine (work.conversations/conversation_participants/messages, migrations
// 0091-0096/0147/0157). Every exported function keeps its own external shape exactly as it
// was — same names, same reshaped fields — so MessagesList.jsx/ConversationSheet.jsx/
// BottomNav.jsx's own unreadTotal() needed no changes at all. workspaceId is now required
// for fetchConversations()/subscribeToConversationsForUser(): work.conversations has no
// customer_id/pro_id concept at all, unlike legacy's own bilateral filter — CustomerApp.jsx/
// ProApp.jsx both already had activeWorkspace?.workspace_id on hand.
//
// UNREAD COUNT NO LONGER COMES FROM A PER-MESSAGE read_at COLUMN
//
// work.messages carries no read_at (0093's own header: "read" is a private fact about one
// (conversation, person) pair, not the message itself — Epic 13's own correction).
// api.my_conversations() (extended by 0157) carries the caller's own last_read_at instead;
// unreadCount is computed client-side as "messages after last_read_at, not sent by me,"
// the same semantic legacy's own per-message read_at produced, from a different column.
//
// THE OTHER PARTICIPANT'S NAME IS RESOLVED VIA api.resolve_conversation_counterpart_auth_ids()
// (0157), THEN public.resolve_identity_display() — NOT fetchPublicProInfo()
//
// fetchPublicProInfo() (src/lib/pros.js) reads public.pro_profiles, which only ever has a
// row for a professional — useless for showing a customer's name to the pro on the other
// side of the same thread. public.resolve_identity_display() (0028) is already generic
// ("anyone's name and avatar, and NOTHING else, ever") and already granted to authenticated
// — reused directly, matching this session's own "compose with an existing resolver, don't
// re-derive" discipline.
import { supabase } from "./supabaseClient";
import { uuidv7 } from "./ids.js";

// Resolves a batch of counterpart_workspace_id values to real display names —
// counterpart_workspace_id -> auth id (api.resolve_conversation_counterpart_auth_ids(),
// gated by real, active co-participation, 0157) -> name/avatar
// (public.resolve_identity_display(), already generic and already erasure-safe).
async function resolveCounterpartNames(workspaceIds, myWorkspaceId) {
  const ids = [...new Set(workspaceIds)].filter(Boolean);
  const map = new Map();
  if (ids.length === 0) return map;

  const { data: resolved, error } = await supabase
    .schema("api")
    .rpc("resolve_conversation_counterpart_auth_ids", { p_workspace_ids: ids, p_my_workspace_id: myWorkspaceId });
  if (error) throw error;

  const authIds = (resolved || []).map((row) => row.auth_user_id);
  const nameByAuthId = new Map();
  if (authIds.length > 0) {
    const { data: display, error: displayError } = await supabase.rpc("resolve_identity_display", {
      p_auth_user_ids: authIds,
    });
    if (displayError) throw displayError;
    for (const row of display || []) nameByAuthId.set(row.auth_user_id, row.full_name);
  }
  for (const row of resolved || []) {
    map.set(row.workspace_id, nameByAuthId.get(row.auth_user_id) || null);
  }
  return map;
}

function reshapeConversation(row, messages, otherName) {
  const sorted = messages.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const last = sorted[sorted.length - 1] || null;
  const lastReadAt = row.last_read_at ? new Date(row.last_read_at).getTime() : null;
  const unreadCount = sorted.filter(
    (m) => m.sender_workspace_id !== row.own_workspace_id && (lastReadAt === null || new Date(m.created_at).getTime() > lastReadAt)
  ).length;

  return {
    id: row.id,
    requestId: row.request_id,
    serviceId: row.service_id,
    otherName: otherName || "Klussie user",
    lastMessage: last ? { body: last.body, createdAt: new Date(last.created_at).getTime() } : null,
    unreadCount,
    createdAt: new Date(row.created_at).getTime(),
  };
}

// The read cutover. workspaceId is required — work.conversations has no customer_id/pro_id
// concept at all, unlike legacy's own bilateral shape (Epic 03 WP11's own fallback).
export async function fetchConversations(userId, workspaceId) {
  if (!workspaceId) return [];

  const { data: rows, error } = await supabase
    .schema("api")
    .rpc("my_conversations", { p_workspace_id: workspaceId });
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const counterpartNames = await resolveCounterpartNames(rows.map((r) => r.counterpart_workspace_id), workspaceId);

  const messagesByConversation = new Map();
  await Promise.all(
    rows.map(async (row) => {
      const { data, error: messagesError } = await supabase
        .schema("api")
        .rpc("conversation_messages", { p_conversation_id: row.id, p_workspace_id: workspaceId });
      if (messagesError) throw messagesError;
      messagesByConversation.set(row.id, data || []);
    })
  );

  const reshaped = rows.map((row) =>
    reshapeConversation(
      { ...row, own_workspace_id: workspaceId },
      messagesByConversation.get(row.id) || [],
      counterpartNames.get(row.counterpart_workspace_id)
    )
  );
  return reshaped.sort((a, b) => b.createdAt - a.createdAt);
}

export async function fetchMessages(conversationId, workspaceId) {
  const { data, error } = await supabase
    .schema("api")
    .rpc("conversation_messages", { p_conversation_id: conversationId, p_workspace_id: workspaceId });
  if (error) throw error;
  return (data || []).map((m) => ({
    id: m.id,
    // The real auth id — comparable against the userId prop ConversationSheet.jsx/
    // conversationSelectors.js already thread through everywhere, not the internal
    // sender_person_ref (see this file's own header and 0157's own "FIX 4").
    senderId: m.sender_auth_user_id,
    body: m.body,
    createdAt: new Date(m.created_at).getTime(),
    readAt: null,
    translations: m.translations || {},
  }));
}

// Lazily populated the first time someone views a message in a given UI language
// (see ConversationSheet) — unchanged read-modify-write shape, now via
// api.save_message_translation, which reads the message itself server-side rather than
// trusting a client-supplied existing-translations blob.
export async function saveMessageTranslation(messageId, locale, translatedText, userId, workspaceId) {
  const { error } = await supabase.schema("api").rpc("save_message_translation", {
    p_message_id: messageId,
    p_locale: locale,
    p_text: translatedText,
    p_workspace_id: workspaceId,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: userId,
  });
  if (error) throw error;
}

export async function sendMessage({ conversationId, senderId, senderWorkspaceId, body }) {
  const { error } = await supabase.schema("api").rpc("send_message", {
    p_message_id: uuidv7(),
    p_conversation_id: conversationId,
    p_sender_workspace_id: senderWorkspaceId,
    p_body: body,
    p_original_locale: null,
    p_reference_type: null,
    p_reference_id: null,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: senderId,
  });
  if (error) throw error;
}

export async function markConversationRead(conversationId, workspaceId) {
  const { error } = await supabase.schema("api").rpc("mark_conversation_read", {
    p_conversation_id: conversationId,
    p_workspace_id: workspaceId,
  });
  if (error) throw error;
}

// One channel: new messages and read-state changes on work.messages/work.conversations,
// scoped to the caller's own workspace as either the requesting side (via engagement's own
// requesting_workspace_id — carried on work.conversations only when workspace-bound, so
// this listens broadly on work.messages/work.conversation_participants instead, matching
// legacy's own small-scale "listen to everything, let onChange re-fetch" trade-off
// (subscribeToProLeads' own reasoning).
export function subscribeToConversationsForUser(userId, workspaceId, onChange) {
  if (!workspaceId) return () => {};
  const channel = supabase
    .channel(`conversations-${workspaceId}`)
    .on("postgres_changes", { event: "*", schema: "work", table: "messages" }, onChange)
    .on(
      "postgres_changes",
      { event: "*", schema: "work", table: "conversation_participants", filter: `workspace_id=eq.${workspaceId}` },
      onChange
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export function subscribeToMessages(conversationId, onChange) {
  const channel = supabase
    .channel(`messages-${conversationId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "work", table: "messages", filter: `conversation_id=eq.${conversationId}` },
      onChange
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}
