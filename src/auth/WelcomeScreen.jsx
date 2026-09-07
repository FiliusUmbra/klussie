// Authentication UX Redesign, Phase 1 — replaces the old login-form-first
// AuthScreen. Never a bare form: OAuth options first, Email as a real but
// secondary path into EmailAuthSheet. OAuth buttons are fully wired
// (src/lib/auth.jsx's signInWithOAuth) but only functional once each
// provider is configured in the Supabase dashboard — see the
// Authentication UX Redesign plan (Phase 2) and
// docs/design/UX_PATTERNS.md's Authentication section.
//
// Real provider logos, added 2026-09-07 (user request): this file used to say Lucide
// had no real Apple/Google/Microsoft/Facebook marks and stayed text-only rather than
// invent them. ProviderIcons.jsx now carries each provider's own official mark, sourced
// verbatim (not redrawn) — see that file's own header for exactly where each one came
// from and why it isn't a lucide-react import.
import { useState } from "react";
import { Mail } from "lucide-react";
import { useLang } from "../lib/lang";
import { useAuth } from "../lib/auth.jsx";
import { EmailAuthSheet } from "./EmailAuthSheet.jsx";
import { AppleIcon, GoogleIcon, MicrosoftIcon, FacebookIcon } from "./ProviderIcons.jsx";

export function WelcomeScreen() {
  const { t } = useLang();
  const { signInWithOAuth } = useAuth();
  const [emailOpen, setEmailOpen] = useState(false);
  const [oauthError, setOauthError] = useState("");

  const startOAuth = async (provider) => {
    setOauthError("");
    try {
      await signInWithOAuth(provider);
    } catch (err) {
      setOauthError(err.message);
    }
  };

  return (
    <div className="pad">
      <div className="hello" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6, marginBottom: 22 }}>
        <div className="h1">{t.welcomeTitle}</div>
        <p className="sheet-blurb" style={{ margin: 0 }}>{t.welcomeSubtitle}</p>
      </div>
      {oauthError && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start", marginBottom: 10 }}>{oauthError}</div>}
      <button className="btn-secondary" onClick={() => startOAuth("apple")}><AppleIcon size={17} /> {t.continueWithApple}</button>
      <button className="btn-secondary" style={{ marginTop: 10 }} onClick={() => startOAuth("google")}><GoogleIcon size={16} /> {t.continueWithGoogle}</button>
      <button className="btn-secondary" style={{ marginTop: 10 }} onClick={() => startOAuth("azure")}><MicrosoftIcon size={16} /> {t.continueWithMicrosoft}</button>
      <button className="btn-secondary" style={{ marginTop: 10 }} onClick={() => startOAuth("facebook")}><FacebookIcon size={16} /> {t.continueWithFacebook}</button>
      <button className="btn-primary" style={{ marginTop: 14 }} onClick={() => setEmailOpen(true)}><Mail size={15} /> {t.continueWithEmail}</button>
      {emailOpen && <EmailAuthSheet onClose={() => setEmailOpen(false)} />}
    </div>
  );
}
