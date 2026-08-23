# Slice 4 — Conversation & Notification Activation: Scoping

**This document owns:** the concrete work-package breakdown for
[`PLATFORM_ACTIVATION_PROGRAMME.md`](PLATFORM_ACTIVATION_PROGRAMME.md)
§5, Slice 4. It does not own the Programme's cross-cutting reasoning
(the Four Questions, §2; the Activation Priority, §1.1), which this
document applies rather than restates.

**Status.** WP 4.0 shipped (migration `0166_notification_contract.sql`,
statically tested in
`supabase/migrations/__tests__/notificationApiContract.test.js`). WP
4.1 (producer) and WP 4.2 (client inbox surface) are scoped below, not
yet built — WP 4.1 is next. Originally written under the product-phase
mandate, after Slice 3's own close (WP 3.0-3.3 shipped and verified
live, PRs #77-80); WP 3.4 (reputation) is correctly not next — it needs
real record volume this session's own test data doesn't constitute
(see Slice 3's own document, §3, WP 3.4's entry). Slice 4 is next in
the Programme's own sequencing (§5).

---

## 1 · The Four Questions (Programme §2), answered before scoping

**1 · Homeowner.** The one inbox (`ROADMAP_A` §3.2, Phase A3) — today,
a customer's only signal that a pro replied is opening the Messages
tab and looking. No badge, no summary, nothing outside an open
conversation.

**2 · Professional.** The same inbox mechanism carries leads, messages
and schedule alerts (`ROADMAP_B` §7) — this is also where `ROADMAP_B`
names the platform risk this slice closes: *"no notifications outside
an open tab."*

**3 · Platform Operations.** Notification delivery health becomes a
real, watched pipeline (`ROADMAP_C` §2.1's table) — out of scope for
this slice's own work packages, named because §2's own discipline
requires naming it, not deferring the question.

**4 · Legacy replaced.** The legacy `conversations`/`messages` tables
— already largely superseded (§2.1 below); nothing legacy stands in
for Notification, because nothing before this platform ever had one.

---

## 2 · What was found before scoping this

### 2.1 · Conversation is NOT a gap — it is already the live path

Checked directly, not assumed: `src/lib/messages.js`'s own header
states the cutover plainly — *"Conversation engine
(work.conversations/conversation_participants/messages)"* — and every
read/write in that file already targets `work.*`/`api.*`, with
Realtime (`work.messages`/`work.conversation_participants`), read
receipts, and message translation all live. `ConversationSheet.jsx`,
`MessagesList.jsx`, and the message-the-pro entry points shipped across
Slice 2 (PR #74, closing the customer-side mirror) already exercise
this real engine. **This slice's Conversation half is functionally
already activated** — the remaining legacy-retirement half (deleting
the old tables/write paths, not just having a live replacement) is the
same kind of gated, production-irreversible work WP 2.7 already
named, not a new build.

### 2.2 · Notification is a real, complete, ENTIRELY unreached backend — the identical shape Slice 3 opened with

Epic 19 (migrations 0115-0118) built: `platform.notifications` /
`platform.notification_deliveries` (workspace-scoped notification +
per-recipient delivery receipts, §32's own two-table split),
`platform.notification_preferences`, and a full contract —
`raise_notification`, `mark_notification_delivered/seen/acted`,
`escalate_notification`, `set_notification_preference`,
`notification_preferences_for_membership`, and — the one this slice
needs most — **`platform.my_inbox()`, already correctly shaped**:
composed at read time (never materialised), scoped to `auth.uid()`
across every workspace the caller currently holds a live membership
in, exactly the shape a client read needs.

**Zero client code anywhere references any of it** (`grep -rln
"notifications\|notification" src/lib/*.js src/*/*.jsx` returns
nothing). Unlike Service Records, this is not merely unreached — **it
is unproduced**: `grep -rln "raise_notification"
supabase/migrations/*.sql` finds only 0117's own definition. No other
engine, no consumer, nothing anywhere calls it. 0115's own header
anticipated exactly this moment: *"RLS is enabled with no policy...
until a real read surface (WP 19.03's `my_inbox()`) exists; no `api.*`
delegate exists yet either (no client caller this epic)."* This
migration is that read surface's own client contract, four epics
later.

### 2.3 · Two distinct problems live under one slice name — a real distinction, not a formality

**A contract with nothing producing notifications is an empty inbox
forever** — the identical shape Slice 3's own §2.3 resolved for
Service Records (a contract existing is not the same as the product
capability being real). Three separable pieces:

- **WP 4.0 — the contract itself**: `api.*` delegates for the read
  (`my_inbox`) and the client-safe writes (mark seen/acted, set
  preferences) — real caller-authorization added, matching every
  `_for_caller` wrapper this programme has built since WP 2.3.
- **WP 4.1 — a real producer**: nothing raises a notification without
  one. `work.messages`'s own write path already emits
  `conversation.message.sent` (checked directly, `0147`) — a real,
  existing substrate for a background consumer (the ADR-0031 pattern,
  WP 2.4's own shape) that raises a notification for the conversation's
  *other* participant on each new message. Not built in this pass —
  named here as the concrete next step once WP 4.0 ships, because an
  inbox contract with no producer behind it is the same "zero
  discrepancies is true and worthless" trap named twice already.
- **WP 4.2 — client UI**: a real inbox surface (a badge + a list),
  the actual "one inbox" `ROADMAP_A`/`ROADMAP_B` both name.

**"No notifications outside an open tab" (the named platform risk) is
NOT solved by WP 4.0-4.2 alone.** That risk is about push delivery —
a channel this schema's own `channel` column (`'email'`, `'push'`,
`'in_app'`, per 0115's own comment) already anticipates but nothing
implements. Browser push requires a service worker, a push
subscription flow, VAPID keys or a push provider, and a real user-facing
permission prompt — a materially different capability class than an
in-app inbox, and a real infrastructure decision the mandate's own
stop-conditions name explicitly (*"production infrastructure changes
requiring owner approval"*). **Not scoped as a work package here** —
named as a real, deliberately deferred decision for the platform owner,
not silently assumed either way.

---

## 3 · Work packages

### WP 4.0 — Notification read/write contract — **shipped**, 2026-08-23

`api.my_inbox()` (thin delegate — `platform.my_inbox()` is already
correctly `auth.uid()`-scoped, no wrapper logic needed beyond the
SECURITY DEFINER shape every read delegate in this codebase already
has). Two new `platform.*_for_caller()` wrappers — `mark_notification_
seen_for_caller`/`mark_notification_acted_for_caller` — checking the
caller's own identity actually owns the delivery row before delegating
(0117's own raw functions do no caller check at all, the identical gap
WP 3.0 found and closed for Service Records). Two more for
preferences — `set_notification_preference_for_caller`/
`notification_preferences_for_caller` — checking the caller holds the
named membership. `raise_notification`/`escalate_notification` stay
engine-only, deliberately: `raise_notification` has no legitimate
client caller (a person does not raise their own notification), and
`escalate_notification`'s own comment frames it as an automatic
response to an unacknowledged item — a future consumer's job, not a
button. `mark_notification_delivered` likewise stays engine-only for
now: for the one channel this slice's UI will use (`in_app`),
"delivered" and "seen" collapse into the same moment (opening the
inbox), so there is no real client action to wire it to yet.

### WP 4.1 — A real producer: the conversation-message notification consumer

Depends on WP 4.0. A `pg_cron`-polled background consumer (ADR-0031,
the canonical pattern WP 2.4 established), reading `platform.events`
for `conversation.message.sent`, resolving the conversation's other
participant(s), and calling `raise_notification()` with a real
headline. The first, and most obviously valuable, notification source
— everything else (`ROADMAP_B` §7's "schedule alerts,"
`ROADMAP_C`'s obligation-due notifications) is a second producer onto
the same, now-real engine, not a prerequisite to shipping this one.

### WP 4.2 — Client: a real inbox surface

Depends on WP 4.0 (and is only meaningfully non-empty once WP 4.1
ships). A badge (unread count, `BottomNav`'s own established pattern —
`unreadTotal(conversations)` already does this for Messages) plus a
list surface. Not scoped in file-and-line detail here — smaller and
more mechanical than WP 3.3's own editor, but real screen-level
choices (does it replace or sit beside the Messages tab? does a
notification's own tap-through resolve `subject_type`/`subject_id`
back to the right screen?) belong to implementation, informed by
WP 4.1 actually existing first.

### Not scoped — browser push delivery ("no notifications outside an open tab")

See §2.3. A real platform-owner decision (external push provider,
VAPID/service-worker infrastructure, a new permission prompt in the
product), not a client engineering task this document can just assign
itself. Flagged for the platform owner, the same way [[klussie AI
intake engine]]'s own Anthropic API key gap stays a named, not
silently worked-around, blocker.

---

## 4 · Sequencing

```
WP 4.0 (notification read/write api.* contract)
   │
   ▼
WP 4.1 (real producer — conversation-message consumer, ADR-0031)
   │
   ▼
WP 4.2 (client: a real inbox surface)

Browser push delivery — NOT SCOPED, owner decision required
```

Strictly sequential, unlike Slice 3's WP 3.1/3.2 fork: an inbox UI
before a producer exists shows nothing (WP 4.2 needs WP 4.1); a
producer before the contract exists has nowhere real to write through
(WP 4.1 needs WP 4.0's own `_for_caller` shape, even though the
consumer itself calls `platform.raise_notification()` directly, not
through `api.*` — the same SECURITY DEFINER/engine-role posture WP
2.4's own consumer already established).
