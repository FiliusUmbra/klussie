import { supabase } from "./supabaseClient";

export async function submitReport({ reporterId, proId, requestId, reason, details }) {
  const { error } = await supabase.from("reports").insert({
    reporter_id: reporterId,
    pro_id: proId,
    request_id: requestId || null,
    reason,
    details: details || null,
  });
  if (error) throw error;
}
