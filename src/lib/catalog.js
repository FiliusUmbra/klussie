import { Sparkles, Truck, Hammer, Wrench, BookOpen, PartyPopper, BadgeCheck, MoreHorizontal } from "lucide-react";
import { supabase } from "./supabaseClient";

const ICONS = { Sparkles, Truck, Hammer, Wrench, BookOpen, PartyPopper, BadgeCheck, MoreHorizontal };

// Fetches the catalog from Supabase and reshapes it into the same
// { CATS, CAT_I18N, BASE_SERVICES, SERVICE_I18N } shape the app used to get
// from hardcoded constants, so components reading through useLang() need no changes.
export async function fetchCatalog() {
  const [
    { data: categories, error: catErr },
    { data: catTranslations, error: catTrErr },
    { data: services, error: svcErr },
    { data: svcTranslations, error: svcTrErr },
    { data: stats, error: statsErr },
  ] = await Promise.all([
    supabase.from("categories").select("id, icon, sort_order").order("sort_order"),
    supabase.from("category_translations").select("category_id, locale, name"),
    supabase.from("services").select("id, category_id, mode, base_price, certified_only").eq("active", true),
    supabase.from("service_translations").select("service_id, locale, name, blurb"),
    supabase.from("service_stats").select("service_id, pro_count, rating_avg, review_count"),
  ]);

  if (catErr) throw catErr;
  if (catTrErr) throw catTrErr;
  if (svcErr) throw svcErr;
  if (svcTrErr) throw svcTrErr;
  if (statsErr) throw statsErr;

  const CATS = categories.map((c) => ({ id: c.id, icon: ICONS[c.icon] || MoreHorizontal }));

  const CAT_I18N = {};
  for (const row of catTranslations) {
    (CAT_I18N[row.locale] ??= {})[row.category_id] = row.name;
  }

  const statsByService = Object.fromEntries(stats.map((s) => [s.service_id, s]));

  const BASE_SERVICES = services.map((s) => {
    const stat = statsByService[s.id] ?? { pro_count: 0, rating_avg: 0, review_count: 0 };
    return {
      id: s.id,
      cat: s.category_id,
      mode: s.mode,
      base: Number(s.base_price),
      certifiedOnly: s.certified_only,
      pros: stat.pro_count,
      rating: Number(stat.rating_avg) || 0,
      reviews: stat.review_count,
    };
  });

  const SERVICE_I18N = {};
  for (const row of svcTranslations) {
    (SERVICE_I18N[row.locale] ??= {})[row.service_id] = { name: row.name, blurb: row.blurb };
  }

  return { CATS, CAT_I18N, BASE_SERVICES, SERVICE_I18N };
}
