// The Street View photo for a property, or null (see lib/propertyPhoto.js). Resolves after
// first paint so the gradient cover is never delayed by it.
import { useEffect, useState } from "react";
import { fetchPropertyPhotoUrl } from "../lib/propertyPhoto.js";

export function usePropertyPhoto(propertyId) {
  const [state, setState] = useState({ id: null, url: null });
  useEffect(() => {
    let cancelled = false;
    if (!propertyId) return undefined;
    fetchPropertyPhotoUrl(propertyId).then((url) => { if (!cancelled) setState({ id: propertyId, url }); });
    return () => { cancelled = true; };
  }, [propertyId]);
  // A result for a previous property must never show on the next one.
  return state.id === propertyId ? state.url : null;
}
