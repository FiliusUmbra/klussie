// Pro Workspace remarks, 2026-09-12 (Theme C) — "Option to join an existing/registered
// business, confirmed by its owner or admin." The requester's own half of that; the
// owner's own approval queue is Profile.jsx's own "Aanvragen om lid te worden" section.
//
// SEARCH-THEN-PICK, NOT A FREE-TEXT WORKSPACE ID
//
// A person asking to join a business knows its name, not a uuid — search-as-you-type
// against workspace.search_professional_workspaces_for_caller() (migration 0220), capped
// at 10 real, active professional workspaces the caller does not already belong to.
//
// ONE MESSAGE, NEVER THE RAW BACKEND ONE, FOR THE TWO REAL REFUSALS THAT MATTER TO THE
// PERSON ASKING
//
// request_to_join_for_caller()'s own two named guards (already a pending request,
// already a member) are real, recoverable states worth telling apart — the same
// reasoning authErrors.js already documents for sign-in — everything else collapses to
// one generic, localized message, matching this codebase's own established anti-pattern
// fix (documents.js's own header names it).
import { useState } from "react";
import { Search, Check } from "lucide-react";
import { Drawer } from "../design-system";
import { searchProfessionalWorkspaces, requestToJoinWorkspace } from "../lib/workspaceJoin.js";

function decodeRequestError(err, t) {
  const msg = err?.message || "";
  if (msg.includes("already has a pending request")) return t.joinRequestAlreadyPending;
  if (msg.includes("is already a member of")) return t.joinRequestAlreadyMember;
  return t.joinRequestSendFailed;
}

export function JoinBusinessSheet({ t, actorRef, onClose }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  // No debounce: search_professional_workspaces_for_caller() is a single, capped,
  // indexed-by-nothing-fancier-than-ilike lookup (this migration's own header explains
  // why it isn't onto the generic search engine) — cheap enough to run on every
  // keystroke, the same restraint IntentSuggestions.jsx's own chip filter already takes.
  const runSearch = async (value) => {
    setQuery(value);
    setError("");
    if (!value.trim()) { setResults(null); return; }
    setSearching(true);
    try {
      const rows = await searchProfessionalWorkspaces(value.trim());
      setResults(rows);
    } catch {
      // A failed search looks like "nothing found" rather than a dead end — the search
      // box itself stays usable, and retyping tries again.
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const submit = async () => {
    if (!picked) return;
    setBusy(true);
    setError("");
    try {
      await requestToJoinWorkspace(picked.workspace_id, message, actorRef);
      setSent(true);
    } catch (err) {
      setError(decodeRequestError(err, t));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Drawer onClose={onClose} closeLabel={t.closeBtn}>
        <div className="sheet-title">{t.joinBusinessTitle}</div>
        <div className="empty-block">
          <Check size={22} color="var(--forest)" />
          <p>{t.joinBusinessSentMsg}</p>
        </div>
        <button className="btn-primary" onClick={onClose}>{t.closeBtn}</button>
      </Drawer>
    );
  }

  return (
    <Drawer onClose={onClose} closeLabel={t.closeBtn}>
      <div className="sheet-title">{t.joinBusinessTitle}</div>

      <label className="field-label" htmlFor="join-business-search">{t.joinBusinessSearchLabel}</label>
      <div className="search" style={{ marginBottom: 14 }}>
        <Search size={15} color="var(--ink-soft)" />
        <input
          id="join-business-search"
          value={query}
          onChange={(e) => { setPicked(null); runSearch(e.target.value); }}
          placeholder={t.joinBusinessSearchPlaceholder}
        />
      </div>

      {!picked && results && !searching && results.length === 0 && (
        <div className="fineprint" style={{ justifyContent: "flex-start", marginBottom: 14 }}>{t.joinBusinessNoResults}</div>
      )}

      {!picked && results && results.length > 0 && (
        <div className="chiprow" style={{ flexWrap: "wrap" }}>
          {results.map((r) => (
            <button key={r.workspace_id} type="button" className="chip" onClick={() => { setPicked(r); setResults(null); }}>
              {r.name}
            </button>
          ))}
        </div>
      )}

      {picked && (
        <>
          <div className="ticket" style={{ padding: 12, marginBottom: 14, cursor: "default" }}>
            <div className="ticket-title">{picked.name}</div>
          </div>

          <label className="field-label" htmlFor="join-business-message">{t.joinBusinessMessageLabel}</label>
          <textarea
            id="join-business-message"
            className="textarea"
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />

          {error && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start" }}>{error}</div>}

          <button className="btn-primary" disabled={busy} onClick={submit}>{t.joinBusinessSubmitBtn}</button>
        </>
      )}
    </Drawer>
  );
}
