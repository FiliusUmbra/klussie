# ADR-0023: Cross-user profile reads resolve display information; they do not read the identity row

**Status:** **Accepted** 2026-08-13 — implemented in Epic 02 WP 02.06,
with one deviation in transport recorded under "As implemented" below
**Date:** 2026-08-13
**Related:** `../architecture/SYSTEM_ARCHITECTURE.md` §6.1,
`../architecture/SUPABASE_ARCHITECTURE.md` §7 §8 §11.1 §11.4,
`../architecture/DATABASE_ARCHITECTURE.md` §8,
`../IMPLEMENTATION_ROADMAP.md` §13 (WP 02.06)

## Context

WP 02.06 moves every profile read onto `identity.identities`. Its
success condition, stated by the founder: *a user cannot tell that
anything changed — identical behaviour, identical UI, identical
permissions.*

The application has exactly two profile read paths:

| Path | Reads | Whose |
|---|---|---|
| `loadProfile` in `src/lib/auth.jsx` | `select("*")` | The signed-in user's **own** profile |
| `fetchPublicProInfo` in `src/lib/pros.js` | `profiles(full_name, avatar_url)` | **Other people's** — every professional shown on a quote card |

The second path is where the problem is, and it comes from a decision
migration `0001` made deliberately and stated in its own comment:

> *"Contact details split out so RLS can keep them private until a
> booking exists."*

Two tables, two very different policies:

- **`public.profiles`** — `full_name`, `avatar_url`, `city`, `locale`:
  `for select to authenticated using (true)`. Anyone signed in reads
  anyone's.
- **`public.profile_contacts`** — `email`, `phone`: owner only, plus two
  bilateral policies granting access to the other side of a **confirmed
  booking** and to nobody else.

**`identity.identities` merges all six columns into one row** (WP 02.01,
following `DATABASE_ARCHITECTURE.md` §8, which puts name, language and
*contact channels* on the identity aggregate). Row Level Security decides
visibility **per row**, and `SUPABASE_ARCHITECTURE.md` §11.1 states
outright: *"There is no field-level security anywhere in this design, and
there does not need to be."*

So one policy has to serve both column groups, and no policy can.

### The two horns, demonstrated

Measured against staging's seeded accounts — a customer reading the
professional whose quote card they are looking at.

**Today**, the customer sees the pro's name, avatar and city; the email
is refused:

```
 full_name  | avatar_url | city
 Pierre Pro |            | Liège

 pro_email_visible_to_customer
 (blocked by RLS)
```

**Option A — a policy permissive enough to render the quote card**
(`using (true)`, matching what `profiles` allows today):

```
 full_name  |          email           |    phone     | city
 Pierre Pro | pro@staging.klussie.test | +32470000002 | Liège
```

Every authenticated user can now read **every user's email address and
phone number**. Today that requires being the owner or being on the other
side of a confirmed booking. This is not a subtle drift; it is the
platform's contact-privacy rule removed.

**Option B — a policy restricted to the caller's own row:**

```
 pro_rows_visible_for_quote_card
                               0

 own_row_visible
                               1
```

The professional's name disappears from every quote card and falls back
to the literal string `"Pro"`. The user can tell immediately.

**Both horns violate the success condition.** A cannot preserve
permissions; B cannot preserve the UI.

## Decision

**Cross-user profile reads resolve display information through the
Identity engine's public contract. They do not read the identity row.**

`SYSTEM_ARCHITECTURE.md` §6.1 already says what that contract is:

> **Public contract.** Authenticate a principal. **Resolve an internal
> person-reference to display information, subject to erasure.** Assert a
> verified attribute.

Read "resolve … to display information" as the operative phrase. It is
not "read the identity row" — it is a narrower operation that returns
what may be displayed, and the distinction is exactly the one this
conflict needs.

Concretely, WP 02.06 becomes:

1. **Own-row visibility.** An RLS policy on `identity.identities`
   admitting `auth_user_id = auth.uid()`. `loadProfile` reads the caller's
   own row, including their own contact channels — which matches
   `profile_contacts`'s owner policy exactly.
2. **A display resolver** returning `person_ref`, `full_name` and
   `avatar_url` **and nothing else**, for any reference. Contact channels
   are not reachable through it at any privilege level.
   `fetchPublicProInfo` calls this.
3. **Contact channels stay where policy can express them.** Until an
   engine exists that can evaluate "is there a confirmed booking between
   these two parties", `public.profile_contacts` remains the authority
   for bilateral contact visibility, and its three policies are not
   replaced. **Step 6 does not retire that table in this epic.**

**`loadProfile` also keeps reading `public.profiles`** for
`onboarding_role_selected` and `home_tour_completed_at`. WP 02.01
deliberately gave the identity row no column for either — they are
application state about a session, not attributes of a person — and
reading identity alone would break the role-selection screen and the
first-login tour.

### Why not the alternatives

**Column-level security.** Ruled out by §11.1, and it would make the
identity row's visibility unreadable from the schema.

**Splitting contact channels into their own table in `identity`.** The
tidiest long-term answer and a direct contradiction of
`DATABASE_ARCHITECTURE.md` §8, which places contact channels on the
identity aggregate. That is a frozen document; changing it is an
architecture decision, not a WP 02.06 implementation detail.

**Leaving reads on `profiles`.** Fails the package.

## Consequences

**Makes easier**

- Both properties hold: the quote card renders the same name, and no
  contact detail becomes visible to anyone who cannot see it today.
- The resolver is the shape §6.1 already specifies, so Epic 03's
  membership displays and Epic 12's marketplace surfaces have one answer
  to "how do I show a person's name" rather than each inventing one.
- Erasure is honoured in one place: a redacted identity resolves to
  nothing, and every display surface inherits that automatically.

**Makes harder**

- Two read mechanisms for one table — own-row RLS and a resolver — and a
  reviewer must know which applies. Reading another person's row directly
  will look like it should work and will return nothing.
- `identity.identities` becomes reachable from the client API surface for
  the first time, which Epic 01 deliberately avoided for `platform`. The
  own-row policy is the whole of the protection, so it is now
  load-bearing in a way no policy in this schema has been.
- The epic cannot reach step 6. `public.profiles` and
  `public.profile_contacts` both survive it, and "retire the old
  structure" moves to whichever epic can express bilateral contact
  visibility.

**Rules out**

- A `using (true)` policy on `identity.identities`, permanently.
- Retiring `public.profile_contacts` before an engine can evaluate the
  booking relationship its policies encode.
- Reading contact channels for anyone but the caller through the identity
  path.

## What this does not resolve

**Two deployment facts make WP 02.06 unsafe to ship even once this is
accepted**, and both are outside its scope:

1. **Production has none of migrations `0018`–`0027`.** Code that reads
   `identity.identities` would fail every profile read for every user.
   The migrations and the backfill must land first, and the
   reconciliation must pass there — production is a separate gate from
   staging.
2. **`.env.local` on the maintainer's machine points at production.** Any
   local run of the app exercises real data, so "verify the UI is
   identical" cannot currently be done against staging without staging's
   anon key.

---

## As implemented (WP 02.06)

**The substance is unchanged; the transport is not.** The decision above
assumed an own-row RLS policy with the client reading `identity.identities`
directly. That requires PostgREST to expose the `identity` schema, and
**a migration cannot do it**: `pgrst.db_schemas` is not set on the
`authenticator` role on this project, so exposed schemas are configured
outside the database.

Both operations are therefore `SECURITY DEFINER` functions in `public`,
which PostgREST already exposes — the pattern ADR-0004 established for
`emit_domain_event`:

- `public.current_identity()` — the caller's own row, contact channels
  included.
- `public.resolve_identity_display(uuid[])` — name and avatar, and no
  column for anything else.

**The outcome is stricter than this ADR planned for.** Its stated cost —
*"identity.identities becomes reachable from the client API surface for
the first time"* — is not paid: no client role has `USAGE` on the
`identity` schema or `SELECT` on the table, and
`VERIFY_IDENTITY_READ_PATH.sql` check 4 keeps it that way. `identity` is
as unreachable from a client as `platform` is.
