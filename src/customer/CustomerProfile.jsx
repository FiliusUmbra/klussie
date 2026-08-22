// The customer's own profile: what they've asked for, what they've had done, what they
// said about it, and the way back into the tour.
//
// WorkspaceSwitcher and LanguageSwitcher both live here too, not only in AppShell's own
// topbar — that topbar is `display:none` below 460px (appStyles.js), which is every real
// phone (the app's actual, primary surface; the desktop-width phone mockup is the
// exception). A real professional always holds two live memberships (their personal
// workspace plus the one "become a pro" creates) and had no way to reach the second one
// at all on a real device before this — not a demo-only gap, a real dead end; changing
// language was equally unreachable. Profile is where every other account-level action
// (edit profile, sign out) already lives; these are the same kind of action.
//
// BECOMING A PRO ITSELF HAD THE IDENTICAL GAP, ONE LEVEL EARLIER — UNIFIED_PRODUCT_IA_REVIEW.md §5
//
// The switcher and language picker above were unreachable conveniences for someone who
// already held a second capability. This was worse: BecomeProSheet's only trigger lived
// behind that same topbar-only control, meaning the on-ramp itself — the literal
// mechanism behind "capabilities expand as responsibilities grow" — had no real,
// reachable entry point on an actual phone at all, for anyone who hadn't already
// expanded. Same fix, same place: an account-level action belongs here with every other
// one, not behind a control invisible on the app's own primary surface.
import { useState } from "react";
import { LogOut, HelpCircle, Briefcase } from "lucide-react";
import { useLang } from "../lib/lang";
import { useAuth } from "../lib/auth.jsx";
import { Avatar, Rating, QuoteCard } from "../design-system";
import { EditProfileSheet } from "../profile/EditProfileSheet.jsx";
import { WorkspaceSwitcher } from "../shell/WorkspaceSwitcher.jsx";
import { LanguageSwitcher } from "../shell/LanguageSwitcher.jsx";
import { completedCount, reviewedRequests } from "../lib/requestStatus.js";

export function CustomerProfile({ requests, onReplayTour, onBecomePro }) {
  const { t, serviceInfo } = useLang();
  const { user, profile, proProfile, signOut } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const completed = completedCount(requests);
  const reviews = reviewedRequests(requests);
  const displayName = profile?.full_name || t.profileYou;
  return (
    <div className="pad">
      <div className="profile-head"><Avatar url={profile?.avatar_url} initials={displayName[0]} size="lg" /><div><div className="h1" style={{ fontSize: 19 }}>{displayName}</div><div className="ticket-sub">{user.email}</div></div></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
        <WorkspaceSwitcher t={t} />
        <LanguageSwitcher light />
      </div>
      <div className="stat-row">
        <div className="stat"><div className="stat-num">{requests.length}</div><div className="stat-label">{t.requestsSent}</div></div>
        <div className="stat"><div className="stat-num">{completed}</div><div className="stat-label">{t.jobsCompleted}</div></div>
      </div>
      <div className="section-title">{t.yourReviews}</div>
      {reviews.length === 0 && <div className="empty-block"><p>{t.noReviewsYet}</p></div>}
      {reviews.map((r) => (
        <QuoteCard key={r.id}><div className="quote-name">{serviceInfo(r.serviceId).name}</div><Rating value={r.review.stars} size={12} /><p className="quote-msg">"{r.review.text}"</p></QuoteCard>
      ))}
      {/* The real, reachable "become a pro" entry point — see this file's own header.
          Only for someone who hasn't already (proProfile null); a real dual-role person
          viewing their Personal Workspace already has one and needs no invitation. */}
      {onBecomePro && !proProfile && (
        <div className="empty-block" style={{ marginTop: 18 }}>
          <Briefcase size={22} color="var(--ink-soft)" />
          <p>{t.becomeProPrompt}</p>
          <button className="btn-primary" onClick={onBecomePro}>{t.becomeProBtn}</button>
        </div>
      )}

      {/* Profiel → Hulp & uitleg → Rondleiding opnieuw bekijken. A tour that can only
          ever be seen once is a tour nobody can go back to when they finally need it. */}
      {onReplayTour && (
        <>
          <div className="section-title" style={{ marginTop: 18 }}>{t.helpSectionTitle}</div>
          <button className="btn-secondary" onClick={onReplayTour}>
            <HelpCircle size={13} /> {t.helpReplayTour}
          </button>
        </>
      )}
      <button className="btn-secondary" style={{ marginTop: 14 }} onClick={() => setEditOpen(true)}>{t.editProfileBtn}</button>
      <button className="btn-secondary" style={{ marginTop: 8 }} onClick={signOut}><LogOut size={13} /> {t.authSignOut}</button>
      {editOpen && <EditProfileSheet onClose={() => setEditOpen(false)} />}
    </div>
  );
}
