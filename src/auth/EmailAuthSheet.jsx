// Magic link is the primary email path (minimize password usage, per the
// redesign brief); the existing password sign-in/sign-up flow — unchanged
// logic, just relocated here from the old AuthScreen — stays one tap away,
// both for users who prefer it and for the two existing password-only test
// accounts.
import { useState } from "react";
import { Mail, Lock, User } from "lucide-react";
import { useLang } from "../lib/lang";
import { useAuth } from "../lib/auth.jsx";
import { Drawer } from "../design-system";

export function EmailAuthSheet({ onClose }) {
  const { t } = useLang();
  const { signIn, signUp, signInWithOtp } = useAuth();
  const [usePassword, setUsePassword] = useState(false);
  const [mode, setMode] = useState("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const submitMagicLink = async (e) => {
    e.preventDefault();
    setError(""); setNotice(""); setBusy(true);
    try {
      await signInWithOtp(email);
      setNotice(t.magicLinkSentMsg);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    setError(""); setNotice(""); setBusy(true);
    try {
      if (mode === "signin") {
        await signIn(email, password);
      } else {
        const { needsEmailConfirmation } = await signUp(email, password, fullName);
        if (needsEmailConfirmation) setNotice(t.authCheckEmail);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer onClose={onClose}>
      <div className="sheet-title">{t.continueWithEmail}</div>
      {!usePassword ? (
        <form onSubmit={submitMagicLink}>
          <label className="field-label">{t.authEmailLabel}</label>
          <div className="search" style={{ marginBottom: 14 }}>
            <Mail size={15} color="var(--ink-soft)" />
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start" }}>{error}</div>}
          {notice && <div className="fineprint" style={{ justifyContent: "flex-start" }}>{notice}</div>}
          <button className="btn-primary" type="submit" disabled={busy}>{t.sendMagicLinkBtn}</button>
        </form>
      ) : (
        <form onSubmit={submitPassword}>
          {mode === "signup" && (
            <>
              <label className="field-label">{t.authFullNameLabel}</label>
              <div className="search" style={{ marginBottom: 14 }}>
                <User size={15} color="var(--ink-soft)" />
                <input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
            </>
          )}
          <label className="field-label">{t.authEmailLabel}</label>
          <div className="search" style={{ marginBottom: 14 }}>
            <Mail size={15} color="var(--ink-soft)" />
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <label className="field-label">{t.authPasswordLabel}</label>
          <div className="search" style={{ marginBottom: 18 }}>
            <Lock size={15} color="var(--ink-soft)" />
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start" }}>{error}</div>}
          {notice && <div className="fineprint" style={{ justifyContent: "flex-start" }}>{notice}</div>}
          <button className="btn-primary" type="submit" disabled={busy}>
            {mode === "signin" ? t.authSignInBtn : t.authSignUpBtn}
          </button>
          <button type="button" className="btn-secondary" style={{ marginTop: 8 }} onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setNotice(""); }}>
            {mode === "signin" ? t.authSwitchToSignUp : t.authSwitchToSignIn}
          </button>
        </form>
      )}
      <button type="button" className="btn-secondary" style={{ marginTop: 10 }} onClick={() => { setUsePassword(!usePassword); setError(""); setNotice(""); }}>
        {usePassword ? t.useMagicLinkInstead : t.usePasswordInstead}
      </button>
    </Drawer>
  );
}
