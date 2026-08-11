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
import { translateMessage } from "../lib/translate";
import { messagesNeedingTranslation } from "../lib/conversationSelectors.js";

export function ConversationSheet({ conversationId, userId, otherName, onClose }) {
  const { t, langCode } = useLang();
  const [messages, setMessages] = useState(null);
  const [draft, setDraft] = useState("");
  const [showOriginalFor, setShowOriginalFor] = useState(() => new Set());
  const translatingRef = useRef(new Set());

  const refresh = () => fetchMessages(conversationId).then(setMessages);

  useEffect(() => {
    refresh();
    markConversationRead(conversationId, userId);
    const unsubscribe = subscribeToMessages(conversationId, () => {
      refresh();
      markConversationRead(conversationId, userId);
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

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
        await saveMessageTranslation(m.id, langCode, translated);
        setMessages((cur) =>
          cur?.map((x) => (x.id === m.id ? { ...x, translations: { ...x.translations, [langCode]: translated } } : x)) ?? cur
        );
      } catch {
        // ignore — original text stays displayed
      } finally {
        translatingRef.current.delete(m.id);
      }
    });
  }, [messages, langCode, userId]);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    await sendMessage({ conversationId, senderId: userId, body });
    await refresh();
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
    <Drawer onClose={onClose}>
      <div className="sheet-title">{otherName}</div>
      <div className="chat-scroll">
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
        <button onClick={send}><Send size={16} /></button>
      </div>
    </Drawer>
  );
}
