// Styling for the navigation pieces brought in from the parallel "Klussie via ChatGPT"
// pass on 2026-09-30 (DailyHome.jsx, WorkspaceSwitcher.jsx's own place-picker, a tucked-
// away language disclosure). Kept as its own file, matching appStyles.js/homeStyles.js's
// own precedent of one CSS string per concern.
//
// SOURCE VERSION TRIMMED, NOT COPIED WHOLESALE — the source calmStyles.js also carried a
// second half (`.app-stage .view`, `.app-stage .tabbar`, `.app-stage .topbar`...) written
// against the pre-redesign `.stage`/`.phone`/`.topbar`/BottomNav.jsx chrome this session
// already replaced with `.app-shell`/`.app-header`/`.app-sidebar`/AppNav.jsx (see
// appStyles.js's own header). Those rules targeted classes that no longer exist in this
// shell and would have been dead weight; only the shell-agnostic rules below — genuinely
// new UI, not old UI re-skinned — made the trip.
export const CALM_CSS = `
.help-back{display:flex;align-items:center;gap:8px;width:100%;max-width:720px;margin:0 auto 4px;padding:0;min-height:44px;border:0;background:none;color:var(--forest);font:500 13px var(--font-body);cursor:pointer;}
[dir="rtl"] .help-back svg{transform:scaleX(-1);}
.daily-home{max-width:720px;margin-inline:auto;padding:var(--space-4) var(--space-5) calc(var(--space-6) + env(safe-area-inset-bottom, 0px));display:flex;flex-direction:column;gap:28px;text-align:start;}
.daily-heading,.daily-section-title{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;}
.daily-heading h1{font:500 34px var(--font-display);color:var(--forest-dark);margin:6px 0 0;}
.daily-heading p,.daily-section-title > span{font-size:13px;color:var(--ink-soft);margin:0;}
.daily-heading .btn-secondary{display:flex;gap:8px;width:auto;min-height:44px;align-items:center;}
.daily-heading-actions{display:flex;align-items:center;gap:8px;}
/* Reusable icon-only button — same 28px-visual/44px-hit-area shape as .modal-close
   (appStyles.js), generalized rather than duplicated since PageTour.jsx's replay
   trigger here is the first of what will likely be more icon-only controls. */
.icon-btn{position:relative;width:28px;height:28px;border-radius:50%;border:none;background:var(--surface-2, var(--sage-bg));color:var(--ink-soft);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;}
.icon-btn::after{content:"";position:absolute;inset:-8px;}
.daily-shortcuts{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.daily-shortcuts button{display:flex;align-items:center;gap:12px;min-height:56px;padding:16px;background:var(--surface);border:1px solid var(--line);border-radius:12px;font:500 14px var(--font-body);color:var(--forest);cursor:pointer;}
.daily-shortcuts button svg:last-child{margin-inline-start:auto;}
[dir="rtl"] .daily-shortcuts button svg:last-child,[dir="rtl"] .daily-row > svg:last-child,[dir="rtl"] .daily-more svg:last-child{transform:scaleX(-1);}
/* HomeCategoryTiles.jsx — a CSS GRID (wraps to a second row), not the horizontal-
   scrolling flex row HomeCategoryRow.jsx's own header warns against reviving; see that
   file's own header for the full history. Icon backgrounds alternate amber/sage, the
   same two accent tokens the rest of this screen's own icon badges already draw from. */
.home-category-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
.home-category-tile{display:flex;flex-direction:column;align-items:center;gap:7px;min-height:76px;padding:12px 6px;background:var(--surface);border:1px solid var(--line);border-radius:14px;font-family:var(--font-body);cursor:pointer;}
.home-category-tile-icon{width:38px;height:38px;border-radius:11px;background:var(--amber-bg);color:var(--amber-dark);display:flex;align-items:center;justify-content:center;}
.home-category-tile-alt .home-category-tile-icon{background:var(--sage-bg);color:var(--forest-dark);}
.home-category-tile-label{font-size:11px;font-weight:600;color:var(--ink);text-align:center;line-height:1.25;}

.messages-filter{display:flex;gap:8px;margin-bottom:14px;}
.messages-filter-pill{min-height:44px;padding:8px 16px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--ink-soft);font:600 12px var(--font-body);cursor:pointer;}
.messages-filter-pill-on{background:var(--forest);border-color:var(--forest);color:#fff;}
.daily-section{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px;}
.daily-section-title{margin-bottom:12px;}
.daily-section-title h2{font:500 21px var(--font-display);margin:0;color:var(--forest-dark);}
.daily-section-title button,.daily-more{border:0;background:none;color:var(--forest);font:500 13px var(--font-body);min-height:44px;cursor:pointer;}
.daily-section-title select{max-width:100%;min-height:44px;border:1px solid var(--line);border-radius:8px;padding:8px;background:var(--surface);color:var(--ink);}
.daily-empty{color:var(--ink-soft);font-size:14px;line-height:1.6;margin:12px 0;}
.daily-row{display:flex;width:100%;align-items:center;gap:12px;min-height:64px;text-align:start;background:none;border:0;border-bottom:1px solid var(--line);padding:14px 0;color:var(--ink);font:400 14px var(--font-body);cursor:pointer;}
.daily-row > span:first-child,.daily-row > svg + span{flex:1;min-width:0;overflow-wrap:anywhere;}
.daily-row strong{font-weight:500;}
.daily-row small{display:block;color:var(--ink-soft);margin-top:6px;font-size:12px;}
.daily-row > svg{flex-shrink:0;color:var(--forest);}
.daily-count{border-radius:20px;background:var(--sage-bg);padding:4px 8px;}
.daily-more{display:flex;align-items:center;gap:8px;margin-top:12px;}
@media(max-width:799px){.daily-home{gap:20px;}.daily-section{padding:16px;}.daily-shortcuts button{padding:12px;}}

/* The workspace select (WorkspaceSwitcher.jsx) — a compact control regardless of how
   many memberships a person has, so it stays one element next to the Family button and
   the language disclosure below, not a row that grows unboundedly. */
.place-picker{min-height:44px;max-width:200px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--ink);padding:8px 12px;font:500 13px var(--font-body);}

/* The language switcher tucked behind a disclosure in .app-header — decluttering the
   header now that it can hold Family + the workspace select too. LanguageSwitcher.jsx
   itself is unchanged; only how AppShell.jsx wraps it changed. */
.shell-preferences{position:relative;}
.shell-preferences summary{cursor:pointer;list-style:none;min-width:44px;min-height:44px;display:grid;place-items:center;font:600 12px var(--font-body);color:var(--ink-soft);border-radius:10px;}
.shell-preferences summary::-webkit-details-marker{display:none;}
.shell-preferences summary:hover{background:var(--line-soft);}
.shell-preferences-panel{position:absolute;inset-inline-end:0;top:48px;padding:16px;background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow-card);z-index:80;}
`;
