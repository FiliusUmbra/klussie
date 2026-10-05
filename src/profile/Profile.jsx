// The unified "themselves" screen — UNIFIED_PROFILE_DESIGN.md, implementing
// UNIFIED_PRODUCT_IA_REVIEW.md §2/§9.3: one screen owned by subject, not by backend role,
// revealing more sections as capability grows rather than three separate files that happen
// to look similar because one was built by copying the other.
//
// Replaces src/customer/CustomerProfile.jsx and src/pro/ProProfile.jsx — folded in near
// verbatim (same markup classes, same copy, same behavior; see the design note's own §4 for
// what this deliberately does not change). `variant` selects which capability-gated
// sections render; the shared sections (identity header, switchers, help/replay-tour, edit
// profile, sign out) render once regardless of variant.
//
// Operator is NOT a third variant here — its Profile tab is genuinely the unified shape's
// own minimum (no avatar, no stats, no edit-profile), not a third audience needing the same
// capability-gated sections this file composes. See ProfileIdentityHeader.jsx's own header
// for why forcing it through here would change Operator's actual visual output. Operator
// reuses WorkspaceSwitcher and SignOutButton directly instead (OperatorApp.jsx).
import { useState } from "react";
import { HelpCircle, Briefcase, Users, House, ClipboardList } from "lucide-react";
import { useLang } from "../lib/lang";
import { useAuth } from "../lib/auth.jsx";
import { TrustBadge } from "../design-system";
import { WorkspaceSwitcher } from "../shell/WorkspaceSwitcher.jsx";
import { LanguageSwitcher } from "../shell/LanguageSwitcher.jsx";
import { ProfileIdentityHeader } from "./ProfileIdentityHeader.jsx";
import { StatRow } from "./StatRow.jsx";
import { SignOutButton } from "./SignOutButton.jsx";
import { EditProfileSheet } from "./EditProfileSheet.jsx";
import { JoinBusinessSheet } from "./JoinBusinessSheet.jsx";
import { trustScore } from "../lib/pros";
import { interpolate } from "../lib/homeStrings.js";

export function Profile({
  variant,
  onReplayTour,
  // customer-only
  onBecomePro,
  onManageHome,
  onViewJobHistory,
  // pro-only
  proInfo,
  completedCount: proCompletedCount,
  onProfileSaved,
}) {
  const { t, fmt, proBadgeLabel } = useLang();
  const { user, profile, proProfile, signOut } = useAuth();
  const [editOpen, setEditOpen] = useState(false);

  const [joinBusinessOpen, setJoinBusinessOpen] = useState(false);

  const displayName = profile?.full_name || t.profileYou;

  return (
    <div className="pad">
      {variant === "customer" ? (
        <ProfileIdentityHeader
          avatarUrl={profile?.avatar_url}
          initials={displayName[0]}
          name={displayName}
          subtitle={<div className="ticket-sub">{user.email}</div>}
        />
      ) : (
        <ProfileIdentityHeader
          avatarUrl={proInfo.avatarUrl}
          initials={proInfo.initials}
          name={proInfo.name || t.proFallbackName}
          subtitle={<TrustBadge newLabel={t.proNewBadge} rating={proInfo.rating} reviewCount={proInfo.reviews} fmt={fmt} ratingLabel={interpolate(t.ratingLabel, { value: proInfo.rating })} />}
        />
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
        <WorkspaceSwitcher t={t} />
        <LanguageSwitcher light />
      </div>

      {variant === "pro" && proProfile.bio && <p className="sheet-blurb">{proProfile.bio}</p>}

      {/* UX_TAB_SCOPE.md C5, 2026-09-29 — "remove request-count statistics from the main
          settings hierarchy." The pro variant's own stat row is a genuinely different
          thing (reputation signals a customer can also see on the pro's public profile,
          not a private activity count) and stays; only the customer one — a raw "16
          requests sent" tally with no decision it supports — is gone. */}
      {variant === "pro" && (
        <StatRow items={[
          { key: "done", value: proCompletedCount, label: t.proJobsDone },
          { key: "status", value: proBadgeLabel(proInfo.badgeTier) || "—", label: t.proStatus },
          { key: "trust", value: trustScore(proInfo), label: t.trustScoreLabel },
        ]} />
      )}

      {/* UX_TAB_SCOPE.md C5 — "move property creation into My Home and reviews into job
          history, with optional account shortcuts." Both used to be full, duplicated
          content here (every property as its own card, every review as its own quote) —
          My Home (property switcher + Add property, MyHomeScreen.jsx) and Requests
          (History segment, RequestDetailSheet.jsx) are now each that content's one real
          home; these are shortcuts to them, not a second copy. */}
      {variant === "customer" && (onManageHome || onViewJobHistory) && (
        <>
          {onManageHome && (
            <button className="btn-secondary" style={{ marginBottom: 8 }} onClick={onManageHome}>
              <House size={13} aria-hidden="true" /> {t.manageHomesBtn}
            </button>
          )}
          {onViewJobHistory && (
            <button className="btn-secondary" style={{ marginBottom: 14 }} onClick={onViewJobHistory}>
              <ClipboardList size={13} aria-hidden="true" /> {t.viewJobHistoryBtn}
            </button>
          )}
        </>
      )}

      {/* The real, reachable "become a pro" entry point (UNIFIED_PRODUCT_IA_REVIEW.md §5).
          Only for someone who hasn't already (proProfile null); a real dual-role person
          viewing their Personal Workspace already has one and needs no invitation. */}
      {variant === "customer" && onBecomePro && !proProfile && (
        <div className="empty-block" style={{ marginTop: 4, marginBottom: 14 }}>
          <Briefcase size={22} color="var(--ink-soft)" />
          <p>{t.becomeProPrompt}</p>
          <button className="btn-primary" onClick={onBecomePro}>{t.becomeProBtn}</button>
        </div>
      )}

      {/* Profiel → Hulp & uitleg → Rondleiding opnieuw bekijken. A tour that can only ever
          be seen once is a tour nobody can go back to when they finally need it. Same block,
          same strings, for both variants — folded from CustomerProfile.jsx/ProProfile.jsx's
          own identical copies. */}
      {onReplayTour && (
        <>
          <div className="section-title" style={{ marginTop: 18 }}>{t.helpSectionTitle}</div>
          <button className="btn-secondary" onClick={onReplayTour}>
            <HelpCircle size={13} /> {t.helpReplayTour}
          </button>
        </>
      )}
      <button className="btn-secondary" style={{ marginTop: variant === "pro" ? 10 : 14 }} onClick={() => setEditOpen(true)}>{t.editProfileBtn}</button>
      {/* Pro Workspace remarks, 2026-09-12 (Theme C) — available to either variant: a
          customer taking on staff work for someone else's business, or a pro joining a
          second one, are both real, not gated behind already being a pro oneself. */}
      <button className="btn-secondary" style={{ marginTop: 8 }} onClick={() => setJoinBusinessOpen(true)}>
        <Users size={13} aria-hidden="true" /> {t.joinBusinessBtn}
      </button>
      <SignOutButton onClick={signOut} label={t.authSignOut} style={{ marginTop: 8 }} />

      {editOpen && (
        <EditProfileSheet onClose={() => setEditOpen(false)} onSaved={variant === "pro" ? onProfileSaved : undefined} />
      )}
      {joinBusinessOpen && (
        <JoinBusinessSheet t={t} actorRef={user.id} onClose={() => setJoinBusinessOpen(false)} />
      )}
    </div>
  );
}
