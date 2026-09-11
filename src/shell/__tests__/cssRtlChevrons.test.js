// A regression guard for a real RTL gap, found by code audit 2026-09-11: several "this
// leads forward" chevrons — HomeTodayCard.jsx's own Today card (the single most
// prominent card on the whole homepage), KlussiePanel.jsx's own Active Requests row,
// RequestsList.jsx's own JobCard footer (the customer's real, reachable Requests tab),
// and the homepage composer's own send button (KlussiePanel.jsx's own
// icon={<ChevronRight/>}, found in a follow-up pass immediately after the first three —
// the one screen every message send action in the app actually goes through) — never got
// the `[dir="rtl"]{ transform:scaleX(-1); }` flip myHomeParts.jsx's own identical-meaning
// `.timeline-card-chevron`/`.trusted-pro` chevrons already have. For an Arabic or Persian
// reader, a chevron pointing right in a right-to-left layout points backward, not
// forward — the wrong direction on four real, everyday screens.
//
// Deliberately plain substring checks on the raw CSS text, matching
// cssTokenContrast.test.js/cssFocusVisibility.test.js's own established idiom in this
// same directory, for the same reason: every real occurrence here is one literal rule.
import { describe, it, expect } from "vitest";
import { APP_CSS } from "../appStyles.js";
import { HOME_CSS } from "../../home/homeStyles.js";

describe("RTL — every 'leads forward' chevron flips direction", () => {
  it("keeps the two already-correct flips this fix matches (regression guard, not new coverage)", () => {
    expect(HOME_CSS).toContain('[dir="rtl"] .timeline-card-chevron{ transform:translateY(-50%) scaleX(-1); }');
    expect(HOME_CSS).toContain('[dir="rtl"] .trusted-pro > svg:last-child{ transform:scaleX(-1); }');
  });

  it("flips the Today card's own chevron", () => {
    expect(HOME_CSS).toContain('[dir="rtl"] .today-card-chev{ transform:scaleX(-1); }');
  });

  it("flips the Active Requests row's own chevron", () => {
    expect(HOME_CSS).toContain('[dir="rtl"] .home-active-chevron{ transform:scaleX(-1); }');
  });

  it("flips the JobCard footer's own chevron (RequestsList.jsx's real Requests tab)", () => {
    expect(APP_CSS).toContain('[dir="rtl"] .ticket-foot-chevron{ transform:scaleX(-1); }');
  });

  it("flips the homepage composer's own send-button icon", () => {
    expect(APP_CSS).toContain('[dir="rtl"] .conv-textrow-send svg{ transform:scaleX(-1); }');
  });
});

// Same bug family, same audit pass, one icon over: Send (lucide-react) is a paper plane
// pointing toward where the message is headed — the same "leads forward" meaning as a
// chevron, and just as silently unflipped in every real place it's used.
describe("RTL — every send icon flips direction", () => {
  it("flips ConversationSheet.jsx's own message-send button (every real conversation in the app)", () => {
    expect(APP_CSS).toContain('[dir="rtl"] .chat-input-row button svg{ transform:scaleX(-1); }');
  });

  it("flips the shared .send-icon class (AiIntakeSheet.jsx's final submit, SendQuoteSheet.jsx's quote send)", () => {
    expect(APP_CSS).toContain('[dir="rtl"] .send-icon{ transform:scaleX(-1); }');
  });
});

// Different bug, same underlying gap, found in the same pass: text-align:left and
// margin-right/padding-left are physical-direction CSS -- they never flip for RTL at
// all, [dir="rtl"] override or not. Unlike an icon transform, these have a real,
// self-resolving fix: CSS logical properties (text-align:start,
// margin-inline-end, padding-inline-start), already this file's own established idiom
// for .ai-intake-cta, just not yet applied to the conversation canvas's own recap,
// AI-understanding line, professional card, composer pill, trust strip separator, or
// analysis bullet list. No [dir="rtl"] selector is needed for any of these — the
// logical property itself follows the `dir` attribute, so the regression guard is
// simply that the physical property is gone and the logical one is present.
describe("RTL — physical-direction CSS replaced with logical properties that self-resolve", () => {
  it("the homepage composer pill aligns text and insets padding by reading direction, not hardcoded left", () => {
    expect(APP_CSS).toContain("padding-inline-end:var(--space-2); padding-inline-start:var(--space-4)");
    expect(APP_CSS).toContain("text-align:start; min-height:44px;");
    expect(APP_CSS).not.toMatch(/\.conv-textrow\{[^}]*padding:0 var\(--space-2\) 0 var\(--space-4\)/);
  });

  it("the AI-understanding line, the recap, and the professional card all align by reading direction", () => {
    expect(APP_CSS).toContain(".conv-understanding-line{ font-size:13px; font-weight:600; color:var(--ink); text-align:start; }");
    expect(APP_CSS).toContain(".conv-recap{ text-align:start; }");
    expect(APP_CSS).toContain(".conv-pro{ display:flex; flex-direction:column; gap:var(--space-3); text-align:start; }");
  });

  it("the trust-strip separator dot sits toward the next item in reading order, not hardcoded right", () => {
    expect(APP_CSS).toContain('.trust-strip-item + .trust-strip-item::before{ content:"·"; color:var(--line-strong); margin-inline-end:var(--space-2); }');
  });

  it("the AI analysis summary's bullet list indents from the start of the line, not hardcoded left", () => {
    expect(APP_CSS).toContain(".ai-analysis-summary ul{ margin:4px 0 0; padding-inline-start:18px; }");
  });
});
