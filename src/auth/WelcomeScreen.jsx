// Authentication UX Redesign, Phase 1 — replaces the old login-form-first
// AuthScreen. Never a bare form: OAuth options first, Email as a real but
// secondary path into EmailAuthSheet. OAuth buttons are fully wired
// (src/lib/auth.jsx's signInWithOAuth) but only functional once each
// provider is configured in the Supabase dashboard — see the
// Authentication UX Redesign plan (Phase 2) and
// docs/design/UX_PATTERNS.md's Authentication section. No brand logos:
// Lucide has no real Apple/Google/Microsoft/Facebook marks, and inventing
// them risks both a mixed-icon-library violation (docs/design/DESIGN_SYSTEM.md)
// and each provider's own brand guidelines — text-only buttons for now,
// upgradeable later without an architecture change.
import { useState } from "react";
import { Mail } from "lucide-react";
import { useLang } from "../lib/lang";
import { useAuth } from "../lib/auth.jsx";
import { EmailAuthSheet } from "./EmailAuthSheet.jsx";

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
      <button className="btn-secondary" onClick={() => startOAuth("apple")}>{t.continueWithApple}</button>
      <button className="btn-secondary" style={{ marginTop: 10 }} onClick={() => startOAuth("google")}>{t.continueWithGoogle}</button>
      <button className="btn-secondary" style={{ marginTop: 10 }} onClick={() => startOAuth("azure")}>{t.continueWithMicrosoft}</button>
      <button className="btn-secondary" style={{ marginTop: 10 }} onClick={() => startOAuth("facebook")}>{t.continueWithFacebook}</button>
      <button className="btn-primary" style={{ marginTop: 14 }} onClick={() => setEmailOpen(true)}><Mail size={15} /> {t.continueWithEmail}</button>
      {emailOpen && <EmailAuthSheet onClose={() => setEmailOpen(false)} />}
    </div>
  );
}
