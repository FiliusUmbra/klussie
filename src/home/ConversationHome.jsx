// The authenticated customer's homepage — the conversational front door.
//
// ADR-0033 (2026-09-15, supersedes ADR-0007/0008) gave My Home and My Items their own
// bottom-nav destination (MyHomeScreen.jsx) — this file went from three segmented
// sections down to one, the conversational canvas alone. `onOpenMyHome` is how the
// empty-state "set up my home first" CTA (HomeTodayCard.jsx, via KlussiePanel.jsx) still
// reaches it: CustomerApp.jsx passes a real bottom-nav tab switch now, not an internal
// section change.
//
// Composition only. The greeting band, the trust-signal rules, today's priority, the
// intent sequence and the conversation state machine all live in hooks and lib
// modules; this file decides what sits where.
import { useRef } from "react";
import { TrustStrip } from "../design-system";
import { useLang } from "../lib/lang";
import { useAuth } from "../lib/auth.jsx";
import { HomeHero } from "./HomeHero.jsx";
import { KlussiePanel } from "./KlussiePanel.jsx";
import { useHomeContext } from "./useHomeContext.js";
import { useConversation } from "./useConversation.js";

export function ConversationHome({ onStart, requests = [], onOpenRequest, onOpenMyHome }) {
  const { t, fmt, serviceInfo, proBadgeLabel, CATS, catName } = useLang();
  const { profile } = useAuth();
  const photoInputRef = useRef(null);

  const homeCtx = useHomeContext({ t, profile, requests });
  const conv = useConversation({ onStart });

  const openRequest = onOpenRequest || (() => {});
  const openMyHome = onOpenMyHome || (() => {});

  return (
    <div className="home">
      <HomeHero greeting={homeCtx.greeting} question={t.homeQuestion} />

      <div className="home-body">
        <KlussiePanel
          t={t}
          fmt={fmt}
          serviceInfo={serviceInfo}
          proBadgeLabel={proBadgeLabel}
          homeCtx={homeCtx}
          conv={conv}
          photoInputRef={photoInputRef}
          onOpenRequest={openRequest}
          onSetUpHome={openMyHome}
          CATS={CATS}
          catName={catName}
          // ADR-0033 — opens AiIntakeSheet fresh, at its own compose stage (the category
          // grid), rather than only ever reachable pre-seeded with a result the
          // conversation already ran (useConversation.js's own onStart call, below).
          // categoryId is the tapped tile's own id, or null from "More" — either way it
          // becomes AiIntakeSheet's initialCategoryId, never text/photos/result.
          onBrowseCategories={(categoryId) => onStart({ initialCategoryId: categoryId ?? null })}
        />

        {/* capture="environment" opens the rear camera directly on mobile rather than a
            file browser. */}
        <input ref={photoInputRef} type="file" accept="image/*" capture="environment" hidden onChange={conv.pickPhoto} />

        <TrustStrip items={homeCtx.trustItems} label={t.trustStripLabel} />
      </div>
    </div>
  );
}
