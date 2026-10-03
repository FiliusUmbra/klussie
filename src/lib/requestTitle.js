// A request's display title. The catalog name wins; but a request whose service isn't in
// the loaded catalog (retired service, a catalog fetch that came back short) used to render
// as a blank title — found live on staging, 2026-10-03, where eight requests showed an
// empty row heading. The customer's own first words describe it far better than nothing,
// and `fallback` (a real, translated word the caller already has) covers the last case.
const MAX = 40;

export function requestTitle(request, serviceInfo, fallback = "") {
  const name = serviceInfo(request.serviceId)?.name;
  if (name) return name;
  const details = (request.answers?.details || "").trim().replace(/\s+/g, " ");
  if (details) return details.length > MAX ? `${details.slice(0, MAX - 1).trimEnd()}…` : details;
  return fallback;
}
