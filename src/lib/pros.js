import { supabase } from "./supabaseClient";

export function initialsFrom(name) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export async function fetchProServices(proId) {
  const { data, error } = await supabase.from("pro_services").select("service_id").eq("pro_id", proId);
  if (error) throw error;
  return data.map((r) => r.service_id);
}

// Replaces a pro's full offered-services list with `serviceIds`.
export async function updateProServices(proId, serviceIds) {
  const current = await fetchProServices(proId);
  const toAdd = serviceIds.filter((id) => !current.includes(id));
  const toRemove = current.filter((id) => !serviceIds.includes(id));

  if (toAdd.length) {
    const { error } = await supabase
      .from("pro_services")
      .insert(toAdd.map((service_id) => ({ pro_id: proId, service_id })));
    if (error) throw error;
  }
  if (toRemove.length) {
    const { error } = await supabase.from("pro_services").delete().eq("pro_id", proId).in("service_id", toRemove);
    if (error) throw error;
  }
}

export async function updateProProfile(proId, fields) {
  const { error } = await supabase.from("pro_profiles").update(fields).eq("profile_id", proId);
  if (error) throw error;
}

export async function boostProfile(proId, days = 7) {
  const boostedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  await updateProProfile(proId, { boosted_until: boostedUntil });
  return boostedUntil;
}

// Bulk-fetches the public info needed to render a pro on a quote card: name, rating, badge.
export async function fetchPublicProInfo(proIds) {
  const ids = [...new Set(proIds)];
  if (ids.length === 0) return {};

  const { data, error } = await supabase
    .from("pro_profiles")
    .select("profile_id, pro_type, profiles(full_name, avatar_url), pro_stats(rating_avg, rating_count, badge_tier)")
    .in("profile_id", ids);
  if (error) throw error;

  return Object.fromEntries(
    data.map((row) => [
      row.profile_id,
      {
        id: row.profile_id,
        name: row.profiles?.full_name || "Pro",
        initials: initialsFrom(row.profiles?.full_name),
        avatarUrl: row.profiles?.avatar_url || null,
        proType: row.pro_type,
        rating: Number(row.pro_stats?.rating_avg) || 0,
        reviews: row.pro_stats?.rating_count || 0,
        badgeTier: row.pro_stats?.badge_tier || null,
      },
    ])
  );
}
