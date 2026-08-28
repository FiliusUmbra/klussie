// The application shell's stylesheet, injected as one <style> block by AppShell.
//
// A template string rather than a .css file because the whole app renders inside a
// simulated phone frame and ships its design tokens as custom properties on :root —
// keeping it in JS is how it got here, and converting to real CSS modules is a separate
// decision, not a side effect of moving it out of src/App.jsx. Concatenated with
// HOME_CSS (src/home/homeStyles.js), which follows the same pattern.
export const APP_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&family=Noto+Sans+Arabic:wght@400;600;700&family=Noto+Sans+SC:wght@400;500;700&display=swap');

:root{
  --forest:#1F4D3A; --forest-dark:#163828; --sage:#8FB996; --sage-bg:#E7F0E5;
  --paper:#EFEEE6; --surface:#FFFFFF; --amber:#E8A33D; --amber-bg:#FBEBD2;
  --ink:#16231C; --ink-soft:#5B6B60; --ink-faint:#8B978D; --line:rgba(22,35,28,0.10); --line-strong:rgba(22,35,28,0.28);
  --line-soft:rgba(22,35,28,0.06);
  --shadow-card:0 1px 2px rgba(31,77,58,0.05), 0 2px 10px rgba(31,77,58,0.06);
  --motion-fast:120ms ease-out; --motion-base:200ms ease-out;
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --space-5:24px; --space-6:32px;
  --font-display:'Fraunces',serif; --font-body:'Inter',sans-serif; --font-mono:'IBM Plex Mono',monospace;
}
@media (prefers-reduced-motion: reduce){
  :root{ --motion-fast:0ms; --motion-base:0ms; }
}
*{box-sizing:border-box;}
.stage{ min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; background:radial-gradient(circle at 30% 20%, #24382e 0%, #121b16 70%); padding:32px 16px; font-family:var(--font-body); }
.topbar{ display:flex; align-items:center; gap:16px; flex-wrap:wrap; justify-content:center; }
.role-switch{ display:flex; align-items:center; gap:10px; }
.segmented{ display:flex; background:rgba(255,255,255,0.08); border-radius:999px; padding:3px; }
.segmented button{ border:none; background:none; color:#c9d6cd; font-size:12.5px; font-weight:600; padding:6px 14px; border-radius:999px; cursor:pointer; font-family:var(--font-body); }
.segmented .seg-on{ background:var(--surface); color:var(--forest); }
.lang-switch{ display:flex; align-items:center; gap:6px; background:rgba(255,255,255,0.08); border-radius:999px; padding:5px 12px; }
.lang-switch svg{ color:#c9d6cd; }
.lang-switch select{ background:none; border:none; color:#fff; font-size:12.5px; font-weight:600; font-family:var(--font-body); cursor:pointer; outline:none; }
.lang-switch select option{ color:#111; }
/* Same control, rendered against a light page background (Profile screens) rather than
   the dark topbar — see LanguageSwitcher.jsx's own header for why it needs to render
   there at all. White-on-transparent-white would be invisible here, so this reuses the
   same sage-bg/forest-dark pill treatment .pin/.badge-sage/.btn-secondary already use. */
.lang-switch-light{ background:var(--sage-bg); }
.lang-switch-light svg{ color:var(--forest-dark) !important; }
.lang-switch-light select{ color:var(--forest-dark); }
.lang-switch-light select option{ color:var(--ink); }

.phone{ position:relative; width:390px; height:820px; background:var(--paper); border-radius:44px; border:8px solid #0d1512; box-shadow:0 30px 70px rgba(0,0,0,0.5); overflow:hidden; }
/* Persian uses the Arabic script, so it takes the same face. Noto Sans Arabic covers the
   four extra Persian letters (پ چ ژ گ); Inter does not, and would fall back per-glyph. */
.phone.lang-ar, .phone.lang-fa{ --font-body:'Noto Sans Arabic', sans-serif; --font-display:'Noto Sans Arabic', sans-serif; }
.phone.lang-zh{ --font-body:'Noto Sans SC', sans-serif; --font-display:'Noto Sans SC', sans-serif; }
.notch{ position:absolute; top:0; left:50%; transform:translateX(-50%); width:150px; height:22px; background:#0d1512; border-radius:0 0 16px 16px; z-index:5; }
.statusbar{ display:flex; justify-content:space-between; padding:10px 26px 2px; font-size:12px; font-weight:600; color:var(--ink); direction:ltr; }
.statusbar-dots{ letter-spacing:2px; opacity:0.5; }
.screen{ position:relative; height:calc(100% - 26px); display:flex; flex-direction:column; }

/* The phone frame is a demo shell — device chrome, not app UI (docs/design/DESIGN_TOKENS.md
   draws the same distinction). At 390px fixed width it overflowed a real 375px phone
   viewport by 8px, found in Epic 03's WP10 pass. On an actual phone the device is the
   frame, so below this width the mockup gives way and the app goes full-bleed: no
   border, no radius, no notch, and the real status bar replaces the painted one.
   dvh rather than vh so mobile browser chrome collapsing doesn't leave a gap. */
@media (max-width: 460px){
  .stage{ padding:0; gap:0; min-height:100vh; min-height:100dvh; justify-content:flex-start; }
  .phone{ width:100%; height:100vh; height:100dvh; border:none; border-radius:0; box-shadow:none; }
  .notch, .statusbar{ display:none; }
  .screen{ height:100%; }
  /* The role/language switcher is demo scaffolding; keeping it above the app costs
     vertical space that a real phone does not have to spare. */
  .topbar{ display:none; }
}
.view{ flex:1; display:flex; flex-direction:column; min-height:0; }
.content{ flex:1; overflow-y:auto; }
.pad{ padding:18px 20px 30px; }

.hello{ display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; gap:10px; }
.eyebrow{ font-size:11.5px; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:2px; }
.h1{ font-family:var(--font-display); font-size:22px; font-weight:600; color:var(--ink); line-height:1.2; }
.pin{ display:flex; align-items:center; gap:4px; font-size:11.5px; color:var(--forest); background:var(--sage-bg); padding:5px 9px; border-radius:999px; white-space:nowrap; }

.search{ display:flex; align-items:center; gap:8px; background:var(--surface); border:1px solid var(--line); border-radius:13px; padding:11px 13px; margin-bottom:14px; }
.search input{ border:none; outline:none; background:none; font-size:13.5px; width:100%; font-family:var(--font-body); color:var(--ink); }

.chiprow{ display:flex; gap:8px; overflow-x:auto; padding-bottom:14px; margin-bottom:2px; }
.chiprow::-webkit-scrollbar{ display:none; }
/* Real box growth, not hit-slop -- tried the pseudo-element technique live first
   (2026-08-28, same as .sheet-close/.modal-close/.photo-remove-btn), confirmed it
   cannot work here: .chiprow itself sets overflow-x:auto with no overflow-y, so the
   same CSS Overflow spec coercion that blocked .chat-input-row button forces
   overflow-y to compute as "auto" too and clips any vertical bleed -- measured live,
   a pseudo-element extending above a chip resolved to .sheet-scroll, not the chip.
   min-height:44px (was ~31px real height at padding:7px 12px) is the only fix that
   actually reaches the 44px target from docs/design/ACCESSIBILITY.md's own "Touch
   targets" section -- a real, visible size increase, not an invisible one. Horizontal
   padding grown slightly too (12px -> 14px) so the larger pill stays proportioned
   rather than looking squashed. .chiprow's own row height grows to match (flex rows
   auto-size to their tallest child) -- a real, visible layout change across every
   screen with a chip row, by design, not a side effect to work around. */
.chip{ display:flex; align-items:center; justify-content:center; gap:5px; white-space:nowrap; border:1px solid var(--line); background:var(--surface); color:var(--ink-soft); padding:7px 14px; min-height:44px; box-sizing:border-box; border-radius:999px; font-size:12.5px; font-weight:500; cursor:pointer; font-family:var(--font-body); transition:background var(--motion-base), color var(--motion-base), border-color var(--motion-base); }
.chip-on{ background:var(--forest); border-color:var(--forest); color:#fff; }
.chip-locked{ opacity:0.45; cursor:not-allowed; }

.section-title{ font-size:13px; font-weight:700; color:var(--ink); margin:6px 0 10px; }

.grid2{ display:grid; grid-template-columns:1fr 1fr; gap:11px; }
.svc-card{ text-align:start; background:var(--surface); border:1px solid var(--line-soft); box-shadow:var(--shadow-card); border-radius:16px; padding:13px; cursor:pointer; font-family:var(--font-body); }
.svc-icon{ width:34px; height:34px; border-radius:10px; background:var(--sage-bg); display:flex; align-items:center; justify-content:center; margin-bottom:9px; }
.svc-name{ font-size:13px; font-weight:600; color:var(--ink); line-height:1.3; margin-bottom:4px; min-height:32px; }
.svc-certified{ display:flex; align-items:center; gap:4px; font-size:9.5px; font-weight:700; color:var(--forest-dark); background:var(--sage-bg); padding:2px 6px; border-radius:6px; width:fit-content; margin-bottom:6px; }
.svc-meta{ font-size:11px; color:var(--ink-soft); margin-bottom:3px; }
.svc-rating{ display:flex; align-items:center; gap:4px; font-size:11px; color:var(--ink-soft); margin-bottom:10px; }
.svc-cta{ font-size:11.5px; font-weight:700; padding:6px 0; text-align:center; border-radius:8px; }
.cta-quote{ background:var(--amber-bg); color:#8a5c14; }
.cta-book{ background:var(--sage-bg); color:var(--forest-dark); }
.empty{ grid-column:1/-1; color:var(--ink-soft); font-size:13px; padding:20px 0; text-align:center; }

.stat-row{ display:flex; gap:10px; margin:16px 0 18px; }
.stat{ flex:1; background:var(--surface); border:1px solid var(--line-soft); box-shadow:var(--shadow-card); border-radius:13px; padding:12px; text-align:center; }
.stat-num{ font-family:var(--font-mono); font-size:16px; font-weight:500; color:var(--forest); display:flex; align-items:center; justify-content:center; gap:3px; }
.stat-label{ font-size:10.5px; color:var(--ink-soft); margin-top:3px; }

.badge{ font-size:10px; font-weight:700; padding:3px 8px; border-radius:999px; white-space:nowrap; }
.badge-sage{ background:var(--sage-bg); color:var(--forest-dark); }
.badge-forest{ background:var(--forest); color:#fff; }
.badge-amber{ background:var(--amber-bg); color:#8a5c14; }

.ticket{ position:relative; width:100%; display:block; text-align:start; background:var(--surface); border:1px solid var(--line-soft); box-shadow:var(--shadow-card); border-radius:16px; margin-bottom:14px; cursor:pointer; font-family:var(--font-body); overflow:hidden; }
.tear{ height:1px; background:var(--line-soft); }
.ticket-body{ padding:14px 16px 16px; }
.ticket-row{ display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:5px; }
.ticket-title{ font-family:var(--font-display); font-size:15.5px; font-weight:600; color:var(--ink); }
.ticket-sub{ font-size:11.5px; color:var(--ink-soft); }
.ticket-divider{ border-top:1.5px dashed var(--line-strong); margin:11px 0; }
.ticket-foot{ display:flex; justify-content:space-between; align-items:center; font-size:12px; color:var(--ink-soft); }
.waiting{ display:flex; align-items:center; gap:5px; color:var(--amber); font-weight:600; }

.empty-block{ display:flex; flex-direction:column; align-items:center; text-align:center; gap:8px; color:var(--ink-soft); font-size:13px; padding:34px 14px; background:var(--surface); border:1px dashed var(--line-strong); border-radius:16px; }

.quote-card{ background:var(--surface); border:1px solid var(--line-soft); box-shadow:var(--shadow-card); border-radius:14px; padding:13px 14px; margin-bottom:12px; }
.quote-card-booked{ border-color:var(--forest); }
.quote-top{ display:flex; align-items:center; gap:10px; }
.avatar{ width:36px; height:36px; border-radius:50%; background:var(--forest); color:#fff; display:flex; align-items:center; justify-content:center; font-size:12.5px; font-weight:700; flex-shrink:0; }
.avatar-lg{ width:52px; height:52px; font-size:17px; }
.quote-name{ font-size:13.5px; font-weight:600; color:var(--ink); display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.quote-rating{ display:flex; align-items:center; gap:4px; font-size:11.5px; color:var(--ink-soft); margin-top:2px; }
.quote-price{ font-family:var(--font-mono); font-size:15px; font-weight:500; color:var(--forest-dark); }
.quote-msg{ font-size:12.5px; color:var(--ink-soft); font-style:italic; margin:9px 0 10px; line-height:1.5; }

.btn-primary{ width:100%; display:flex; align-items:center; justify-content:center; gap:7px; background:var(--forest); color:#fff; border:none; padding:13px; border-radius:12px; font-size:13.5px; font-weight:700; cursor:pointer; font-family:var(--font-body); transition:transform var(--motion-fast), opacity var(--motion-base); }
.btn-secondary{ width:100%; background:var(--sage-bg); color:var(--forest-dark); border:none; padding:10px; border-radius:10px; font-size:12.5px; font-weight:700; cursor:pointer; font-family:var(--font-body); transition:transform var(--motion-fast), opacity var(--motion-base); }
.btn-primary:active, .btn-secondary:active{ transform:scale(0.98); opacity:0.92; }

.fineprint{ display:flex; align-items:center; gap:6px; font-size:10.5px; color:var(--ink-soft); margin-top:12px; justify-content:center; text-align:center; }

.field-label{ display:block; font-size:11.5px; font-weight:600; color:var(--ink-soft); margin:12px 0 7px; }
.textarea{ width:100%; border:1px solid var(--line-soft); box-shadow:var(--shadow-card); border-radius:12px; padding:11px; font-size:13px; font-family:var(--font-body); color:var(--ink); resize:none; margin-bottom:16px; }

.profile-head{ display:flex; align-items:center; gap:12px; margin-bottom:10px; }
.sheet-blurb{ font-size:13px; color:var(--ink-soft); line-height:1.55; margin:8px 0 14px; }

.star-picker{ display:flex; gap:8px; margin:14px 0 16px; }
.star-picker button{ background:none; border:none; cursor:pointer; padding:0; }

.tabbar{ display:flex; border-top:1px solid var(--line); background:var(--surface); padding:8px 6px 14px; }
/* min-height:44px — the tab was 38px tall, under the minimum touch target, on the one bar
   every screen depends on to get anywhere (Epic 03 WP10). */
.tab{ flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:44px; gap:3px; background:none; border:none; font-size:10px; color:var(--ink-soft); font-family:var(--font-body); font-weight:600; cursor:pointer; }
.tab-on{ color:var(--forest); }
.tab-icon-wrap{ position:relative; }
.tab-badge{ position:absolute; top:-5px; right:-8px; background:var(--amber); color:#fff; font-size:9px; font-weight:700; min-width:15px; height:15px; border-radius:999px; display:flex; align-items:center; justify-content:center; padding:0 3px; }

.sheet-overlay{ position:absolute; inset:0; background:rgba(13,21,18,0.45); display:flex; align-items:flex-end; z-index:20; }
.sheet{ position:relative; width:100%; max-height:88%; background:var(--paper); border-radius:24px 24px 0 0; padding:10px 20px 26px; box-shadow:0 -10px 30px rgba(0,0,0,0.2); }
.sheet-grabber{ width:36px; height:4px; background:var(--line-strong); border-radius:99px; margin:0 auto 10px; }
/* docs/design/ACCESSIBILITY.md's own "Touch targets" finding: 28x28px, real
   measurement, below the 44x44px minimum. Its own prescribed fix -- "expanding the
   invisible hit-area via padding or a pseudo-element while keeping the visual icon the
   same size" -- applied here: a transparent ::after grows only the tappable zone, never
   the visible circle. Safe in this spot -- top:12px/inset-inline-end:16px places it in
   open space at the corner of a full-screen Drawer, nothing else nearby to overlap. */
.sheet-close{ position:absolute; top:12px; inset-inline-end:16px; background:var(--surface); border:1px solid var(--line); width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--ink-soft); }
.sheet-close::after{ content:""; position:absolute; inset:-8px; }
.sheet-scroll{ overflow-y:auto; max-height:calc(88vh - 40px); padding-top:8px; }
.sheet-icon-lg{ width:44px; height:44px; border-radius:13px; background:var(--sage-bg); display:flex; align-items:center; justify-content:center; margin-bottom:12px; }
.sheet-title{ font-family:var(--font-display); font-size:19px; font-weight:600; color:var(--ink); margin-bottom:4px; }
.sheet-sub{ font-size:12.5px; color:var(--ink-soft); margin-bottom:12px; display:flex; align-items:center; gap:4px; flex-wrap:wrap; }
.price-hint{ font-size:13px; color:var(--ink); background:var(--surface); border:1px solid var(--line-soft); box-shadow:var(--shadow-card); border-radius:10px; padding:10px 12px; margin-bottom:16px; }

.toast{ position:absolute; bottom:90px; left:20px; right:20px; background:var(--ink); color:#fff; font-size:12.5px; font-weight:600; text-align:center; padding:11px; border-radius:11px; z-index:30; box-shadow:0 8px 20px rgba(0,0,0,0.3); }

.fee-row{ display:flex; justify-content:space-between; font-size:12px; color:var(--ink-soft); padding:2px 0; }
.fee-row-net{ font-weight:700; color:var(--forest-dark); }
.invoice-box{ background:var(--surface); border:1px solid var(--line-soft); box-shadow:var(--shadow-card); border-radius:14px; padding:14px 16px; font-family:var(--font-mono); font-size:12px; }
.invoice-row{ display:flex; justify-content:space-between; gap:10px; padding:4px 0; color:var(--ink); }
.invoice-total{ font-weight:700; font-size:13.5px; color:var(--forest-dark); padding-top:8px; }
.segmented-block{ width:100%; margin-bottom:14px; }
.segmented-block button{ flex:1; }
.flexi-box{ background:var(--surface); border:1px solid var(--line-soft); box-shadow:var(--shadow-card); border-radius:14px; padding:14px 16px; margin-bottom:18px; }
.flexi-bar{ width:100%; height:8px; background:var(--sage-bg); border-radius:99px; overflow:hidden; }
.flexi-bar-fill{ height:100%; background:var(--forest); border-radius:99px; }

.chat-scroll{ display:flex; flex-direction:column; gap:8px; max-height:50vh; overflow-y:auto; padding:4px 2px 14px; }
.chat-bubble{ max-width:78%; padding:9px 13px; border-radius:16px; font-size:13px; line-height:1.45; }
.chat-bubble-them{ align-self:flex-start; background:var(--surface); border:1px solid var(--line); color:var(--ink); border-bottom-left-radius:4px; }
.chat-bubble-me{ align-self:flex-end; background:var(--forest); color:#fff; border-bottom-right-radius:4px; }
.chat-translate-toggle{ display:block; margin-top:4px; padding:0; border:none; background:none; cursor:pointer; font-family:var(--font-body); font-size:11px; color:var(--ink-soft); text-decoration:underline; }
.chat-bubble-them .chat-translate-toggle{ color:var(--ink-soft); }
.chat-input-row{ display:flex; gap:8px; align-items:center; }
.chat-input-row input{ flex:1; border:1px solid var(--line-soft); box-shadow:var(--shadow-card); border-radius:999px; padding:11px 15px; font-size:13px; font-family:var(--font-body); color:var(--ink); outline:none; }
/* 38x38px, below the 44x44px minimum (docs/design/ACCESSIBILITY.md) -- and, unlike
   .sheet-close/.modal-close, hit-slop genuinely cannot fix it here. Tried the same
   pseudo-element technique live, 2026-08-28: this button lives inside a Drawer's own
   .sheet-scroll (overflow-y:auto), and CSS's own overflow spec forces overflow-x to
   compute as "auto" too whenever the other axis isn't "visible" -- explicitly setting
   overflow-x:visible on .sheet-scroll does not override this; the browser coerces it
   back, confirmed against the real computed style, not just the source. A hit-slop
   pseudo-element bleeding outside this button's own box is clipped by that same
   computed overflow, same as any other content would be. A real fix exists (move
   .chat-input-row outside Drawer's scrolling children) but is a structural change to
   every conversation sheet in the app, not a touch-target tweak -- named here rather
   than attempted under this pass's scope, the same restraint this file's own
   .photo-remove-btn comment already uses. */
.chat-input-row button{ width:38px; height:38px; border-radius:50%; background:var(--forest); color:#fff; border:none; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; }

.avatar img{ width:100%; height:100%; border-radius:50%; object-fit:cover; }
.avatar-upload-row{ display:flex; align-items:center; gap:12px; margin-bottom:18px; }
.avatar-upload{ padding:0; border:none; background:none; border-radius:50%; cursor:pointer; flex-shrink:0; }

.portfolio-grid{ display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin-bottom:12px; }
.portfolio-thumb{ position:relative; width:100%; aspect-ratio:1; border-radius:10px; overflow:hidden; border:1px solid var(--line-soft); box-shadow:var(--shadow-card); background:var(--surface); padding:0; cursor:pointer; }
.portfolio-thumb img{ width:100%; height:100%; object-fit:cover; display:block; }
.portfolio-add{ display:flex; align-items:center; justify-content:center; color:var(--ink-soft); background:var(--sage-bg); border-style:dashed; }
/* 20x20px, the smallest of the four controls this doc's own audit measured, and
   deliberately NOT taken to the full 44px hit-slop the other three get: its parent
   .portfolio-thumb clips overflow, so extending inward (toward the thumbnail's own
   center, away from the top-right corner it sits in) is the only direction with room --
   and reaching the full 44px that way would turn roughly a third of a small thumbnail
   into an invisible "remove this photo" zone, exactly the destructive mis-tap risk this
   file's own audit named as the reason not to touch this control mechanically. A smaller
   4px hit-slop (28x28px, still short of 44px but a real 40% larger tap area) is the
   proportionate fix here -- the "real design decision per control" the audit called for,
   not a one-line copy of the other three. */
.photo-remove-btn{ position:absolute; top:4px; right:4px; width:20px; height:20px; border-radius:50%; border:none; background:rgba(0,0,0,0.55); color:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; padding:0; }
.photo-remove-btn::after{ content:""; position:absolute; inset:-4px; }
.quote-top-link{ display:flex; align-items:center; gap:10px; flex:1; border:none; background:none; padding:0; margin:0; cursor:pointer; text-align:start; font-family:var(--font-body); min-width:0; }

.job-field{ margin-bottom:12px; }
.job-field-label{ font-size:12.5px; color:var(--ink-soft); margin-bottom:6px; }
.job-details-summary{ background:var(--sage-bg); border-radius:10px; padding:10px 12px; margin:8px 0; display:flex; flex-direction:column; gap:4px; }
.job-details-row{ display:flex; justify-content:space-between; gap:10px; font-size:13px; }
.job-details-row span{ color:var(--ink-soft); }

/* Platform Activation Slice 3, WP 3.3 — the Service Record editor's own performing
   annex (margin, internal cost, supplier pricing). §13.2: "private by construction, not
   by a checkbox someone can get wrong" — amber, not sage, is the whole point: every
   other section of this app uses the sage/forest palette for shared, customer-visible
   content, so switching palette here is the one signal a pro should never need a
   tooltip to notice. */
.private-annex{ background:var(--amber-bg); border-radius:12px; padding:14px; margin:16px 0; }
.private-annex-label{ display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700; color:#8a5a10; margin-bottom:10px; }
.photo-strip{ display:flex; gap:8px; overflow-x:auto; margin:8px 0; }
.photo-strip-thumb{ flex-shrink:0; width:64px; height:64px; border-radius:10px; overflow:hidden; border:1px solid var(--line-soft); box-shadow:var(--shadow-card); display:block; }
.photo-strip-thumb img{ width:100%; height:100%; object-fit:cover; display:block; }

/* ---- conversation home (Epic 03, WP1 + WP7) ----
   Spacing uses the --space-* scale rather than fresh ad hoc pixels: the tokens have
   existed since the Design Direction Lock with zero usages (docs/design/DESIGN_TOKENS.md),
   and new code has no reason to repeat the untokenized pattern that document flags. */
.conv-home{ padding:var(--space-5) var(--space-5) var(--space-6); display:flex; flex-direction:column; gap:var(--space-4); }
.conv-greet{ display:flex; flex-direction:column; gap:var(--space-1); }
.conv-time{ font-size:11.5px; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.06em; }
.conv-hello{ font-family:var(--font-display); font-size:22px; font-weight:600; color:var(--ink); line-height:1.2; }

.conv-actions{ display:flex; gap:var(--space-3); }
.conv-action{
  flex:1; display:flex; flex-direction:column; align-items:center; text-align:center; gap:var(--space-1);
  background:var(--surface); border:1px solid var(--line-soft); box-shadow:var(--shadow-card);
  border-radius:16px; padding:var(--space-4) var(--space-3); cursor:pointer;
  transition:transform var(--motion-base), box-shadow var(--motion-base);
}
.conv-action:hover{ transform:translateY(-2px); box-shadow:0 4px 16px rgba(31,77,58,0.12); }
.conv-action:active{ transform:translateY(0) scale(0.985); }
.conv-action-glyph{
  width:38px; height:38px; border-radius:50%; background:var(--forest); color:#fff;
  display:flex; align-items:center; justify-content:center; margin-bottom:var(--space-1);
}
.conv-action-photo .conv-action-glyph{ background:var(--amber); }
/* Two lines are reserved whether or not the title needs them, so the two tiles' subtitles
   sit on the same baseline in every locale. Without this the layout depends on string
   length: Dutch "Vertel het me gewoon" wraps while "Laat het me zien" doesn't, and the
   subtitles fall out of alignment — a per-locale accident, not a design. */
.conv-action-title{ font-size:13px; font-weight:700; color:var(--ink); line-height:1.3; min-height:2.6em; }
.conv-action-sub{ font-size:11px; color:var(--ink-soft); line-height:1.35; }

/* No focus indicator existed anywhere in this app before Epic 03's WP11 audit: every
   interactive element computed outline:none, so keyboard users could reach controls but
   never see which one they were on. PRODUCT_CONSTITUTION.md Rule 6 requires every
   interactive element be keyboard-reachable, and reachable-but-invisible does not meet
   it. Global rather than scoped to this epic's components — the gap is app-wide, and
   fixing only the new screens would leave the rest inconsistent.
   :focus-visible, so it appears for keyboard use without ringing on every mouse click. */
:focus-visible{ outline:2px solid var(--forest); outline-offset:2px; border-radius:4px; }

/* Available to any component needing a label that screen readers get and sighted users
   don't. Clip-based rather than display:none, which would hide it from assistive tech
   as well and defeat the point. */
.visually-hidden{
  position:absolute; width:1px; height:1px; margin:-1px; padding:0;
  overflow:hidden; clip:rect(0 0 0 0); clip-path:inset(50%); white-space:nowrap; border:0;
}

/* Deliberately quieter than the two tiles above — typing was never the differentiator
   (docs/product/HOMEPAGE_DIRECTION.md). Still a real button: keyboard-reachable and
   announced, not a decorative div. */
.conv-textrow{
  display:flex; align-items:center; gap:var(--space-2); width:100%;
  background:var(--surface); border:1px solid var(--line-soft); box-shadow:var(--shadow-card);
  border-radius:999px; padding:0 var(--space-2) 0 var(--space-4);
  text-align:left; min-height:44px;
  transition:box-shadow var(--motion-base);
}
.conv-textrow:focus-within{ box-shadow:0 3px 14px rgba(31,77,58,0.10); }
/* align-self:stretch, so the field fills the pill's full height rather than sitting as a
   16px band inside it. The pill reads as one tap target; before this, a tap on its
   vertical padding — most of its area — landed on the form and focused nothing. */
.conv-textrow-input{
  flex:1; min-width:0; align-self:stretch; border:none; background:none; outline:none;
  font-family:inherit; font-size:13px; color:var(--ink); padding:0;
}
.conv-textrow-input::placeholder{ color:var(--ink-soft); }
.conv-textrow-send{
  position:relative;
  width:32px; height:32px; border-radius:50%; background:var(--sage-bg); color:var(--forest-dark);
  display:flex; align-items:center; justify-content:center; flex-shrink:0;
  border:none; cursor:pointer; transition:opacity var(--motion-fast);
}
/* The circle stays 32px — the approved design — while the touch target reaches the 44px
   minimum. Growing the button itself would either burst the 44px pill or shrink its
   padding, so the extra area is claimed invisibly around the circle instead. */
.conv-textrow-send::after{ content:""; position:absolute; inset:-6px; border-radius:50%; }
/* Disabled rather than erroring on an empty draft — nothing to say yet isn't a mistake. */
.conv-textrow-send:disabled{ opacity:0.4; cursor:default; }

/* ---- booking + relief (Epic 03, WP9 / ADR-0012) ---- */
.conv-actions-row{ display:flex; flex-direction:column; gap:var(--space-2); }
.conv-book{ display:flex; align-items:center; justify-content:center; gap:var(--space-2); width:100%; min-height:44px; }
.conv-continue{ width:100%; min-height:44px; }
/* #b3432f is this app's error colour — a literal repeated at eight other call sites and
   never tokenized. Matching it rather than inventing a ninth value; tokenizing all nine
   is a separate change, not this package's. */
.conv-book-error{ margin-top:var(--space-2); font-size:12px; color:#b3432f; text-align:center; }

/* Contained, not full-screen (§7): the confirmation is the only thing left on the
   canvas, so it doesn't also need to take the whole screen to be noticed. */
.conv-relief{
  display:flex; flex-direction:column; align-items:center; text-align:center; gap:var(--space-2);
  background:var(--sage-bg); border-radius:16px; padding:var(--space-5) var(--space-4);
}
.conv-relief-mark{
  width:40px; height:40px; border-radius:50%; background:var(--forest); color:#fff;
  display:flex; align-items:center; justify-content:center;
  animation:relief-bloom var(--motion-base) ease-out;
}
@keyframes relief-bloom{
  from{ transform:scale(0.7); opacity:0; }
  to{ transform:scale(1); opacity:1; }
}
.conv-relief-title{ font-family:var(--font-display); font-size:17px; font-weight:600; color:var(--ink); }
.conv-relief-sub{ font-size:12.5px; color:var(--ink-soft); line-height:1.45; max-width:30ch; }

/* ---- progressive reveal (Epic 03, WP6) ----
   An animation rather than a transition, so each item plays exactly once when it
   mounts. --motion-base is the only duration used; no new motion value is introduced
   (docs/design/DESIGN_TOKENS.md owns the two that exist). */
.unfold{ display:flex; flex-direction:column; gap:var(--space-3); }
@keyframes unfold-in{
  from{ opacity:0; transform:translateY(8px); }
  to{ opacity:1; transform:none; }
}
.unfold-item{ animation:unfold-in var(--motion-base) ease-out both; }

@media (prefers-reduced-motion: reduce){
  /* Ships with the component, not as a later fix: the staging is the decoration here,
     the content order carries the meaning. */
  .unfold-item{ animation:none; }
  /* Same reasoning for the confirmation bloom — the checkmark carries the message. */
  .conv-relief-mark{ animation:none; }
}

.conv-recap{
  align-self:flex-start; max-width:85%; background:var(--forest); color:#fff;
  font-size:13px; line-height:1.45; padding:var(--space-2) var(--space-3);
  border-radius:13px; border-bottom-left-radius:4px;
}
.conv-thinking{ display:flex; align-items:center; gap:var(--space-2); font-size:12.5px; color:var(--ink-soft); }
/* --ink, not the --amber-text the HTML prototypes used: that token has never existed in
   this codebase's :root, so referencing it silently fell back to an inherited grey at
   roughly 2.2:1 on the amber tint. Same undefined-token trap DESIGN_TOKENS.md's audit
   has now caught three times. --ink on --amber-bg is ~14:1. */
.conv-understanding-line{ font-size:13px; font-weight:600; color:var(--ink); text-align:left; }
.conv-recap{ text-align:left; }
.conv-continue{ margin-top:var(--space-1); }

/* ---- professional recommendation (Epic 03, WP8) ---- */
/* text-align is inherited as centre from .view app-wide; the greeting and trust strip
   want that, this card's content does not. */
.conv-pro{ display:flex; flex-direction:column; gap:var(--space-3); text-align:left; }
.conv-pro-top{ display:flex; align-items:center; gap:var(--space-3); }
.conv-pro-meta{ flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
.conv-pro-name{ display:flex; align-items:center; gap:var(--space-2); font-size:14px; font-weight:700; color:var(--ink); }
.conv-pro-estimate{ font-size:12.5px; color:var(--ink-soft); }
.recent-work-label{ font-size:10.5px; text-transform:uppercase; letter-spacing:0.05em; color:var(--ink-soft); margin-bottom:var(--space-2); }
.recent-work-strip{ display:flex; gap:var(--space-2); list-style:none; margin:0; padding:0; }
.recent-work-thumb{ width:56px; height:56px; object-fit:cover; border-radius:10px; display:block; }

/* ---- voice + photo capture (Epic 03, WP3 + WP4) ---- */
.conv-capture{ display:flex; flex-direction:column; gap:var(--space-3); }

.voice-capture{
  background:var(--surface); border:1px solid var(--line-soft); box-shadow:var(--shadow-card);
  border-radius:16px; padding:var(--space-4); display:flex; flex-direction:column;
  align-items:center; gap:var(--space-3);
}
.voice-status{ display:flex; align-items:center; gap:var(--space-2); font-size:12px; color:var(--ink-soft); }
.voice-dot{ width:8px; height:8px; border-radius:50%; background:var(--line-strong); }
.voice-dot-live{ background:var(--forest); }
.voice-wave{ display:flex; align-items:center; justify-content:center; gap:3px; height:36px; }
/* Height comes from the measured level via inline transform — the only transition here
   smooths the sampling, it never animates on its own. */
.voice-bar{
  width:4px; height:32px; border-radius:2px; background:var(--forest);
  transform-origin:center; transition:transform var(--motion-fast);
}
.voice-transcript{
  margin:0; text-align:center; font-size:14px; line-height:1.45; color:var(--ink);
  min-height:2.9em; max-width:32ch;
}
.voice-stop{
  background:var(--sage-bg); color:var(--forest-dark); border:none; border-radius:999px;
  padding:var(--space-2) var(--space-5); font-size:12.5px; font-weight:600; cursor:pointer;
  min-height:44px;
}

.photo-capture{ display:flex; flex-direction:column; gap:var(--space-3); }
/* flex-shrink:0 is load-bearing: this sits inside nested flex columns, and without it
   the frame collapses to a few pixels tall, leaving the on-photo tag floating above a
   sliver of image instead of sitting on it. */
.photo-capture-frame{ position:relative; border-radius:16px; overflow:hidden; box-shadow:var(--shadow-card); flex-shrink:0; }
.photo-capture-img{ display:block; width:100%; height:auto; }
/* The tag sits on the photo itself (Fig. 5). Dark scrim rather than a tinted surface so
   contrast holds over an arbitrary photo, which is the whole risk with on-image text. */
.photo-capture-tag{
  position:absolute; left:var(--space-3); bottom:var(--space-3);
  background:rgba(14,25,19,0.82); color:#fff; font-size:11.5px; font-weight:600;
  padding:var(--space-1) var(--space-3); border-radius:999px;
}
.photo-capture-tag-pending{ font-weight:500; opacity:0.9; }
.photo-capture-actions{ display:flex; gap:var(--space-2); }
.photo-capture-retake, .photo-capture-confirm{
  flex:1; min-height:44px; border-radius:12px; font-size:13px; font-weight:600; cursor:pointer;
}
.photo-capture-retake{ background:var(--sage-bg); color:var(--forest-dark); border:none; }
.photo-capture-confirm{ background:var(--forest); color:#fff; border:none; }
.photo-capture-confirm:disabled{ opacity:0.55; cursor:default; }

.conv-action:disabled{ opacity:0.55; cursor:default; }
.conv-action:disabled:hover{ transform:none; box-shadow:var(--shadow-card); }

@media (prefers-reduced-motion: reduce){
  .voice-bar{ transition:none; }
}

.trust-strip{
  display:flex; flex-wrap:wrap; align-items:center; justify-content:center;
  gap:var(--space-1) var(--space-2); list-style:none; margin:var(--space-1) 0 0; padding:0;
}
.trust-strip-item{ font-size:11px; color:var(--ink-soft); }
.trust-strip-item + .trust-strip-item::before{ content:"·"; color:var(--line-strong); margin-right:var(--space-2); }

@media (prefers-reduced-motion: reduce){
  .conv-action, .conv-textrow{ transition:none; }
  .conv-action:hover{ transform:none; }
}

.ai-intake-cta{
  display:flex; align-items:center; gap:10px; width:100%; text-align:start;
  background:linear-gradient(135deg, var(--forest) 0%, var(--forest-dark) 100%); color:#fff;
  border:none; border-radius:16px; padding:16px 16px; margin-bottom:14px; cursor:pointer;
  font-family:var(--font-body); font-size:14.5px; font-weight:600;
}
.ai-intake-cta span{ flex:1; }
.ai-input-row{ display:flex; gap:8px; margin:10px 0; }
.spin{ animation:ai-spin 0.9s linear infinite; }
@keyframes ai-spin{ from{ transform:rotate(0deg); } to{ transform:rotate(360deg); } }
.ai-analysis-summary{ background:var(--amber-bg); border-radius:10px; padding:10px 12px; margin:8px 0; }
.ai-analysis-header{ display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:600; color:var(--forest); margin-bottom:6px; }
.ai-analysis-summary ul{ margin:4px 0 0; padding-left:18px; }
.ai-analysis-summary li{ font-size:12.5px; color:var(--ink-soft); line-height:1.5; }

/* ---- motion: subtle, purposeful, fast — see docs/design/DESIGN_SYSTEM.md ---- */
.svc-card, .ticket, .quote-card, .ds-card, .portfolio-thumb{ transition:box-shadow var(--motion-base), transform var(--motion-fast); }
button.svc-card:active, button.ticket:active, button.ds-card:active, .portfolio-thumb:active{ transform:scale(0.98); box-shadow:none; }

/* ---- design system: primitives/overlays with no existing analog above ---- */
.ds-card{ text-align:start; background:var(--surface); border:1px solid var(--line-soft); box-shadow:var(--shadow-card); border-radius:14px; padding:14px; font-family:var(--font-body); color:var(--ink); cursor:default; }
button.ds-card{ cursor:pointer; }

.price-tag{ font-family:var(--font-mono); color:var(--ink); font-weight:600; }
.price-tag-sm{ font-size:12.5px; }
.price-tag-md{ font-size:14px; }
.price-tag-lg{ font-size:18px; }

.modal-overlay{ position:fixed; inset:0; background:rgba(22,35,28,0.45); display:flex; align-items:center; justify-content:center; padding:20px; z-index:60; }
.modal-panel{ position:relative; background:var(--surface); border-radius:16px; padding:24px 22px; max-width:360px; width:100%; box-shadow:0 20px 60px rgba(0,0,0,0.25); }
/* Same 28x28px gap and same fix as .sheet-close above -- open corner of a centered
   modal panel, nothing nearby to overlap. */
.modal-close{ position:absolute; top:12px; right:12px; width:28px; height:28px; border-radius:50%; border:none; background:var(--surface-2, var(--sage-bg)); color:var(--ink-soft); display:flex; align-items:center; justify-content:center; cursor:pointer; }
.modal-close::after{ content:""; position:absolute; inset:-8px; }

.timeline{ display:flex; align-items:flex-start; gap:0; margin:14px 0; }
.timeline-step{ flex:1; display:flex; flex-direction:column; align-items:center; text-align:center; position:relative; }
.timeline-step:not(:last-child)::after{ content:""; position:absolute; top:5px; left:50%; width:100%; height:2px; background:var(--line); z-index:0; }
.timeline-step.timeline-done:not(:last-child)::after{ background:var(--forest); }
.timeline-dot{ width:11px; height:11px; border-radius:50%; background:var(--surface); border:2px solid var(--line-strong); z-index:1; }
.timeline-step.timeline-done .timeline-dot{ background:var(--forest); border-color:var(--forest); }
.timeline-step.timeline-active .timeline-dot{ background:var(--amber); border-color:var(--amber); }
.timeline-label{ font-size:10.5px; color:var(--ink-soft); margin-top:6px; max-width:70px; line-height:1.3; }
.timeline-step.timeline-done .timeline-label{ color:var(--ink-soft); }
.timeline-step.timeline-active .timeline-label{ color:var(--ink); font-weight:600; }
`;
