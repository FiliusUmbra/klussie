export const FAMILY_CSS = `
.family-app{flex:1;min-height:0;overflow-y:auto;text-align:start;color:var(--ink);padding:24px clamp(16px,4vw,64px) 48px;overscroll-behavior:contain;}
.family-app > *:not(style){max-width:1120px;margin-inline:auto;}
.family-header{padding-block:4px 20px;}
.family-back,.family-text-button,.family-icon-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:none;border:0;color:var(--forest);font:600 13px var(--font-body);cursor:pointer;min-height:44px;padding:8px;}
.family-back{padding-inline:0;}
.family-title{display:flex;align-items:center;gap:12px;margin-top:10px;}
.family-title svg{color:var(--forest);width:28px;height:28px;}
.family-title h1{font:500 clamp(28px,4vw,40px) var(--font-display);color:var(--forest-dark);margin:0;}
.family-header p{color:var(--ink-soft);margin:8px 0 20px;font-size:14px;}
.family-toolbar{display:flex;align-items:flex-end;flex-wrap:wrap;gap:12px;}
.family-toolbar .family-field{flex:1 1 220px;max-width:400px;margin:0;}
.family-nav{position:sticky;top:0;z-index:2;display:flex;gap:6px;flex-wrap:wrap;background:var(--surface);padding:6px;border:1px solid var(--line);border-radius:16px;margin-block:0 24px;}
.family-nav button{flex:1 1 110px;display:flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:12px;background:none;color:var(--ink-soft);min-height:48px;font:600 14px var(--font-body);cursor:pointer;padding:10px;}
.family-nav button[aria-current]{background:var(--forest);color:white;}
.family-main{display:flex;flex-direction:column;gap:20px;}
.family-card{background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:24px;box-shadow:var(--shadow-card);min-width:0;}
.family-card h2,.family-day-banner h2,.family-welcome h2,.family-editor h2{font:500 24px var(--font-display);color:var(--forest-dark);margin:0;}
.family-card h3{font:600 15px var(--font-body);margin:16px 0;}
.family-day-banner{display:flex;justify-content:space-between;align-items:center;gap:16px;border-radius:20px;background:var(--sage-bg);padding:28px;color:var(--forest);}
.family-day-banner h2{font-size:30px;margin-top:6px;}
.family-day-banner p{margin:8px 0 0;font-size:14px;}
.family-eyebrow{font-size:12px;font-weight:600;}
.family-columns{display:grid;grid-template-columns:1.1fr 1fr;gap:20px;}
.family-section-heading{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;}
.family-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;}
.family-actions .btn-primary,.family-actions .btn-secondary,.family-add{width:auto;min-height:44px;}
.family-empty{padding:24px 0;color:var(--ink-soft);font-size:14px;line-height:1.6;margin:0;}
.family-task-list,.family-event-list,.family-people{list-style:none;padding:0;margin:12px 0 0;}
.family-task{display:flex;align-items:center;gap:12px;padding:16px 0;border-bottom:1px solid var(--line);}
.family-task:last-child{border-bottom:0;}
.family-task-body{flex:1;min-width:0;overflow-wrap:anywhere;}
.family-task strong,.family-event strong,.family-people strong{font-size:14px;}
.family-check{display:flex;align-items:center;justify-content:center;width:44px;height:44px;flex-shrink:0;border:1px solid var(--line-strong);background:var(--surface);border-radius:50%;color:var(--forest);cursor:pointer;}
.family-check:hover{background:var(--sage-bg);}
.family-task.is-done strong{text-decoration:line-through;color:var(--ink-soft);}
.family-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;color:var(--ink-soft);font-size:12px;line-height:1.5;margin-top:4px;}
.family-meta span{display:inline-flex;align-items:center;gap:4px;}
.family-overdue{color:#94481b;}
.family-completed{margin-top:16px;}
.family-completed summary{cursor:pointer;padding:12px 0;font-size:14px;color:var(--ink-soft);}
.family-event{display:flex;align-items:flex-start;gap:12px;text-align:start;width:100%;border:0;border-radius:12px;background:var(--paper);padding:16px;margin:8px 0;color:var(--ink);cursor:pointer;font-family:var(--font-body);}
.family-event.holiday{background:#f7ecd6;}
.family-event-symbol{padding-top:2px;color:var(--forest);}
.family-event-notes{display:block;margin-top:8px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;}
.family-list-previews{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-top:16px;}
.family-list-previews button{display:flex;align-items:center;gap:10px;text-align:start;border:1px solid var(--line);border-radius:12px;background:var(--paper);padding:16px;color:var(--forest);cursor:pointer;font-family:var(--font-body);}
.family-list-previews strong{flex:1;overflow-wrap:anywhere;}
.family-list-tabs,.family-filters{display:flex;gap:8px;flex-wrap:wrap;margin-block:16px;}
.family-list-tabs button,.family-filters button{border:1px solid var(--line-strong);border-radius:999px;background:white;color:var(--forest);padding:10px 16px;min-height:44px;cursor:pointer;font:600 13px var(--font-body);}
.family-list-tabs button[aria-pressed=true],.family-filters button[aria-pressed=true]{background:var(--sage-bg);border-color:var(--forest);}
.family-month-heading{display:flex;align-items:center;justify-content:space-between;margin:16px 0;}
.family-calendar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;}
.family-weekday{text-align:center;font-size:12px;color:var(--ink-soft);padding:8px 0;}
.family-calendar button{position:relative;border:1px solid transparent;border-radius:10px;background:var(--paper);min-height:56px;font:500 14px var(--font-body);color:var(--ink);cursor:pointer;padding:8px;}
.family-calendar button.outside-month{background:white;color:var(--ink-soft);}
.family-calendar button.is-today{border-color:var(--forest);font-weight:800;}
.family-calendar button[aria-pressed=true]{background:var(--forest);color:white;}
.family-calendar-dot{display:block;width:5px;height:5px;margin:4px auto 0;border-radius:50%;background:currentColor;}
.family-people li{display:flex;gap:12px;align-items:center;padding:16px 0;border-bottom:1px solid var(--line);}
.family-people li > div{flex:1;min-width:0;overflow-wrap:anywhere;}
.family-avatar{width:44px;height:44px;flex-shrink:0;background:var(--sage-bg);color:var(--forest);border-radius:50%;display:grid;place-items:center;font-weight:700;}
.family-invite{margin-top:24px;background:var(--paper);border-radius:14px;padding:20px;font-size:14px;line-height:1.6;}
.family-invite textarea{font-family:var(--font-mono);overflow-wrap:anywhere;}
.family-privacy{color:var(--ink-soft);font-size:12px;line-height:1.6;margin-top:24px;}
.family-welcome{text-align:center;background:var(--surface);border:1px solid var(--line);padding:clamp(24px,6vw,64px);border-radius:24px;}
.family-welcome > svg{color:var(--forest);margin-bottom:20px;}
.family-welcome > p{max-width:480px;margin:16px auto 24px;font-size:15px;line-height:1.7;}
.family-welcome .family-actions{justify-content:center;}
.family-field{display:flex;flex-direction:column;gap:8px;margin-top:16px;text-align:start;font-size:13px;font-weight:600;min-width:0;}
.family-field input,.family-field select,.family-field textarea{box-sizing:border-box;width:100%;min-height:44px;border:1px solid var(--line-strong);border-radius:10px;background:white;color:var(--ink);padding:10px 12px;font:400 16px var(--font-body);min-width:0;}
.family-fields-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.modal-panel:has(.family-editor){max-width:520px;}
.family-editor{font-family:var(--font-body);color:var(--ink);text-align:start;}
.family-editor > p{font-size:14px;line-height:1.6;color:var(--ink-soft);}
.family-editor .family-actions{margin-top:24px;}
.family-error{border:1px solid #b94b3a;background:#fff1eb;color:#8e291b;border-radius:12px;padding:14px;font-size:14px;line-height:1.5;margin-block:12px;}
.family-app button:disabled,.family-editor button:disabled{opacity:.55;cursor:wait;}
.family-app :focus-visible,.family-editor :focus-visible{outline:3px solid var(--forest);outline-offset:3px;}
@media(max-width:760px){.family-columns{grid-template-columns:1fr;}.family-card{padding:18px;}.family-nav button{flex-basis:80px;font-size:12px;flex-direction:column;}.family-card:has(.family-calendar){padding:12px;}.family-calendar{gap:2px;}.family-calendar button{min-height:44px;}.family-people li{flex-wrap:wrap;}.family-fields-row{grid-template-columns:1fr;}}
`;
