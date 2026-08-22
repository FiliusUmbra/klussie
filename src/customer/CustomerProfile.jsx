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
import { useState } from "react";
import { LogOut, HelpCircle } from "lucide-react";
import { useLang } from "../lib/lang";
import { useAuth } from "../lib/auth.jsx";
import { Avatar, Rating, QuoteCard } from "../design-system";
import { EditProfileSheet } from "../profile/EditProfileSheet.jsx";
import { WorkspaceSwitcher } from "../shell/WorkspaceSwitcher.jsx";
import { LanguageSwitcher } from "../shell/LanguageSwitcher.jsx";
import { completedCount, reviewedRequests } from "../lib/requestStatus.js";

export function CustomerProfile({ requests, onReplayTour }) {
  const { t, serviceInfo } = useLang();
  const { user, profile, signOut } = useAuth();
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
