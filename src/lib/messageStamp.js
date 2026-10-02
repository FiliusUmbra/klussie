// Time-of-day for today's messages, a date for anything older — the drafted Messages
// rows show one short stamp, not both. `now` injectable for tests.
export function messageStamp(ts, { fmtDate, langCode, now = new Date() }) {
  const d = new Date(ts);
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(langCode, { hour: "2-digit", minute: "2-digit" });
  }
  return fmtDate(ts);
}
