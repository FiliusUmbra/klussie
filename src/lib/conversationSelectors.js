// Read-only questions about conversations and their messages, kept separate from
// src/lib/messages.js so they can be tested without standing up a Supabase client.
//
// Extracted from src/App.jsx: the unread total was recomputed inline in two different
// bottom navs, and the "which messages still need translating" filter was a three-clause
// condition buried in an effect — the one piece of that effect where getting it wrong
// costs real money, since a message picked twice is a second model call for a translation
// klussie already has.

/** Total unread messages across every conversation — the Messages tab's badge. */
export function unreadTotal(conversations) {
  return (conversations || []).reduce((sum, c) => sum + c.unreadCount, 0);
}

/**
 * Messages that still need translating for this viewer.
 *
 * Three things disqualify a message: the viewer wrote it (nobody needs their own words
 * back), a translation for this locale is already cached, or a request for it is already
 * in flight. `inFlight` is passed in rather than tracked here because it belongs to the
 * component's lifetime, not to this decision.
 *
 * Found by code audit, 2026-09-13: `inFlight` used to be keyed by message id alone. A
 * request in flight for one language blocked a *different* language's request for the
 * same message -- not merely delayed, but silently dropped if the viewer switched
 * languages mid-request and the original request then failed (a real, if rare, network/AI
 * hiccup): its own catch swallows the error without a setMessages() call, so nothing
 * re-triggers the effect afterward, and this message never gets re-checked for the
 * language the viewer is actually reading in until unrelated conversation activity
 * happens to fire the effect again. Keyed by `${id}:${langCode}` instead so switching
 * languages while an old request for the same message is still outstanding can never
 * block (or lose) the new one -- the two are now entirely independent requests.
 */
export function messagesNeedingTranslation(messages, { userId, langCode, inFlight }) {
  return (messages || []).filter(
    (m) => m.senderId !== userId && !m.translations?.[langCode] && !inFlight.has(`${m.id}:${langCode}`)
  );
}
