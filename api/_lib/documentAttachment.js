// Shared by every endpoint that hands an already-attached document to the AI Gateway as
// a content block (api/ask-about-item.js first, api/suggest-item-details.js now) — one
// place holding the security-relevant part of that path (which file extensions are
// trusted, how big a file is allowed to be) rather than two copies that could quietly
// drift apart. Extracted from ask-about-item.js during the Document Understanding slice;
// behaviour is unchanged from what that endpoint already did.
//
// Anthropic's own documented content-block media types for a PDF/image; anything else
// found on a document's storage_path is skipped rather than sent as a mislabeled
// attachment. property.documents has no stored mime-type column (0055) — the file's own
// extension is the only signal available.
const EXTENSION_MEDIA_TYPES = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

export function extensionOf(storagePath) {
  const match = /\.([a-z0-9]+)$/i.exec(storagePath || "");
  return match ? match[1].toLowerCase() : null;
}

/**
 * Downloads one already-attached document and prepares it as an AI Gateway content
 * block (`{ mediaType, data }`, base64) — the same shape `reason()`'s own `documents`/
 * `images` params expect. Returns `{ attachment: null, reason: "..." }` rather than
 * throwing on every reason a document can't be used: an unrecognized extension, a file
 * over the size cap, or a download failure — a caller decides for itself whether that's
 * a hard error or a "continue without it," exactly as ask-about-item.js already did
 * before this was pulled out into its own function.
 */
export async function fetchDocumentAttachment(supabase, { storageBucket, storagePath }) {
  const extension = extensionOf(storagePath);
  const mediaType = EXTENSION_MEDIA_TYPES[extension];
  if (!mediaType) {
    return { attachment: null, reason: "unsupported_type" };
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage.from(storageBucket).download(storagePath);
  if (downloadError || !fileBlob) {
    return { attachment: null, reason: "download_failed" };
  }
  if (fileBlob.size > MAX_DOCUMENT_BYTES) {
    return { attachment: null, reason: "too_large" };
  }

  const buffer = Buffer.from(await fileBlob.arrayBuffer());
  const kind = mediaType === "application/pdf" ? "document" : "image";
  return { attachment: { kind, mediaType, data: buffer.toString("base64") }, reason: null };
}
