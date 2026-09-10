// One conversation, with live updates and on-the-fly translation.
//
// A customer writing Dutch and a professional reading French is the normal case on
// klussie, not an edge case — so incoming messages are translated into the viewer's UI
// language and the original stays one tap away. Which messages still need a translation
// is decided by src/lib/conversationSelectors.js: picking the same message twice would
// mean paying for a translation klussie already has.
import { useState, useEffect, useRef } from "react";
import { Send } from "lucide-react";
import { useLang } from "../lib/lang";
import { Drawer } from "../design-system";
import { fetchMessages, sendMessage, markConversationRead, saveMessageTranslation, subscribeToMessages } from "../lib/messages";
import { markConversationNotificationsSeen } from "../lib/notifications.js";
import { translateMessage } from "../lib/translate";
import { messagesNeedingTranslation } from "../lib/conversationSelectors.js";

export function ConversationSheet({ conversationId, userId, workspaceId, otherName, onClose }) {
  const { t, langCode } = useLang();
  const [messages, setMessages] = useState(null);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState("");
  const [showOriginalFor, setShowOriginalFor] = useState(() => new Set());
  const translatingRef = useRef(new Set());
  const scrollRef = useRef(null);

  // Found live during a UX review, 2026-09-07: nothing here ever scrolled .chat-scroll
  // at all. A conversation with enough history to need scrolling opened showing the
  // OLDEST messages, not the most recent exchange, and sending a message while
  // scrolled up left that new message off-screen -- the sender's own words, invisible
  // without a manual scroll. Runs on every `messages` change (open, send, receive, and
  // a translation landing on an old message) rather than only "new" ones -- this
  // codebase already re-fetches and re-renders the whole list on any of those (refresh()
  // above), so scrolling at the same coarse granularity matches it rather than adding a
  // second, finer-grained notion of "what changed."
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const refresh = () => fetchMessages(conversationId, workspaceId).then(setMessages);

  useEffect(() => {
    refresh();
    markConversationRead(conversationId, workspaceId);
    // Slice 4, WP 4.2 — the Notification engine's write contract (WP 4.0) gets its first
    // real caller here: opening a conversation is the moment any notification naming it
    // is genuinely "seen" and "acted on," the same real-world event
    // markConversationRead() above already reacts to. See src/lib/notifications.js's own
    // header for why this ships instead of a separate, duplicate inbox screen.
    markConversationNotificationsSeen(conversationId, userId);
    const unsubscribe = subscribeToMessages(conversationId, () => {
      refresh();
      markConversationRead(conversationId, workspaceId);
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, workspaceId]);

  // Lazily translate any message from the other party that's missing a cached
  // translation for the viewer's current UI language — shows the original instantly,
  // then swaps in the translation once it lands (falls back silently on error rather
  // than blocking the conversation).
  useEffect(() => {
    if (!messages) return;
    const toTranslate = messagesNeedingTranslation(messages, {
      userId,
      langCode,
      inFlight: translatingRef.current,
    });
    toTranslate.forEach(async (m) => {
      translatingRef.current.add(m.id);
      try {
        const translated = await translateMessage({ text: m.body, targetLocale: langCode });
        await saveMessageTranslation(m.id, langCode, translated, userId, workspaceId);
        setMessages((cur) =>
          cur?.map((x) => (x.id === m.id ? { ...x, translations: { ...x.translations, [langCode]: translated } } : x)) ?? cur
        );
      } catch {
        // ignore — original text stays displayed
      } finally {
        translatingRef.current.delete(m.id);
      }
    });
  }, [messages, langCode, userId, workspaceId]);

  // Found by code audit: no try/catch at all, and the draft was cleared optimistically
  // before the send even started -- a real refusal (RLS, network) meant the words the
  // customer just typed were gone, with no error shown and no way to recover them short
  // of retyping from memory. Restoring the draft on failure, not just showing an error,
  // is the actual fix: the message text itself is the thing that must never be
  // silently destroyed.
  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    setSendError("");
    try {
      await sendMessage({ conversationId, senderId: userId, senderWorkspaceId: workspaceId, body });
      await refresh();
    } catch {
      setDraft(body);
      setSendError(t.chatSendFailed);
    }
  };

  const toggleOriginal = (id) => {
    setShowOriginalFor((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Drawer onClose={onClose} closeLabel={t.closeBtn}>
      <div className="sheet-title">{otherName || t.counterpartFallbackName}</div>
      <div className="chat-scroll" ref={scrollRef}>
        {messages && messages.length === 0 && (
          <p className="chat-empty-state">{t.messagesConversationEmpty}</p>
        )}
        {(messages || []).map((m) => {
          const isMine = m.senderId === userId;
          const translated = !isMine ? m.translations?.[langCode] : null;
          const showingOriginal = showOriginalFor.has(m.id);
          const displayText = translated && !showingOriginal ? translated : m.body;
          return (
            <div key={m.id} className={"chat-bubble " + (isMine ? "chat-bubble-me" : "chat-bubble-them")}>
              <div>{displayText}</div>
              {translated && (
                <button type="button" className="chat-translate-toggle" onClick={() => toggleOriginal(m.id)}>
                  {showingOriginal ? t.viewTranslationBtn : t.viewOriginalBtn}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="chat-input-row">
        <input
          placeholder={t.messagePlaceholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
        />
        {/* Found live during a UX review, 2026-09-07: icon-only, no visible text and no
            aria-label -- a screen reader announced this as an unnamed button, unlike every
            other icon-only control in the app (e.g. MyItemsPanel's "Ruimte toevoegen"/
            "Document toevoegen"), which already name themselves this way. */}
        <button type="button" aria-label={t.chatSendBtn} onClick={send}><Send size={16} /></button>
      </div>
      {sendError && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start" }}>{sendError}</div>}
    </Drawer>
  );
}
