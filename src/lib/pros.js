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
    .select("profile_id, pro_type, bio, profiles(full_name, avatar_url), pro_stats(rating_avg, rating_count, badge_tier, is_certified)")
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
        bio: row.bio || null,
        rating: Number(row.pro_stats?.rating_avg) || 0,
        reviews: row.pro_stats?.rating_count || 0,
        badgeTier: row.pro_stats?.badge_tier || null,
        isCertified: row.pro_stats?.is_certified || false,
      },
    ])
  );
}

// Minimum platform-wide review count before an average rating may be shown at all.
// Below this, the average is withheld rather than displayed: a 5.0 computed from three
// reviews is technically true and still misleading, which is exactly the shortcut
// PRODUCT_CONSTITUTION.md Rule 9 exists to rule out. Same minimum-data-threshold
// reasoning ROADMAP.md Phase 10 applies to marketplace signals. See ADR-0011.
export const MIN_REVIEWS_FOR_PLATFORM_RATING = 20;

// Platform-wide trust signals for the conversation home's trust strip. Every value
// here is really computed — per ADR-0011 the strip may never claim a signal that has
// no data behind it (notably: no "insured work" until insurance verification exists).
//
// Reads pro_stats rather than aggregating the reviews table: rating_avg/rating_count
// there are already maintained by handle_new_review() (0001_init.sql), so this is one
// small row per pro instead of an unbounded scan over every review ever written.
export async function fetchPlatformTrustStats() {
  const { data, error } = await supabase.from("pro_stats").select("rating_avg, rating_count, is_certified");
  if (error) throw error;

  const verifiedProCount = data.filter((r) => r.is_certified).length;
  const reviewCount = data.reduce((sum, r) => sum + (r.rating_count || 0), 0);
  const weightedTotal = data.reduce((sum, r) => sum + Number(r.rating_avg || 0) * (r.rating_count || 0), 0);

  return {
    verifiedProCount,
    reviewCount,
    ratingAvg: reviewCount >= MIN_REVIEWS_FOR_PLATFORM_RATING ? weightedTotal / reviewCount : null,
  };
}

// Public, anonymous — no reviewer identity, consistent with keeping customer contact
// info private elsewhere in this schema.
export async function fetchReviewsForPro(proId) {
  const { data, error } = await supabase
    .from("reviews")
    .select("id, stars, body, created_at")
    .eq("pro_id", proId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((r) => ({ id: r.id, stars: r.stars, text: r.body, createdAt: new Date(r.created_at).getTime() }));
}
