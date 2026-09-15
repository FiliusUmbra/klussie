# ADR-0032: Multi-property support is a real read path, not deferred contract-level permission

**Status:** Accepted — governs the Home foundation slice (2026-09-15) and
every later property-scoped screen
**Date:** 2026-09-15
**Related:** `0008-my-home-replaces-discover-tab.md`,
`0007-conversational-homepage-ia.md`, migration `0135_personal_workspace_provisioning.sql`
(WP 1.0), migration `0225_property_kind_and_multi_property.sql`,
`src/home/usePropertyTwin.js`, `src/home/PropertySwitcher.jsx`

## Context

Migration 0135 (WP 1.0) deliberately gave `property.create_property()`
no "already has one" guard, stating explicitly that §9.1 of
`PLATFORM_DOMAIN_MODEL.md` "permits many properties" and that the
guard "would be correct for this one call site and wrong for the
contract itself, which must remain callable for a landlord's second
and third property... once a later work package builds that flow."
`src/lib/homeInventory.js`'s own `loadProperty()` held the client-side
half of that same restraint: it took `data[0]` from `api.my_properties()`
unconditionally, with a comment naming this as WP 05.02's own scope —
"a workspace currently stewards at most one backfilled property... and
picking among several... is not this function's job."

Two things changed that calculus while reopening it for this slice:

**A real, live bug, not a hypothetical one.** Every `one_time_address`
request (`ServiceLocationField.jsx`, `resolveRequestLocation()` in
`src/lib/requests.js`) creates a genuine `property.properties` row,
named literally `"Eenmalig serviceadres"`. `api.my_properties()` had
no way to distinguish that row from a real saved home, so
`ServiceLocationField.jsx`'s own "another saved property" picker
already resurfaced it, unfiltered, in every later request — a customer
who ever used a one-time address would see it again, indistinguishable
from a second home. Fixing this required a real distinguishing signal
on `property.properties` regardless of whether a switcher UI existed;
once that signal (`kind`) exists, filtering `api.my_properties()` to
`kind = 'home'` is nearly the whole job of "real multi-property
support" already done.

**The founder's own direction**, given while this slice was already
underway: reopen the WP 05.02 restraint deliberately, ship a real
`PropertySwitcher`, and put "Add property" under Profile — not as a
speculative platform capability, but as a reachable customer action.

## Decision

**A workspace can genuinely steward more than one home-kind property,
end to end, starting with this slice — not only at the schema/RPC
layer, but in the one surface that renders as "My Home."**

Concretely:

1. `property.properties` grows `kind` (`'home' | 'one_time'`,
   migration 0225). `api.my_properties()` returns only `kind = 'home'`
   rows — the read-side fix for the bug above, and the same filter
   every future property-scoped read should apply.
2. `src/lib/homeInventory.js`'s `loadProperty()` accepts an optional
   `propertyId`, selecting among the caller's own properties instead
   of always taking the first row. Omitted, it keeps the original
   single-property behavior — every existing caller is unaffected.
3. `usePropertyTwin.js` resolves the full property list
   (`fetchMyProperties()`) alongside `activePropertyId` (defaulting to
   the first property, preserved across a refresh) and exposes
   `selectProperty()`.
4. `PropertySwitcher.jsx` (My Home) renders nothing below two
   properties — the identical "invisible for the single case" contract
   `WorkspaceSwitcher.jsx` already holds itself to for workspaces — and
   a segmented control above that.
5. `AddPropertySheet.jsx`, reachable from Profile (not My Home — Profile
   is already where every other "add a thing to my account" action
   lives: become a pro, join a business), creates a second `kind: 'home'`
   property via the unchanged `createPropertyForCaller()` write path
   `MyBusinessPanel.jsx` already established for a professional's own
   first property.

**ADR-0007 and ADR-0008 are unaffected and not reopened by this
decision.** My Home stays a segmented section inside the existing
conversational canvas — no new bottom-nav destination, no new top-level
navigation. `PropertySwitcher` is a control *within* that existing
section, the same relationship `WorkspaceSwitcher` already has to the
Profile tab and the AppShell topbar. A property-centric redesign of the
navigation itself is a distinct, larger decision this ADR does not make.

## Consequences

**Makes easier**

- Closes a real, live data-hygiene bug (one-time addresses polluting
  the saved-property picker) as a side effect of the same schema change
  multi-property support needed anyway.
- A landlord, or a customer with a holiday home, can now use Klussie
  for more than one property without any workaround — the gap WP 1.0's
  own comment named as a known, deferred limitation.
- Every future property-scoped read gets the `kind = 'home'` filter for
  free by going through `api.my_properties()`, rather than each caller
  needing to know about one-time addresses itself.

**Makes harder**

- `usePropertyTwin.js` now runs two dependent effects (properties, then
  homeProfile) instead of one — a small but real increase in the
  hook's own complexity, deliberately ordered to avoid a double-fetch
  race rather than accepting one for simplicity.
- Every property-scoped screen that assumed "the" property (singular)
  now needs to consider which one — most already receive `propertyId`/
  `homeCtx.property` resolved for them and are unaffected, but a new
  screen reading `property.properties` directly must apply the same
  `kind` filter this ADR's RPC change already does at the source.

**Rules out**

- Treating `api.my_properties()`'s unfiltered row set as "the
  customer's saved properties" anywhere else in the codebase — the
  `kind` filter lives in the RPC specifically so no client-side caller
  has to remember to apply it themselves.
- Building a property-centric top-level navigation redesign as part of
  this decision — that remains open, governed by ADR-0007/0008 exactly
  as before, and would need its own ADR if reopened.
