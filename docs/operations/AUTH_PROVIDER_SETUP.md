# OAuth Provider Setup

**This document owns:** the real, external, manual steps needed to activate
each OAuth provider for Authentication UX Redesign Phase 2. It does not
own the code — that's already written and verified (Phase 1, committed) —
this is entirely account registration and dashboard configuration outside
this repository, in four different providers' own consoles plus the
Supabase dashboard.

**Status: none of the four providers are configured yet.** Every button
in the app is already wired correctly (confirmed against the real
Supabase project — clicking "Continue with Google" today hits the real
`/auth/v1/authorize` endpoint and returns Supabase's actual "provider not
enabled" error). Nothing below is code work; it's account setup, and it's
yours to do since it requires developer accounts under your (or Klussie's)
name at Google, Apple, Microsoft, and Facebook.

---

## Before you start — two things every provider needs

### 1. Your Supabase callback URL

Every provider needs one fixed redirect URI registered in *their* console:

```
https://<your-project-ref>.supabase.co/auth/v1/callback
```

Find `<your-project-ref>` in the Supabase dashboard's URL bar, or under
**Settings → API → Project URL**. It's also shown pre-filled on each
provider's configuration screen under **Authentication → Providers** in
the Supabase dashboard — easiest to copy it from there directly.

### 2. The redirect-URL allow-list — the easy mistake to make

There are **two different redirects** involved, and only one is what you
configure in each provider's console:

- **Provider → Supabase** (the callback URL above) — configured in
  Google/Apple/Microsoft/Facebook's own console. Fixed, one value.
- **Supabase → your app** — this is `redirectTo` in the code
  (`src/lib/auth.jsx`'s `signInWithOAuth`, currently
  `window.location.origin`). Supabase will **refuse to redirect back to
  your app** unless that exact URL is allow-listed in **Supabase
  Dashboard → Authentication → URL Configuration → Redirect URLs.**

Add both your local dev URL and your production URL here, e.g.
`http://localhost:5173`, `http://localhost:3000` (matching whichever dev
server you're testing against — see `MASTER_CONTEXT.md` §3 on
`vercel dev` vs plain `vite dev`), and `https://klussie-xi.vercel.app`.
Forgetting this step produces a real, confusing "requested path is
invalid" error even after a provider is fully configured correctly — it's
the single most common way this setup silently fails.

---

## Google

1. [Google Cloud Console](https://console.cloud.google.com) → create or
   select a project.
2. **APIs & Services → OAuth consent screen** — configure it (app name,
   support email, user type "External" unless this is Workspace-internal
   only). While in **Testing** status, only accounts you explicitly add
   as test users can sign in (up to 100) — switch to **In production**
   once ready for real users; basic `email`/`profile` scopes typically
   don't trigger Google's manual review, but confirm this hasn't changed
   before relying on it.
3. **APIs & Services → Credentials → Create Credentials → OAuth client
   ID** → Application type **Web application**.
4. **Authorized redirect URIs** → add the Supabase callback URL from
   above.
5. Save — copy the **Client ID** and **Client secret**.
6. **Supabase Dashboard → Authentication → Providers → Google** → enable
   → paste Client ID + Client secret → Save.

## Apple ("Sign in with Apple")

The most involved of the four — Apple's OAuth client secret isn't a
static string, it's a signed JWT Supabase generates from a private key.
Requires an active **Apple Developer Program membership** ($99/year).

1. [Apple Developer](https://developer.apple.com/account) →
   **Certificates, Identifiers & Profiles → Identifiers** → register an
   **App ID** with the "Sign in with Apple" capability enabled (skip if
   one already exists for Klussie).
2. Still under **Identifiers**, register a separate **Services ID** —
   this is the actual OAuth `client_id` used for web sign-in, distinct
   from the App ID. Enable "Sign in with Apple" for it, then configure
   **Web Authentication**: add your domain and set the **Return URL** to
   the Supabase callback URL from above.
3. **Keys** → create a new key with "Sign in with Apple" enabled →
   download the `.p8` private key file. **This file downloads exactly
   once** — if it's lost, a new key has to be generated. Note the
   **Key ID**.
4. Note your **Team ID** (top-right of the developer account) and the
   **Services ID** you created in step 2.
5. **Supabase Dashboard → Authentication → Providers → Apple** → enable
   → enter the Services ID as Client ID, Team ID, Key ID, and paste the
   `.p8` file's contents. Supabase signs the JWT client secret from these
   automatically — there's no separate "secret" to generate by hand.

## Microsoft (Supabase's provider id is `azure`)

1. [Azure Portal](https://portal.azure.com) → **Microsoft Entra ID**
   (formerly Azure AD) → **App registrations → New registration**.
2. Name the app. Choose the account type — "Accounts in any organizational
   directory and personal Microsoft accounts" for the broadest consumer
   sign-in (matches "Continue with Microsoft" being open to anyone, not
   just an internal org); narrower options exist if this should be
   enterprise/tenant-restricted later.
3. **Redirect URI** → platform **Web** → the Supabase callback URL from
   above.
4. After creation, note the **Application (client) ID** and **Directory
   (tenant) ID** from the app's Overview page.
5. **Certificates & secrets → New client secret** — copy the secret
   **value** immediately; it's only shown once.
6. **API permissions** — confirm the default delegated Microsoft Graph
   permissions include `openid`, `email`, `profile` (usually present by
   default for a new registration).
7. **Supabase Dashboard → Authentication → Providers → Azure** → enable
   → paste the Application (client) ID and the secret value. Supabase
   also has a Tenant field — use `common` to allow both personal and
   work/school Microsoft accounts (matching step 2's broad choice), or a
   specific tenant ID to restrict to one organization.

## Facebook

1. [Facebook for Developers](https://developers.facebook.com) →
   **My Apps → Create App** → choose a type that includes Facebook
   Login (e.g. "Authenticate and request data from users with Facebook
   Login" / "Consumer").
2. Add the **Facebook Login** product → **Settings** → **Valid OAuth
   Redirect URIs** → the Supabase callback URL from above.
3. **Settings → Basic** → copy the **App ID** and **App Secret**.
4. The app starts in **Development** mode — only admins/developers/testers
   added to the app can sign in. Switching to **Live** for real users may
   require Facebook's **App Review**, depending on which permissions are
   requested beyond basic public profile/email — this can take real time,
   plan for it separately from the other three providers.
5. **Supabase Dashboard → Authentication → Providers → Facebook** →
   enable → paste App ID + App Secret.

---

## Verifying each one once configured

For each provider, in the running app: click its "Continue with ___"
button. Before setup, that hits Supabase's real endpoint and returns a
raw `"provider is not enabled"` JSON error (already confirmed during
Phase 1). Once configured correctly, the same click should instead land
on that provider's real consent/login screen. If it still errors after
completing the steps above, the redirect-URL allow-list (see "Before you
start," above) is the first thing to check — it's the failure mode that
looks identical to a misconfigured provider but is actually a missing
Supabase-side setting.

---

## A separate, real gap found the same way — Supabase's own signup email is rate-limited

**Found live, 2026-08-28, staging:** attempting a genuinely fresh email/
password signup (not one of the seeded test accounts, which are inserted
directly into `auth.users` by `supabase/seed/staging_test_accounts.sql`
and never go through Supabase's own signup-email path at all) hit
`"email rate limit exceeded"` on the third attempt within a few minutes.
Checked directly: no SMTP provider is configured anywhere in this
repository or its docs — Supabase Auth is sending confirmation emails
through its own built-in service, which carries a hard, low rate limit
by design (it exists to stop abuse, not to carry real signup volume).

**This means a controlled beta with more than a handful of real signups
in the same window will produce exactly this failure for real users** —
a confusing, silent-looking dead end at the single most important first
impression the product has. Not code work, same category as the OAuth
providers above: register a transactional-email provider (Resend,
Postmark, SendGrid — any of them) and configure it under **Supabase
Dashboard → Authentication → Email → SMTP Settings**. Requires an
external account under your (or Klussie's) name, same as the four
providers above — not something this session can provision.

Separately worth deciding before beta: whether **Confirm email** stays
required at all (Supabase Dashboard → Authentication → Providers →
Email) — every test account this session has used skips it by being
seeded directly, so the real confirm-email experience (what the email
looks like, whether the redirect back into the app works) has never
actually been exercised end to end. A cheap, valuable check once SMTP is
configured.

---

## Realistic sequencing

Not all four need to land at once — Google and Microsoft are typically
the fastest to get working end-to-end (no review step for basic scopes).
Apple requires the paid developer program and the multi-piece key/secret
setup even before any review question comes up. Facebook is the one most
likely to need an actual review cycle before real (non-tester) users can
use it. Reasonable order: Google → Microsoft → Apple → Facebook, activating
and verifying each independently rather than blocking on all four
finishing together.

---

Version 1.0 — 2026-08-05
