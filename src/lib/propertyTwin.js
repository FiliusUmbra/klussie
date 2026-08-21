// Platform Activation Slice 2, WP 2.4's own real acceptance bar — not "the grant row
// exists," but "a professional who accepts a booking can see the customer's own
// Location/Asset/Document twin for the property concerned." 0161/0162 (merged) built the
// scoped grant and the consumer that creates it; nothing on the client ever read it. This
// is that read.
//
// api.resolve_property()/api.locations_for_property()/api.my_assets()/api.my_documents()
// are the SAME functions every property-owning customer already reads through — a
// professional holding a real, active, scoped `workspace.memberships` row (role =
// 'contractor', scope = {propertyId}) satisfies their RLS/membership checks exactly the
// same way an owner does (0161's own OR-branch), no separate "pro view" of a property
// exists or should exist. One read path, two kinds of caller.
//
// NO CLIENT-SIDE PERMISSION LOGIC HERE — the calls below either return rows or they
// don't, exactly as they do for a customer. A pro with no scoped grant yet (a job with no
// property/asset/location attached, or a grant that expired) gets empty arrays, not an
// error — the same "fail toward nothing shown, not toward crashing" idiom this schema's
// own RLS-backed reads already establish everywhere else.
import { supabase } from "./supabaseClient";

// One property's locations, assets and documents, resolved in parallel. Returns null for
// `property` (and empty arrays for the rest) when the caller has no visibility at all —
// the deliberate no-scope-yet case 0162's own consumer names, not a fetch failure.
export async function fetchPropertyTwin(propertyId) {
  if (!propertyId) return { property: null, locations: [], assets: [], documents: [] };

  const [
    { data: propertyRows, error: propertyError },
    { data: locations, error: locationsError },
    { data: assets, error: assetsError },
    { data: documents, error: documentsError },
  ] = await Promise.all([
    supabase.schema("api").rpc("resolve_property", { p_property_id: propertyId }),
    supabase.schema("api").rpc("locations_for_property", { p_property_id: propertyId }),
    supabase.schema("api").rpc("my_assets", { p_property_id: propertyId }),
    supabase.schema("api").rpc("my_documents", { p_property_id: propertyId }),
  ]);
  if (propertyError) throw propertyError;
  if (locationsError) throw locationsError;
  if (assetsError) throw assetsError;
  if (documentsError) throw documentsError;

  return {
    property: propertyRows?.[0] || null,
    locations: locations || [],
    assets: assets || [],
    documents: documents || [],
  };
}
