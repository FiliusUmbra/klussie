// SLICE_5_UNIFIED_PROFILE_DESIGN.md §3a — the avatar+name block CustomerProfile.jsx and
// ProProfile.jsx each carried as an identical `profile-head` div, differing only in what
// rendered below the name (an email line for a customer, TrustBadge for a pro). `subtitle`
// takes that one real difference as a slot rather than a branching prop, so this component
// stays audience-agnostic — it renders whatever identity line its caller decides is right,
// same as `onReplayTour`/`onBecomePro` already work as optional props one level up.
//
// Operator's own identity block is deliberately NOT built on this component — it has no
// avatar at all (an internal operator identity, not a person's own profile picture) and a
// different CSS shape (`hello`, not `profile-head`). Forcing it through here would either
// render an empty avatar circle that never existed before or require a `hideAvatar` escape
// hatch — both changes to Operator's actual visual output, which
// SLICE_5_UNIFIED_PROFILE_DESIGN.md §4 explicitly rules out. See OperatorApp.jsx's own
// Profile tab for the block this component deliberately does not replace.
import { Avatar } from "../design-system";

export function ProfileIdentityHeader({ avatarUrl, initials, name, subtitle }) {
  return (
    <div className="profile-head">
      <Avatar url={avatarUrl} initials={initials} size="lg" />
      <div>
        <div className="h1" style={{ fontSize: 19 }}>{name}</div>
        {subtitle}
      </div>
    </div>
  );
}
