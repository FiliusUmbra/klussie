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

/* ---- intent suggestions ----
   Homepage redesign, 2026-09-15 — a 3-column grid of icon tiles replaces the old
   wrapping row of text-only chips ("visual buttons," not a line of labels to read).
   Five real intents fill two rows (3 + 2) at any locale's label length, so this no
   longer needs the old chip row's own "tightened after measuring" padding hack --
   a tile's width comes from the grid column, never from how long its own label runs. */
.intent-grid{ display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:var(--space-2); }
.intent-tile{
  display:flex; flex-direction:column; align-items:center; gap:6px; min-height:44px;
  padding:var(--space-3) var(--space-1); border-radius:16px;
  border:1px solid var(--line-soft); background:var(--surface); box-shadow:var(--shadow-card);
  font-family:var(--font-body); cursor:pointer;
  transition:background var(--motion-base), border-color var(--motion-base), transform var(--motion-fast);
}
.intent-tile:active{ transform:scale(0.98); }
.intent-tile-icon{
  width:38px; height:38px; border-radius:12px; flex-shrink:0;
  display:flex; align-items:center; justify-content:center;
  background:var(--sage-bg); color:var(--forest-dark);
  transition:background var(--motion-base), color var(--motion-base);
}
.intent-tile-label{ font-size:11px; font-weight:600; color:var(--ink); text-align:center; line-height:1.25; }
.intent-tile-on{ background:var(--forest); border-color:var(--forest); }
.intent-tile-on .intent-tile-icon{ background:rgba(255,255,255,0.18); color:#fff; }
.intent-tile-on .intent-tile-label{ color:#fff; }

/* ---- home category row (ADR-0033 mockup, 2026-09-15) ----
   A single compact horizontal strip, deliberately not a wrapping grid like
   .intent-grid above it — the mockup's own Home screen shows one glanceable row, not a
   second 3x2 block competing with the intent tiles for the same "what do you need"
   role. Scrolls horizontally rather than wrapping when a locale's labels or CATS'
   own length don't fit six tiles at once. */
.home-category-row{ display:flex; gap:var(--space-2); overflow-x:auto; padding-bottom:2px; }
.home-category-tile{
  display:flex; flex-direction:column; align-items:center; gap:5px; flex:0 0 auto; width:64px;
  min-height:44px; padding:var(--space-2) 2px; border:none; background:none; cursor:pointer;
  font-family:var(--font-body);
}
.home-category-tile:active{ transform:scale(0.96); }
.home-category-tile-icon{
  width:38px; height:38px; border-radius:12px; flex-shrink:0;
  display:flex; align-items:center; justify-content:center;
  background:var(--sage-bg); color:var(--forest-dark);
}
.home-category-tile-label{
  font-size:10.5px; font-weight:600; color:var(--ink); text-align:center; line-height:1.2;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%;
}

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

/* ---- "for you": the highlighted today-card, then what else is already running ----
   Homepage redesign, 2026-09-15 -- one shared section (KlussiePanel.jsx's own
   .home-foryou) replaces the old separately-headed "today"/"what is already running"
   pair; this gap is what used to come from .home-body's own flex gap separating two
   independent <section> elements. */
.home-foryou{ display:flex; flex-direction:column; gap:var(--space-2); }
.home-active-list{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:var(--space-2); }
.home-active-row{
  display:flex; align-items:center; gap:var(--space-3); width:100%; text-align:start;
  background:var(--surface); border:1px solid var(--line-soft); border-radius:12px;
  padding:var(--space-3) var(--space-4); min-height:44px; cursor:pointer;
  font-family:var(--font-body); color:var(--ink-soft);
}
/* Same icon-badge language .today-card-glyph already uses just above, at a slightly
   smaller size -- a running request is real content, not a plainer row that merely
   happens to share this section with the highlighted card above it. */
.home-active-glyph{
  width:28px; height:28px; border-radius:9px; flex-shrink:0;
  display:flex; align-items:center; justify-content:center;
  background:var(--sage-bg); color:var(--forest-dark);
}
.home-active-glyph-amber{ background:var(--amber-bg); color:var(--amber-dark); }
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

/* Property health (ADR-0033) — real data or nothing at all (myHomeParts.jsx's own
   PropertyHealthCard, propertyHealthStatus() in lib/maintenance.js). "Good" reads as a
   quiet reassurance, "attention" reads as its own distinct amber card — WCAG 1.4.1: the
   icon and the body text carry the meaning, not the background color alone. */
.property-health{
  display:flex; align-items:flex-start; gap:var(--space-2); margin-top:var(--space-2);
  border-radius:14px; padding:var(--space-3) var(--space-4);
}
.property-health-good{ background:var(--sage-bg); }
.property-health-attention{ background:var(--amber-bg); }
.property-health-icon{ flex-shrink:0; margin-top:1px; }
.property-health-good .property-health-icon{ color:var(--forest-dark); }
.property-health-attention .property-health-icon{ color:var(--amber-dark); }
.property-health-text{ display:flex; flex-direction:column; gap:2px; }
.property-health-title{ font-size:13px; font-weight:700; color:var(--ink); }
.property-health-body{ font-size:12px; line-height:1.4; color:var(--ink-soft); }

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

/* ---- Item Detail (the icon+fact identity block, and the tappable document rows) ----
   Redesigned 2026-09-15 — the old "photo/initial square, then a facts list, then a
   full-width Edit button" (three stacked blocks reading as a form) becomes one grouped
   hero: a category glyph (or a real photo, which always wins) sits beside the item's
   own name, the same real facts render inside it via the existing .property-facts/
   .property-fact convention (just recolored for the dark background below), and Edit
   collapses to one corner icon action. See ItemDetailSheet.jsx's own header comment for
   the full rationale. .item-detail-photo (the old square) had no other caller left once
   this landed — grep-confirmed before removing it rather than leaving dead CSS. */
.item-detail-hero{
  background:linear-gradient(160deg, var(--forest) 0%, var(--forest-dark) 100%);
  border-radius:18px; padding:var(--space-4); position:relative; margin-bottom:var(--space-4);
}
.item-detail-hero-row{ display:flex; align-items:center; gap:var(--space-3); }
.item-detail-hero-icon{
  width:56px; height:56px; border-radius:16px; background:rgba(255,255,255,0.14);
  display:flex; align-items:center; justify-content:center; flex:none; overflow:hidden; color:#fff;
}
.item-detail-hero-icon img{ width:100%; height:100%; object-fit:cover; }
.item-detail-hero-title{ font-family:var(--font-display); font-size:19px; font-weight:600; color:#fff; }
/* Higher specificity than the base .property-fact rule (appStyles.js) on purpose — the
   same four real facts, just recolored to stay readable on this dark gradient rather
   than their usual --forest-dark, which would be nearly invisible here. */
.item-detail-hero .property-facts{ margin-top:var(--space-1); row-gap:var(--space-1); }
.item-detail-hero .property-fact{ color:rgba(255,255,255,0.85); }
.item-detail-hero-edit{
  position:absolute; top:var(--space-4); right:var(--space-4); width:30px; height:30px;
  border-radius:9px; background:rgba(255,255,255,0.14); border:none; color:#fff;
  display:flex; align-items:center; justify-content:center; cursor:pointer;
}
[dir="rtl"] .item-detail-hero-edit{ right:auto; left:var(--space-4); }

/* Ask Klussie — collapsed from a field-label + a fineprint hint sentence + a separate
   full-width button into one pill: the sparkle marks it as "ask the AI," the
   placeholder itself carries the hint, and send lives inside the field. */
.item-ask-pill{
  display:flex; align-items:center; gap:var(--space-2); background:var(--surface);
  border:1px solid var(--line); border-radius:999px; box-shadow:var(--shadow-card);
  padding:5px 5px 5px var(--space-3); margin-bottom:var(--space-4);
}
.item-ask-pill-icon{ flex:none; color:var(--forest-dark); }
.item-ask-pill-input{
  flex:1; min-width:0; border:none; background:none; font-family:var(--font-body);
  font-size:12.5px; color:var(--ink);
}
.item-ask-pill-send{
  flex:none; width:32px; height:32px; border-radius:999px; border:none; cursor:pointer;
  background:var(--forest); color:#fff; display:flex; align-items:center; justify-content:center;
  transition:opacity var(--motion-base);
}
.item-ask-pill-send:disabled{ opacity:0.45; cursor:default; }

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

/* Named nudges for a specific missing document (a model number to fill in, a warranty
   document to attach), not a bare "+ Add a document" -- same dashed-border language
   .item-photo-add already uses for "here's a real slot for a specific thing," just
   sized for two side-by-side tiles instead of one square. */
.item-detail-doc-nudges{ display:flex; gap:var(--space-2); margin-bottom:var(--space-2); }
.item-detail-doc-nudge{
  flex:1; display:flex; flex-direction:column; align-items:center; gap:3px;
  background:var(--surface); border:1.5px dashed var(--line-strong); border-radius:14px;
  padding:var(--space-3); cursor:pointer; font-family:var(--font-body); color:var(--ink-soft);
  min-height:44px;
}
.item-detail-doc-nudge-label{ font-size:11.5px; font-weight:600; color:var(--ink-soft); }
.item-detail-doc-nudge-hint{ font-size:10.5px; font-weight:700; color:var(--forest-dark); }

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
  .seg-tab, .intent-tile, .today-card, .conv-textrow-tool{ transition:none; }
  .intent-tile:active, .today-card:active{ transform:none; }
}
`;
