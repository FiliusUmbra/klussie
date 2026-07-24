import { supabase } from "./supabaseClient";

const CONVERSATION_SELECT = `
  id, request_id, customer_id, pro_id, created_at,
  service_requests ( service_id ),
  customer:profiles ( full_name ),
  pro:pro_profiles ( profile_id, profiles ( full_name ) ),
  messages ( id, sender_id, body, created_at, read_at )
`;

function firstOrNull(x) {
  return Array.isArray(x) ? (x[0] ?? null) : (x ?? null);
}

function reshapeConversation(row, userId) {
  const isCustomer = row.customer_id === userId;
  const proInfo = firstOrNull(row.pro);
  const proProfile = proInfo ? firstOrNull(proInfo.profiles) : null;
  const customerProfile = firstOrNull(row.customer);
  const otherName = isCustomer ? (proProfile?.full_name || "Pro") : (customerProfile?.full_name || "Customer");
  const serviceId = firstOrNull(row.service_requests)?.service_id;

  const messages = (row.messages || [])
    .slice()
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const last = messages[messages.length - 1] || null;
  const unreadCount = messages.filter((m) => m.sender_id !== userId && !m.read_at).length;

  return {
    id: row.id,
    requestId: row.request_id,
    serviceId,
    otherName,
    lastMessage: last ? { body: last.body, createdAt: new Date(last.created_at).getTime() } : null,
    unreadCount,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function fetchConversations(userId) {
  const { data, error } = await supabase
    .from("conversations")
    .select(CONVERSATION_SELECT)
    .or(`customer_id.eq.${userId},pro_id.eq.${userId}`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((row) => reshapeConversation(row, userId));
}

export async function fetchMessages(conversationId) {
  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, body, created_at, read_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map((m) => ({
    id: m.id,
    senderId: m.sender_id,
    body: m.body,
    createdAt: new Date(m.created_at).getTime(),
    readAt: m.read_at,
  }));
}

export async function sendMessage({ conversationId, senderId, body }) {
  const { error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: senderId, body });
  if (error) throw error;
}

export async function markConversationRead(conversationId, userId) {
  const { error } = await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .neq("sender_id", userId)
    .is("read_at", null);
  if (error) throw error;
}

// One channel, three listeners: new messages anywhere (small scale, same trade-off as
// subscribeToProLeads), plus new conversations on either side of this user.
export function subscribeToConversationsForUser(userId, onChange) {
  const channel = supabase
    .channel(`conversations-${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, onChange)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "conversations", filter: `customer_id=eq.${userId}` },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "conversations", filter: `pro_id=eq.${userId}` },
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
      { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
      onChange
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}
