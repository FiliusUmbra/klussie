/**
 * The original file name of an uploaded document. Storage paths are always
 * `<workspaceId>/<documentId>/<filename>` (createDocument() above), so the name is the
 * last segment — decoded in case it was ever stored percent-encoded. Returns "" for a
 * document with no stored path (nothing to name).
 */
export function documentFileName(doc) {
  const path = doc?.storagePath;
  if (!path) return "";
  const last = path.split("/").pop() || "";
  try { return decodeURIComponent(last); } catch { return last; }
}
