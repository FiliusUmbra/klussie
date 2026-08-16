import { supabase } from "./supabaseClient";

// Moved out of src/App.jsx: selecting which professional to recommend depends on this,
// and selection is business logic, which PRODUCT_CONSTITUTION.md keeps out of UI. Also
// closes one line of the "trust score inline in App.jsx" debt in MASTER_CONTEXT.md §12.
export function trustScore({ rating = 0, isCertified, badgeTier }) {
  const badgeBonus = badgeTier === "elite" ? 12 : badgeTier === "top" ? 6 : 0;
  const score = rating * 20 + (isCertified ? 8 : 0) + badgeBonus;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// The customer-side mirror of pro_matches_request() (migration 0005). That function is
// an RLS predicate answering "may this pro see this request?" and needs a request row
// that doesn't exist yet when the canvas recommends someone — so the same criteria are
// expressed here instead: offers the service, not paused, certified when the service
// demands it, same city when both are known.
//
// Two places now encode one matching rule, which is a real drift risk worth naming: if
// either changes, change both. Consolidating them belongs with the genuine ranking work
// in Execution Roadmap Epic 09, not here.
//
// Returns the single highest-trust match, or null. One professional, not a list — §3 of
// EXPERIENCE_VISION.md: no comparing required.
export async function findBestProForService({ serviceId, city, certifiedOnly = false }) {
  const { data, error } = await supabase
    .from("pro_services")
    .select("pro_id, pro_profiles!inner ( profile_id, pro_type, paused, profiles ( full_name, avatar_url, city ), pro_stats ( rating_avg, rating_count, badge_tier, is_certified ) )")
    .eq("service_id", serviceId);
  if (error) throw error;

  const candidates = (data || [])
    .map((row) => {
      const pp = row.pro_profiles;
      if (!pp) return null;
      const stats = pp.pro_stats || {};
      return {
        id: pp.profile_id,
        name: pp.profiles?.full_name || "Pro",
        initials: initialsFrom(pp.profiles?.full_name),
        avatarUrl: pp.profiles?.avatar_url || null,
        city: pp.profiles?.city || null,
        proType: pp.pro_type,
        paused: !!pp.paused,
        rating: Number(stats.rating_avg) || 0,
        reviews: stats.rating_count || 0,
        badgeTier: stats.badge_tier || null,
        isCertified: !!stats.is_certified,
      };
    })
    .filter(Boolean)
    .filter((p) => !p.paused)
    .filter((p) => (certifiedOnly ? p.isCertified : true))
    .filter((p) => !city || !p.city || p.city.toLowerCase() === city.toLowerCase());

  if (candidates.length === 0) return null;

  // Highest trust score wins, deliberately simple and legible. Real weighted ranking
  // (past performance, availability, distance) is Epic 09's job, not this card's.
  return candidates.sort((a, b) => trustScore(b) - trustScore(a))[0];
}

export function initialsFrom(name) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

// Epic 03 WP11 — the read switch. This is the pro's own offered-services list for their own
// dashboard (ProApp.jsx), never a read of someone else's — unlike fetchPortfolioItems and
// fetchTestimonials below in this epic's catalogue, which serve public profile viewing too
// and are deliberately NOT switched (see IMPLEMENTATION_ROADMAP.md §14). workspaceId is
// useAuth().activeWorkspace?.workspace_id (WP 03.09); falls back to the pre-Epic-03 pro_id
// filter when absent, the same row set workspace_id was backfilled from (WP 03.06/03.07).
export async function fetchProServices(proId, workspaceId) {
  const query = supabase.from("pro_services").select("service_id");
  const scoped = workspaceId ? query.eq("workspace_id", workspaceId) : query.eq("pro_id", proId);
  const { data, error } = await scoped;
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
//
// The name and avatar come from the identity engine as of Epic 02 WP06, through
// `resolve_identity_display` — the operation SYSTEM_ARCHITECTURE.md §6.1 calls "resolve an
// internal person-reference to display information, subject to erasure".
//
// It is a resolver rather than a read of `identity.identities` because that row also holds
// email and phone, which today are private until a booking exists. One RLS policy cannot
// serve both column groups, and there is no field-level security in this design — ADR-0023
// has the measurement. The resolver's return type has no column for a contact channel, so
// this path cannot leak one however it is called.
export async function fetchPublicProInfo(proIds) {
  const ids = [...new Set(proIds)];
  if (ids.length === 0) return {};

  const { data, error } = await supabase
    .from("pro_profiles")
    .select("profile_id, pro_type, bio, profiles(full_name, avatar_url), pro_stats(rating_avg, rating_count, badge_tier, is_certified)")
    .in("profile_id", ids);
  if (error) throw error;

  const display = await resolveDisplay(ids);

  return Object.fromEntries(
    data.map((row) => {
      // The branch is on whether the RESOLVER ANSWERED, not on whether it had a row for
      // this person, and the difference is erasure.
      //
      // A resolver that answered with no row for someone is saying they resolve to
      // nothing — §11.4's erasure, where "the person reference remains valid as a key and
      // resolves to nothing". Falling back to `profiles` there would put an erased
      // person's name back on screen, which is the one outcome erasure exists to prevent.
      //
      // Falling back only when the resolver is unavailable covers the case that needs it:
      // a database without Epic 02's migrations, where the RPC does not exist.
      const resolved = display?.[row.profile_id];
      const fullName = display ? resolved?.full_name : row.profiles?.full_name;
      const avatarUrl = display ? resolved?.avatar_url : row.profiles?.avatar_url;

      return [
        row.profile_id,
        {
          id: row.profile_id,
          name: fullName || "Pro",
          initials: initialsFrom(fullName),
          avatarUrl: avatarUrl || null,
          proType: row.pro_type,
          bio: row.bio || null,
          rating: Number(row.pro_stats?.rating_avg) || 0,
          reviews: row.pro_stats?.rating_count || 0,
          badgeTier: row.pro_stats?.badge_tier || null,
          isCertified: row.pro_stats?.is_certified || false,
        },
      ];
    })
  );
}

// Returns display info keyed by the person's auth user id, or null if the resolver is
// unavailable — which is the signal to keep using the embedded profile above.
async function resolveDisplay(ids) {
  const { data, error } = await supabase.rpc("resolve_identity_display", { p_auth_user_ids: ids });
  if (error) {
    console.warn("identity display resolution unavailable, falling back to profiles:", error.message);
    return null;
  }
  return Object.fromEntries((data ?? []).map((row) => [row.auth_user_id, row]));
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
