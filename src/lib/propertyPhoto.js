// Client side of api/property-photo.js — the Street View hero for a customer's own home.
//
// Returns an object URL for the image, or null whenever there is no picture to show: not
// configured on this deployment (501), no confirmed address / no imagery (404), signed out, or
// any failure. null is the normal, expected answer on many deployments and for many homes, so
// callers fall back to their gradient — never an error state, never a stand-in photo.
//
// The result (including null) is remembered for the life of the page per property: the server
// bills every real image request, and a deployment that isn't configured should be asked once,
// not on every visit to My Home.
import { supabase } from "./supabaseClient";

const cache = new Map();

export function clearPropertyPhotoCache() {
  cache.forEach((promise) => promise.then((url) => { if (url) URL.revokeObjectURL(url); }).catch(() => {}));
  cache.clear();
}

async function load(propertyId) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const res = await fetch(`/api/property-photo?propertyId=${encodeURIComponent(propertyId)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "";
    if (!type.startsWith("image/")) return null; // e.g. a dev server's HTML 404 page
    return URL.createObjectURL(await res.blob());
  } catch {
    return null;
  }
}

export function fetchPropertyPhotoUrl(propertyId) {
  if (!propertyId) return Promise.resolve(null);
  if (!cache.has(propertyId)) cache.set(propertyId, load(propertyId));
  return cache.get(propertyId);
}
