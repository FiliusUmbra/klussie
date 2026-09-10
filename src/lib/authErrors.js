// Maps a Supabase Auth error to a locale key EmailAuthSheet.jsx can show.
//
// Deliberately NOT the same fix as documents.js/ReportSheet.jsx/BecomeProSheet.jsx/
// EditProfileSheet.jsx's own "one generic localized message, never the raw error"
// pattern — collapsing "wrong password" and "that email already has an account" into
// one string would be a real regression here, not a fix: a person signing in or up
// needs to tell those apart to know what to do next. This still never shows the raw,
// English-only error.message a non-English-speaking user would otherwise see verbatim
// on the very first screen of the app; it shows a real, localized, but still specific
// message instead.
//
// error.code is a stable string GoTrue itself defines (@supabase/auth-js's own
// error-codes.ts), present on every AuthApiError since supabase-js v2 — never
// error.message, which is English prose meant for a developer's console, not a
// customer's screen. A code this map doesn't recognise (including no code at all, e.g.
// a network failure that never reached Supabase's own server) falls back to one
// generic, still-localized message rather than either the raw text or a crash.
const AUTH_ERROR_LABEL_KEYS = {
  invalid_credentials: "authErrorInvalidCredentials",
  email_not_confirmed: "authErrorEmailNotConfirmed",
  user_already_exists: "authErrorEmailAlreadyRegistered",
  email_exists: "authErrorEmailAlreadyRegistered",
  weak_password: "authErrorWeakPassword",
  email_address_invalid: "authErrorInvalidEmail",
  over_email_send_rate_limit: "authErrorRateLimited",
  over_request_rate_limit: "authErrorRateLimited",
  user_banned: "authErrorAccountUnavailable",
  signup_disabled: "authErrorAccountUnavailable",
};

/**
 * The `t` key to show for an error caught from signIn()/signUp()/signInWithOtp()
 * (src/lib/auth.jsx), which all throw the underlying Supabase AuthError unmodified.
 */
export function authErrorLabelKey(err) {
  return AUTH_ERROR_LABEL_KEYS[err?.code] || "authErrorGeneric";
}
