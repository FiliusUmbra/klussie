// Styles for the customer homepage.
//
// A separate string concatenated into App.jsx's <style> block rather than more lines
// inside it: the CSS convention (one injected stylesheet, custom properties as the
// token layer) is unchanged, only its physical home. No Tailwind, no CSS-in-JS
// runtime, no second styling system — DESIGN_SYSTEM.md's Final Rule.
//
// Spacing uses the --space-* scale throughout. Logical properties (inset-inline-*,
// padding-inline, text-align:start) rather than left/right, so Arabic keeps working —
// ACCESSIBILITY.md confirms dir="rtl" is real and must not be quietly broken.

export const HOME_CSS = `
/* ---- homepage shell ---- */
.home{ text-align:start; display:flex; flex-direction:column; }
.home-body{
  display:flex; flex-direction:column; gap:var(--space-4);
  padding:var(--space-4) var(--space-5) calc(var(--space-6) + env(safe-area-inset-bottom, 0px));
}

/* ---- hero ----
   The image is decorative and the text sits on top of it, so the scrim is doing real
   accessibility work rather than styling: white on the scrimmed base measures ~9.6:1,
   comfortably over the 4.5:1 AA floor, and it holds over the fallback surface too
   because the scrim is painted on both. aspect-ratio reserves the box before the asset
   loads, so nothing below it jumps (CLS). */
.home-hero{ position:relative; }
.home-hero-media{
  position:relative; width:100%; aspect-ratio:16/7; min-height:150px; max-height:220px;
  overflow:hidden; background:var(--sage-bg);
}
.home-hero-media-fallback{
  background:linear-gradient(160deg, var(--sage-bg) 0%, #CFE0CD 55%, var(--amber-bg) 100%);
}
.home-hero-img{ width:100%; height:100%; object-fit:cover; display:block; }
/* Weighted to the bottom third, where the text actually sits, rather than spread
   evenly: an even scrim strong enough for AA at the greeting line turned the whole
   photograph into a dark rectangle — found in the visual review, not by reading the
   numbers. Measured against the artwork's own tone: white on the scrimmed base is
   ~6.7:1 at the top of the greeting and higher below it, over the 4.5:1 AA floor for
   normal text, while the upper half stays light enough to read as a room. */
.home-hero-scrim{
  position:absolute; inset:0;
  background:linear-gradient(180deg,
    rgba(22,35,28,0) 0%,
    rgba(22,35,28,0.08) 30%,
    rgba(22,35,28,0.70) 58%,
    rgba(22,35,28,0.90) 100%);
}
.home-hero-copy{
  position:absolute; inset-inline:0; bottom:0;
  padding:var(--space-4) var(--space-5) var(--space-4);
  display:flex; flex-direction:column; gap:var(--space-1);
}
.home-hero-greeting{
  margin:0; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase;
  color:rgba(255,255,255,0.88);
}
/* Fraunces here and nowhere else on this surface: DESIGN_SYSTEM.md reserves the display
   face for the one important heading, and this is it. */
.home-hero-question{
  margin:0; font-family:var(--font-display); font-weight:600; color:#fff; line-height:1.18;
  font-size:clamp(19px, 5.4vw, 24px);
  text-wrap:balance;
}

/* ---- section tabs ---- */
.seg-tabs{
  display:flex; gap:var(--space-1); background:var(--sage-bg); border-radius:999px;
  padding:var(--space-1);
}
.seg-tab{
  flex:1; min-height:44px; padding:var(--space-2) var(--space-2); border:none; background:none;
  border-radius:999px; cursor:pointer; font-family:var(--font-body); font-size:12.5px;
  font-weight:500; color:var(--forest-dark); line-height:1.2;
  transition:background var(--motion-base), color var(--motion-base);
}
/* Selected state is carried by fill, weight and an indicator — never by colour alone
   (WCAG 2.2 1.4.1). aria-selected carries it for assistive tech. */
.seg-tab-on{
  background:var(--surface); color:var(--forest); font-weight:700;
  box-shadow:var(--shadow-card);
}
.seg-tab-on::after{
  content:""; display:block; width:18px; height:2px; border-radius:2px;
  background:var(--forest); margin:3px auto 0;
}
.seg-tabpanel{ display:flex; flex-direction:column; gap:var(--space-4); }
.seg-tabpanel:focus{ outline:none; }

/* ---- intent suggestions ---- */
.intent-row{ display:flex; flex-wrap:wrap; gap:var(--space-2); }
/* Tightened after measuring: at the original padding the five Dutch labels wrapped
   onto four rows and cost 200px, pushing the composer most of the way down the
   viewport. The chips still hold their 44px touch target — only the horizontal
   padding gave way, which is what lets two of them share a row at 375px. */
.intent-chip{
  display:inline-flex; align-items:center; gap:var(--space-1); min-height:44px;
  padding:var(--space-2) var(--space-3); border-radius:999px;
  border:1px solid var(--line); background:var(--surface); color:var(--ink);
  font-family:var(--font-body); font-size:12px; font-weight:600; cursor:pointer;
  transition:background var(--motion-base), border-color var(--motion-base), transform var(--motion-fast);
}
.intent-chip:active{ transform:scale(0.98); }
.intent-chip-on{ background:var(--forest); border-color:var(--forest); color:#fff; }
.intent-chip-mark{ font-size:12px; opacity:0.7; }
.intent-chip-on .intent-chip-mark{ opacity:1; }

/* ---- the ask (composer + one follow-up question at a time) ---- */
.home-ask{ display:flex; flex-direction:column; gap:var(--space-2); }
.home-ask-head{ display:flex; align-items:baseline; justify-content:space-between; gap:var(--space-3); }
.home-ask-question{ margin:0; font-size:14px; font-weight:600; color:var(--ink); line-height:1.35; }
.home-ask-progress{ margin:0; font-size:11px; color:var(--ink-soft); white-space:nowrap; }
.home-ask-nav{ display:flex; gap:var(--space-4); }
.home-ask-link{
  border:none; background:none; padding:var(--space-2) 0; cursor:pointer;
  font-family:var(--font-body); font-size:12px; font-weight:600; color:var(--forest);
  text-decoration:underline; min-height:44px;
}
.home-ask-link:disabled{ color:var(--ink-soft); text-decoration:none; cursor:default; }

/* Voice and photo, inside the composer rather than as competing tiles above it. Same
   32px circle and same invisible 44px hit area as the send control. */
.conv-textrow-tool{
  position:relative; width:32px; height:32px; border-radius:50%;
  background:none; color:var(--forest); border:none; cursor:pointer; flex-shrink:0;
  display:flex; align-items:center; justify-content:center;
  transition:background var(--motion-base);
}
.conv-textrow-tool::after{ content:""; position:absolute; inset:-6px; border-radius:50%; }
.conv-textrow-tool:disabled{ opacity:0.4; cursor:default; }
.conv-textrow-tool-on{ background:var(--amber-bg); color:#8a5c14; }

/* ---- safety interruption ---- */
.safety-notice{
  background:var(--amber-bg); border-radius:16px; padding:var(--space-4);
  display:flex; flex-direction:column; gap:var(--space-3);
}
.safety-notice-head{ display:flex; align-items:center; gap:var(--space-2); }
.safety-notice-glyph{ color:#8a5c14; display:flex; }
.safety-notice-title{ margin:0; font-size:14px; font-weight:700; color:var(--ink); }
.safety-notice-body{ margin:0; font-size:12.5px; line-height:1.5; color:var(--ink); }
.safety-notice-actions{ display:flex; flex-direction:column; gap:var(--space-2); }
.safety-notice-actions .btn-secondary{ min-height:44px; background:var(--surface); }
.safety-notice-continue{ background:transparent; text-decoration:underline; }

/* ---- today for your home ---- */
.home-section-title{
  margin:0 0 var(--space-2); font-size:11.5px; font-weight:700; letter-spacing:0.06em;
  text-transform:uppercase; color:var(--ink-soft);
}
.today-card{
  display:flex; align-items:flex-start; gap:var(--space-3); width:100%; text-align:start;
  background:var(--surface); border:1px solid var(--line-soft); box-shadow:var(--shadow-card);
  border-radius:16px; padding:var(--space-4); cursor:pointer; font-family:var(--font-body);
  transition:box-shadow var(--motion-base), transform var(--motion-fast);
}
.today-card:active{ transform:scale(0.99); }
.today-card-empty{ flex-direction:column; align-items:stretch; cursor:default; border-style:dashed; border-color:var(--line-strong); }
.today-card-glyph{
  width:32px; height:32px; border-radius:10px; flex-shrink:0;
  display:flex; align-items:center; justify-content:center;
  background:var(--sage-bg); color:var(--forest-dark);
}
.today-card-amber .today-card-glyph{ background:var(--amber-bg); color:#8a5c14; }
.today-card-text{ flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
.today-card-title{ font-size:13.5px; font-weight:700; color:var(--ink); line-height:1.3; }
.today-card-body{ font-size:12px; color:var(--ink-soft); line-height:1.45; }
.today-card-cta{ margin-top:var(--space-1); font-size:12px; font-weight:700; color:var(--forest); }
.today-card-chev{ color:var(--ink-soft); flex-shrink:0; align-self:center; }
.today-empty-cta{ margin-top:var(--space-2); min-height:44px; }

/* ---- what is already running ---- */
.home-active-list{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:var(--space-2); }
.home-active-row{
  display:flex; align-items:center; gap:var(--space-3); width:100%; text-align:start;
  background:var(--surface); border:1px solid var(--line-soft); border-radius:12px;
  padding:var(--space-3) var(--space-4); min-height:44px; cursor:pointer;
  font-family:var(--font-body); color:var(--ink-soft);
}
.home-active-text{ flex:1; min-width:0; display:flex; flex-direction:column; }
.home-active-name{ font-size:13px; font-weight:600; color:var(--ink); }
.home-active-state{ font-size:11.5px; color:var(--ink-soft); }

/* ---- my home / my items ---- */
.home-panel{ display:flex; flex-direction:column; gap:var(--space-4); }
.home-panel-question{ margin:0; font-size:15px; font-weight:700; color:var(--ink); line-height:1.35; }
.home-group{ display:flex; flex-direction:column; gap:var(--space-2); }
.home-group-title{
  margin:0; font-size:13px; font-weight:700; color:var(--ink);
  display:flex; align-items:baseline; justify-content:space-between; gap:var(--space-2);
}
.home-group-count{ font-family:var(--font-mono); font-size:11px; font-weight:500; color:var(--ink-faint); }
.home-group-empty{ margin:0; font-size:12px; color:var(--ink-soft); line-height:1.45; }

/* ---- My Items, WP 1.3: the location tree, maintenance list, document list ---- */
.location-tree{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:var(--space-1); }
.location-tree-root > .location-node{ font-weight:600; }
.location-node .location-tree{ margin-inline-start:var(--space-4); padding-block-start:var(--space-1); font-weight:400; }
.location-node-name{ display:flex; align-items:baseline; gap:var(--space-2); font-size:13px; color:var(--ink); }
.location-node-type{ font-size:11px; color:var(--ink-faint); }

.maintenance-list, .document-list{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:var(--space-2); }
.maintenance-row, .document-row{
  display:flex; align-items:baseline; justify-content:space-between; gap:var(--space-2);
  font-size:13px; color:var(--ink);
}
.maintenance-row-title, .document-row-caption{ flex:1; min-width:0; }
.maintenance-row-due, .document-row-validity{ font-size:11.5px; color:var(--ink-soft); flex:none; }

/* ---- My Items, WP 1.8: the Location/Document section "+" action, and the picked-file
   row DocumentUploadSheet shows once a file is chosen ---- */
.home-section-action{
  display:inline-flex; align-items:center; justify-content:center;
  width:22px; height:22px; flex:none; padding:0;
  border:none; border-radius:999px; background:var(--sage-bg); color:var(--forest-dark); cursor:pointer;
}
.document-file-picked{
  display:flex; align-items:center; gap:var(--space-2);
  font-size:12.5px; color:var(--ink); padding:var(--space-3);
  background:var(--sage-bg); border-radius:10px;
}

/* ---- My Home: the property record ---- */

/* The header is a quiet band, not a stat dashboard — the brief asks for a calm record,
   and three numbers in boxes is the enterprise layout it rules out. */
.property-header{
  display:flex; flex-direction:column; gap:var(--space-2);
  background:var(--sage-bg); border-radius:14px; padding:var(--space-4);
}
.property-header-empty{ background:var(--surface); border:1px dashed var(--line-strong); }
.property-empty-line{ margin:0; font-size:12.5px; line-height:1.5; color:var(--ink-soft); }
.property-facts{ display:flex; flex-wrap:wrap; gap:var(--space-3); }
.property-fact{
  display:inline-flex; align-items:center; gap:var(--space-1);
  font-size:12px; font-weight:600; color:var(--forest-dark);
}
.property-summary-line{ margin:0; font-size:12.5px; line-height:1.5; color:var(--ink-soft); }

.home-panel-action{
  display:inline-flex; align-items:center; justify-content:center; gap:var(--space-2);
  align-self:flex-start; min-height:44px; padding:0 var(--space-4);
  background:var(--surface); border:1px solid var(--line-strong); border-radius:999px;
  font-family:var(--font-body); font-size:12.5px; font-weight:600; color:var(--ink); cursor:pointer;
}

/* The timeline's spine: a hairline behind the cards with a dot per event. Drawn with a
   pseudo-element on the list so no card has to know its position. */
.home-timeline{
  list-style:none; margin:0; padding:0 0 0 var(--space-4); position:relative;
  display:flex; flex-direction:column; gap:var(--space-3);
}
.home-timeline::before{
  content:""; position:absolute; inset-block:8px; inset-inline-start:3px;
  width:1px; background:var(--line);
}
.timeline-card-wrap{ position:relative; }
.timeline-card-dot{
  position:absolute; inset-inline-start:calc(-1 * var(--space-4) + 0px); top:16px;
  width:7px; height:7px; border-radius:50%; background:var(--sage); border:1px solid var(--surface);
}
.timeline-card-active .timeline-card-dot{ background:var(--amber); }
.timeline-card{
  position:relative; display:flex; flex-direction:column; gap:var(--space-2);
  width:100%; text-align:start; cursor:pointer;
  background:var(--surface); border:1px solid var(--line-soft); box-shadow:var(--shadow-card);
  border-radius:14px; padding:var(--space-4) var(--space-5) var(--space-4) var(--space-4);
  font-family:var(--font-body);
}
.timeline-card-head{ display:flex; align-items:baseline; justify-content:space-between; gap:var(--space-3); }
.timeline-card-title{ font-size:13.5px; font-weight:600; color:var(--ink); }
.timeline-card-date{ font-family:var(--font-mono); font-size:11px; color:var(--ink-faint); white-space:nowrap; }
.timeline-card-pro{ display:inline-flex; align-items:center; gap:var(--space-2); font-size:12px; color:var(--ink-soft); }
.timeline-card-detail{ margin:0; font-size:12px; line-height:1.5; color:var(--ink-soft); font-style:italic; }
.timeline-card-ai{ margin:0; font-size:11.5px; line-height:1.45; color:var(--forest); }
.timeline-card-status{
  align-self:flex-start; font-size:11px; font-weight:600; color:#8a5c14;
  background:var(--amber-bg); border-radius:999px; padding:2px var(--space-3);
}
.timeline-card-review{ display:flex; flex-direction:column; gap:var(--space-1); }
.timeline-card-quote{ margin:0; font-size:12px; line-height:1.5; color:var(--ink-soft); }
.timeline-card-chevron{
  position:absolute; inset-inline-end:var(--space-2); top:50%; transform:translateY(-50%);
  color:var(--ink-faint);
}
[dir="rtl"] .timeline-card-chevron{ transform:translateY(-50%) scaleX(-1); }

.trusted-pros{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:var(--space-2); }
.trusted-pro{
  display:flex; align-items:center; gap:var(--space-3); width:100%; min-height:56px;
  text-align:start; cursor:pointer; background:var(--surface);
  border:1px solid var(--line-soft); border-radius:14px;
  padding:var(--space-2) var(--space-4); font-family:var(--font-body); color:var(--ink-faint);
}
.trusted-pro-text{ flex:1; display:flex; flex-direction:column; gap:1px; }
.trusted-pro-name{ font-size:13px; font-weight:600; color:var(--ink); }
.trusted-pro-count{ font-size:11.5px; color:var(--ink-soft); }
[dir="rtl"] .trusted-pro > svg:last-child{ transform:scaleX(-1); }

.home-reviews, .home-ai-list{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:var(--space-2); }
.home-review-row, .home-ai-row{
  display:flex; flex-direction:column; gap:var(--space-1);
  background:var(--surface); border:1px solid var(--line-soft); border-radius:12px; padding:var(--space-3) var(--space-4);
}
.home-review-service, .home-ai-service{ font-size:12.5px; font-weight:600; color:var(--ink); }
.home-ai-line{ margin:0; font-size:11.5px; line-height:1.45; color:var(--ink-soft); }

.home-photo-grid{ display:grid; grid-template-columns:repeat(3, 1fr); gap:var(--space-2); }
.home-photo{
  aspect-ratio:1; border-radius:12px; overflow:hidden; background:var(--paper);
  display:flex; align-items:center; justify-content:center;
}
.home-photo img{ width:100%; height:100%; object-fit:cover; }
.home-photo-missing{ color:var(--ink-faint); }

/* ---- My Items ---- */

.items-empty{
  display:flex; flex-direction:column; gap:var(--space-2);
  background:var(--surface); border:1px dashed var(--line-strong); border-radius:14px; padding:var(--space-5);
}
.items-empty-line{ margin:0; font-size:13.5px; font-weight:600; color:var(--ink); }
.items-empty-hint{ margin:0; font-size:12.5px; line-height:1.5; color:var(--ink-soft); }

.item-grid{ list-style:none; margin:0; padding:0; display:grid; grid-template-columns:repeat(2, 1fr); gap:var(--space-2); }
.item-card{
  position:relative; display:flex; align-items:center; gap:var(--space-3); width:100%; min-height:64px;
  text-align:start; cursor:pointer; background:var(--surface);
  border:1px solid var(--line-soft); box-shadow:var(--shadow-card); border-radius:14px;
  padding:var(--space-2) var(--space-4) var(--space-2) var(--space-2); font-family:var(--font-body);
}
.item-card-photo{
  flex:none; width:44px; height:44px; border-radius:10px; overflow:hidden; background:var(--sage-bg);
  display:flex; align-items:center; justify-content:center;
}
.item-card-photo img{ width:100%; height:100%; object-fit:cover; }
.item-card-initial{ font-size:16px; font-weight:700; color:var(--forest-dark); }
.item-card-text{ flex:1; display:flex; flex-direction:column; gap:1px; min-width:0; }
.item-card-name{ font-size:12.5px; font-weight:600; color:var(--ink); overflow-wrap:anywhere; }
.item-card-sub{ font-size:11px; color:var(--ink-soft); overflow-wrap:anywhere; }
.item-card-room{ font-size:10.5px; color:var(--ink-faint); }
.item-card-edit{ flex:none; color:var(--ink-faint); }

.item-photo-picker{ display:flex; }
.item-photo-add{
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:var(--space-1);
  width:96px; height:96px; border-radius:14px; cursor:pointer;
  background:var(--surface); border:1px dashed var(--line-strong);
  font-family:var(--font-body); font-size:11px; font-weight:600; color:var(--ink-soft);
}
.item-photo-preview{ position:relative; width:96px; height:96px; border-radius:14px; overflow:hidden; }
.item-photo-preview img{ width:100%; height:100%; object-fit:cover; }

/* ---- first-login tour ---- */
.tour{ display:flex; flex-direction:column; gap:var(--space-3); }
.tour-progress{ margin:0; font-size:11px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:var(--ink-soft); }
.tour-title{ margin:0; font-family:var(--font-display); font-size:19px; font-weight:600; color:var(--ink); line-height:1.25; }
.tour-body{ margin:0; font-size:13px; line-height:1.55; color:var(--ink-soft); }
.tour-dots{ display:flex; gap:var(--space-2); list-style:none; margin:0; padding:0; }
.tour-dot{ width:6px; height:6px; border-radius:50%; background:var(--line-strong); }
.tour-dot-on{ background:var(--forest); width:18px; border-radius:99px; }
.tour-actions{ display:flex; flex-direction:column; gap:var(--space-2); margin-top:var(--space-2); }
.tour-actions .btn-primary, .tour-actions .btn-secondary{ min-height:44px; }
.tour-nav{ display:flex; justify-content:space-between; gap:var(--space-4); }
.tour-link{
  border:none; background:none; padding:var(--space-2); cursor:pointer; min-height:44px;
  font-family:var(--font-body); font-size:12px; font-weight:600; color:var(--forest); text-decoration:underline;
}
.tour-skip{ margin-inline-start:auto; }

/* The bottom bar is the one piece of chrome pinned over the home-indicator area on a
   real device; without this the last row of every screen sits under it. */
.tabbar{ padding-bottom:calc(14px + env(safe-area-inset-bottom, 0px)); }

/* Narrow phones (320px): the hero question and the three tab labels are the two things
   that break first. Nothing is hidden — only tightened. */
@media (max-width: 360px){
  .home-body{ padding-inline:var(--space-4); }
  .seg-tab{ font-size:11.5px; padding-inline:var(--space-1); }
  .intent-chip{ font-size:12px; padding-inline:var(--space-3); }
  .item-grid{ grid-template-columns:1fr; }
}

@media (prefers-reduced-motion: reduce){
  .seg-tab, .intent-chip, .today-card, .conv-textrow-tool{ transition:none; }
  .intent-chip:active, .today-card:active{ transform:none; }
}
`;
