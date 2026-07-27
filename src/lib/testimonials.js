import { supabase } from "./supabaseClient";

export async function addTestimonial({ proId, clientName, quoteText }) {
  const { data, error } = await supabase
    .from("testimonials")
    .insert({ pro_id: proId, client_name: clientName || null, quote_text: quoteText })
    .select("id, client_name, quote_text, created_at")
    .single();
  if (error) throw error;
  return data;
}

export async function fetchTestimonials(proId) {
  const { data, error } = await supabase
    .from("testimonials")
    .select("id, client_name, quote_text, created_at")
    .eq("pro_id", proId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function deleteTestimonial(id) {
  const { error } = await supabase.from("testimonials").delete().eq("id", id);
  if (error) throw error;
}
