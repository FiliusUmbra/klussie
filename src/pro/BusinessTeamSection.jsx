// Business > Team — UX_TAB_SCOPE.md P3, 2026-09-28. Moved here verbatim from Profile.jsx's
// own pro variant (Pro Workspace remarks, Theme C): "move... business membership requests
// out of personal Account into the appropriate business section." api.list_join_requests()
// itself refuses (throws) a caller without membership.join.approve on this workspace
// (ADR-0027) — resolving to [] on ANY failure, permission refusal included, is deliberately
// indistinguishable from "nothing pending": an employee with no approval rights sees an
// empty Team screen, never an error banner for a capability they don't have.
//
// UNLIKE Profile.jsx's own version of this section, an explicit empty state is shown below
// rather than nothing at all. That silence was correct when this was one collapsible block
// buried inside a much longer Account page — a permanently-absent row cost nothing. It is
// not correct for a screen a pro navigates to ON PURPOSE by name ("Team"): a dedicated
// destination that renders visibly blank looks broken, not quiet.
import { useEffect, useState } from "react";
import { useLang } from "../lib/lang";
import { useAuth } from "../lib/auth.jsx";
import { Button, QuoteCard } from "../design-system";
import { fetchJoinRequests, decideJoinRequest } from "../lib/workspaceJoin.js";

export function BusinessTeamSection() {
  const { t } = useLang();
  const { user, activeWorkspace } = useAuth();
  // Null while unresolved, [] once resolved with genuinely nothing pending (or a
  // permission refusal — see this file's own header).
  const [joinRequests, setJoinRequests] = useState(null);
  const [decidingRequestId, setDecidingRequestId] = useState(null);
  const [joinRequestsError, setJoinRequestsError] = useState("");

  const refreshJoinRequests = () => fetchJoinRequests(activeWorkspace?.workspace_id).then(setJoinRequests);

  useEffect(() => {
    if (!activeWorkspace?.workspace_id) return;
    refreshJoinRequests().catch(() => setJoinRequests([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.workspace_id]);

  // Approve/decline each carry their own busy state (decidingRequestId), not a single
  // shared flag — two real pending requests must be independently actionable, never both
  // disabled because one is mid-flight.
  const decideRequest = async (requestId, decision) => {
    setDecidingRequestId(requestId);
    setJoinRequestsError("");
    try {
      await decideJoinRequest(requestId, decision, user.id);
    } catch {
      setJoinRequestsError(t.joinRequestDecideFailed);
      setDecidingRequestId(null);
      return;
    }
    try {
      await refreshJoinRequests();
    } catch {
      // Best-effort; the decision itself already succeeded regardless.
    } finally {
      setDecidingRequestId(null);
    }
  };

  if (joinRequests === null) return null;

  if (joinRequests.length === 0) {
    return <div className="empty-block"><p>{t.teamNoRequestsMsg}</p></div>;
  }

  return (
    <>
      {joinRequestsError && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start", marginBottom: 10 }}>{joinRequestsError}</div>}
      {joinRequests.map((req) => (
        <QuoteCard key={req.request_id}>
          <div className="quote-name">{req.full_name || t.counterpartFallbackName}</div>
          {req.message && <p className="quote-msg">"{req.message}"</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Button variant="secondary" disabled={decidingRequestId === req.request_id} onClick={() => decideRequest(req.request_id, "declined")}>
              {t.joinRequestDeclineBtn}
            </Button>
            <Button variant="primary" disabled={decidingRequestId === req.request_id} onClick={() => decideRequest(req.request_id, "approved")}>
              {t.joinRequestApproveBtn}
            </Button>
          </div>
        </QuoteCard>
      ))}
    </>
  );
}
