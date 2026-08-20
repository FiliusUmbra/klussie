// The photos attached to a request, as a horizontal strip of thumbnails linking to the
// full image. Fetches its own photos so every surface that renders a request — the
// customer's detail sheet, a professional's lead card, the quote sheet — gets them
// without each of those having to thread photo loading through its own state.
import { useState, useEffect } from "react";
import { fetchRequestPhotos } from "../lib/requestPhotos";

// legacy: true when requestId is a lead's own id (fetchProLeads() stays on legacy — see
// src/lib/requestPhotos.js's own header for why this can't be inferred from the id alone).
export function RequestPhotosStrip({ requestId, legacy = false }) {
  const [photos, setPhotos] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetchRequestPhotos(requestId, { legacy }).then((p) => { if (!cancelled) setPhotos(p); });
    return () => { cancelled = true; };
  }, [requestId, legacy]);
  if (!photos || photos.length === 0) return null;
  return (
    <div className="photo-strip">
      {photos.map((p) => (
        <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="photo-strip-thumb">
          <img src={p.url} alt="" />
        </a>
      ))}
    </div>
  );
}
