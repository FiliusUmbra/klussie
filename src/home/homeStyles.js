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
/* Found by a later audit, 2026-09-11 (appStyles.js's own :focus-visible rule carries the
   full explanation): this used :focus, not :focus-visible, and its own selector's
   specificity beats the app's single global focus-ring rule regardless — so this real,
   keyboard-focusable scroll region (TabPanel's own tabIndex={0}, "so a keyboard user can
   reach the tabs but not scroll what they selected" — its own comment in tabs.jsx) never
   showed a focus indicator to anyone. Removed rather than re-scoped to :focus-visible:
   deleting the local override is what lets the app's one global rule actually govern it. */

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
.conv-textrow-tool-on{ background:var(--amber-bg); color:var(--amber-dark); }

/* ---- safety interruption ---- */
.safety-notice{
  background:var(--amber-bg); border-radius:16px; padding:var(--space-4);
  display:flex; flex-direction:column; gap:var(--space-3);
}
.safety-notice-head{ display:flex; align-items:center; gap:var(--space-2); }
.safety-notice-glyph{ color:var(--amber-dark); display:flex; }
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
.today-card-amber .today-card-glyph{ background:var(--amber-bg); color:var(--amber-dark); }
.today-card-text{ flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
.today-card-title{ font-size:13.5px; font-weight:700; color:var(--ink); line-height:1.3; }
.today-card-body{ font-size:12px; color:var(--ink-soft); line-height:1.45; }
.today-card-cta{ margin-top:var(--space-1); font-size:12px; font-weight:700; color:var(--forest); }
.today-card-chev{ color:var(--ink-soft); flex-shrink:0; align-self:center; }
/* Found by a later audit, 2026-09-11: the same "leads forward" chevron .timeline-card-chevron
   already flips for RTL below -- the Today card is the single most prominent card on
   the whole homepage, and this one was simply missed. */
[dir="rtl"] .today-card-chev{ transform:scaleX(-1); }
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
.home-active-chevron{ flex-shrink:0; }
/* Same gap as .today-card-chev and .ticket-foot-chevron (appStyles.js) -- see that
   file's own comment for the full explanation. */
[dir="rtl"] .home-active-chevron{ transform:scaleX(-1); }

/* ---- my home / my items ---- */
.home-panel{ display:flex; flex-direction:column; gap:var(--space-4); }
.home-panel-question{ margin:0; font-size:15px; font-weight:700; color:var(--ink); line-height:1.35; }
.home-group{ display:flex; flex-direction:column; gap:var(--space-2); }
.home-group-title{
  margin:0; font-size:13px; font-weight:700; color:var(--ink);
  display:flex; align-items:baseline; justify-content:space-between; gap:var(--space-2);
}
/* --ink-soft, not --ink-faint, here and at every other former --ink-faint usage in this
   file (.location-node-type, .location-node-edit, .timeline-card-date, .timeline-card-chevron,
   .trusted-pro, .home-photo-missing, .item-card-room, .item-card-edit,
   .item-detail-document-chevron) -- the exact bug ACCESSIBILITY.md's Color contrast
   section already found and fixed once, at .timeline-label: --ink-faint measures 3.04:1
   on --surface and 2.61:1 on --paper, both well under the 4.5:1 normal-text floor (all
   of these render at 10.5-11px, and several are real text, not decoration). It
   regressed back in when this file was added after that first fix -- DESIGN_TOKENS.md
   had stopped being true the moment the first of these was written. Same fix as before:
   --ink-soft (5.65:1 / 4.85:1, comfortably clearing both real backgrounds either way) --
   ink-faint itself stays defined, with zero real usages again. */
.home-group-count{ font-family:var(--font-mono); font-size:11px; font-weight:500; color:var(--ink-soft); }
.home-group-empty{ margin:0; font-size:12px; color:var(--ink-soft); line-height:1.45; }

/* ---- My Items, WP 1.3: the location tree, maintenance list, document list ---- */
.location-tree{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:var(--space-1); }
.location-tree-root > .location-node{ font-weight:600; }
.location-node .location-tree{ margin-inline-start:var(--space-4); padding-block-start:var(--space-1); font-weight:400; }
.location-node-name{ display:flex; align-items:baseline; gap:var(--space-2); font-size:13px; color:var(--ink); }
.location-node-type{ font-size:11px; color:var(--ink-soft); }
/* Home Builder slice: every room is now a real, tappable row — never a bare name next
   to an icon nobody was told means "edit". Full-width and 44px tall so the whole row is
   the target, not just the small pencil glyph. */
.location-node-btn{
  display:flex; align-items:center; justify-content:space-between; gap:var(--space-2);
  width:100%; min-height:44px; padding:var(--space-2) var(--space-1);
  text-align:start; cursor:pointer; background:none; border:none; border-radius:8px;
  font-family:var(--font-body); transition:background var(--motion-base);
}
.location-node-btn:active{ background:var(--sage-bg); }
.location-node-edit{ flex:none; color:var(--ink-soft); }

.maintenance-list, .document-list{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:var(--space-2); }
.maintenance-row, .document-row{
  display:flex; align-items:baseline; justify-content:space-between; gap:var(--space-2);
  font-size:13px; color:var(--ink);
}
.maintenance-row-title, .document-row-caption{ flex:1; min-width:0; }
.maintenance-row-due, .document-row-validity{ font-size:11.5px; color:var(--ink-soft); flex:none; }

/* Maintenance resolution slice — ItemDetailSheet's own actionable rows (Mark done/Cancel
   task for an open task, a status badge/line for a settled one) sit below the existing
   title+due line, on their own line rather than crowding into it. MyItemsPanel.jsx's own
   read-only MaintenanceList keeps using plain .maintenance-row <li> elements directly, so
   none of this touches it. */
.maintenance-row-item{ display:flex; flex-direction:column; gap:var(--space-1); }
.maintenance-row-actions{ display:flex; gap:var(--space-3); }
.maintenance-row-action{
  display:flex; align-items:center; gap:6px; min-height:44px; padding:0 var(--space-1);
  background:none; border:none; font-family:var(--font-body); font-size:12.5px;
  color:var(--forest-dark); cursor:pointer;
}
.maintenance-row-action:disabled{ opacity:0.6; cursor:default; }

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

/* ---- Home Builder: "start building your home" ----
   The one moment a brand-new homeowner sees before anything else in My Home. Deliberately
   heavier than .items-empty's dashed box (larger title, an explicit hint sentence) since
   this is the very first thing the journey asks the customer to do, not a section that
   merely happens to be empty right now. */
.home-builder-empty{
  display:flex; flex-direction:column; align-items:flex-start; gap:var(--space-2);
  background:var(--surface); border:1px dashed var(--line-strong); border-radius:14px; padding:var(--space-5);
}
.home-builder-empty-line{ margin:0; font-size:14px; font-weight:700; color:var(--ink); }
.home-builder-empty-hint{ margin:0; font-size:12.5px; line-height:1.5; color:var(--ink-soft); }

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
/* --amber-dark, not --amber -- see appStyles.js's identical .timeline-dot fix and
   ACCESSIBILITY.md's Color contrast section: #E8A33D fails the 3:1 non-text floor
   this status dot needs against its white track. */
.timeline-card-active .timeline-card-dot{ background:var(--amber-dark); }
.timeline-card{
  position:relative; display:flex; flex-direction:column; gap:var(--space-2);
  width:100%; text-align:start; cursor:pointer;
  background:var(--surface); border:1px solid var(--line-soft); box-shadow:var(--shadow-card);
  border-radius:14px; padding:var(--space-4) var(--space-5) var(--space-4) var(--space-4);
  font-family:var(--font-body);
}
.timeline-card-head{ display:flex; align-items:baseline; justify-content:space-between; gap:var(--space-3); }
.timeline-card-title{ font-size:13.5px; font-weight:600; color:var(--ink); }
.timeline-card-date{ font-family:var(--font-mono); font-size:11px; color:var(--ink-soft); white-space:nowrap; }
.timeline-card-pro{ display:inline-flex; align-items:center; gap:var(--space-2); font-size:12px; color:var(--ink-soft); }
.timeline-card-detail{ margin:0; font-size:12px; line-height:1.5; color:var(--ink-soft); font-style:italic; }
.timeline-card-ai{ margin:0; font-size:11.5px; line-height:1.45; color:var(--forest); }
.timeline-card-status{
  align-self:flex-start; font-size:11px; font-weight:600; color:var(--amber-dark);
  background:var(--amber-bg); border-radius:999px; padding:2px var(--space-3);
}
.timeline-card-review{ display:flex; flex-direction:column; gap:var(--space-1); }
.timeline-card-quote{ margin:0; font-size:12px; line-height:1.5; color:var(--ink-soft); }
.timeline-card-chevron{
  position:absolute; inset-inline-end:var(--space-2); top:50%; transform:translateY(-50%);
  color:var(--ink-soft);
}
[dir="rtl"] .timeline-card-chevron{ transform:translateY(-50%) scaleX(-1); }

.trusted-pros{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:var(--space-2); }
.trusted-pro{
  display:flex; align-items:center; gap:var(--space-3); width:100%; min-height:56px;
  text-align:start; cursor:pointer; background:var(--surface);
  border:1px solid var(--line-soft); border-radius:14px;
  padding:var(--space-2) var(--space-4); font-family:var(--font-body); color:var(--ink-soft);
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
.home-photo-missing{ color:var(--ink-soft); }

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
.item-card-room{ font-size:10.5px; color:var(--ink-soft); }
.item-card-edit{ flex:none; color:var(--ink-soft); }

/* ---- Item Detail (the icon+fact identity block, and the tappable document rows) ---- */
.item-detail-photo{
  width:88px; height:88px; border-radius:16px; overflow:hidden; background:var(--sage-bg);
  display:flex; align-items:center; justify-content:center; margin-bottom:var(--space-3);
}
.item-detail-photo img{ width:100%; height:100%; object-fit:cover; }
.item-detail-photo .item-card-initial{ font-size:28px; }
.item-detail-document-open{
  display:flex; align-items:center; gap:var(--space-2); width:100%; min-height:44px;
  padding:var(--space-2) var(--space-1); text-align:start; cursor:pointer;
  background:none; border:none; border-radius:8px; font-family:var(--font-body);
  transition:background var(--motion-base);
}
.item-detail-document-open:active{ background:var(--sage-bg); }
.item-detail-document-open:disabled{ opacity:0.6; cursor:default; }
.item-detail-document-icon{ flex:none; color:var(--forest-dark); }
.item-detail-document-content{ flex:1; min-width:0; display:flex; align-items:baseline; justify-content:space-between; gap:var(--space-2); }
.item-detail-document-chevron{ flex:none; color:var(--ink-soft); }
[dir="rtl"] .item-detail-document-chevron{ transform:scaleX(-1); }
.item-detail-document-suggest{
  display:flex; align-items:center; gap:var(--space-1); min-height:44px;
  padding:0 var(--space-1) var(--space-2); text-align:start; cursor:pointer;
  background:none; border:none; font-family:var(--font-body); font-size:13px;
  color:var(--forest-dark);
}

.item-photo-picker{ display:flex; }
.item-photo-add{
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:var(--space-1);
  width:96px; height:96px; border-radius:14px; cursor:pointer;
  background:var(--surface); border:1px dashed var(--line-strong);
  font-family:var(--font-body); font-size:11px; font-weight:600; color:var(--ink-soft);
}
.item-photo-preview{ position:relative; width:96px; height:96px; border-radius:14px; overflow:hidden; }
.item-photo-preview img{ width:100%; height:100%; object-fit:cover; }

/* Item-intake wizard's own Brand/Model steps — "klein pictogram" (small icon), not the
   full-size picker the wizard's own Photo step already offers: this is a way back into
   that same one photo slot (there is one photo per item, household_items/property.assets
   both have exactly one photo column — never a second, brand-specific or model-specific
   photo), not a way to attach more of them. */
.item-photo-mini-btn{
  display:flex; align-items:center; justify-content:center; flex-shrink:0;
  width:32px; height:32px; border-radius:50%; padding:0; cursor:pointer;
  background:var(--surface); border:1px solid var(--line-strong); color:var(--ink-soft); overflow:hidden;
}
.item-photo-mini-btn.item-photo-mini-on{ background:var(--sage-bg); border-color:var(--sage); color:var(--forest-dark); }
.item-photo-mini-btn img{ width:100%; height:100%; object-fit:cover; }

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
