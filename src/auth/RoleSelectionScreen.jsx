// Shown exactly once per user, right after auth succeeds — not before (see
// AppShell's body-selection logic gating on profile.onboarding_role_selected).
// "I need help" proceeds as a customer, matching every account's existing
// default. "I offer services" opens the existing BecomeProSheet unchanged —
// this screen only front-loads that choice for new users, it doesn't
// replace the existing role-switch toggle an existing customer can still
// use later to become a pro.
import { useState } from "react";
import { useLang } from "../lib/lang";
import { useAuth } from "../lib/auth.jsx";
import { BecomeProSheet } from "../profile/BecomeProSheet.jsx";

export function RoleSelectionScreen({ onProSelected }) {
  const { t } = useLang();
  const { proProfile, markRoleSelected } = useAuth();
  const [becomeProOpen, setBecomeProOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const chooseCustomer = async () => {
    setError("");
    setBusy(true);
    try {
      await markRoleSelected();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // An account that already has a pro profile (e.g. it existed before this
  // onboarding flow shipped, and every existing row defaulted to
  // onboarding_role_selected = false in the migration) shouldn't be sent
  // through BecomeProSheet again — it would try to insert a second
  // pro_profiles row and fail on the primary key. Just confirm the choice.
  const choosePro = async () => {
    if (proProfile) {
      setError("");
      setBusy(true);
      try {
        await markRoleSelected();
        onProSelected();
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    } else {
      setBecomeProOpen(true);
    }
  };

  return (
    <div className="pad">
      <div className="hello" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6, marginBottom: 22 }}>
        <div className="h1">{t.roleQuestionTitle}</div>
      </div>
      {error && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start", marginBottom: 10 }}>{error}</div>}
      <button className="btn-primary" disabled={busy} onClick={chooseCustomer}>{t.roleOptionCustomer}</button>
      <button className="btn-secondary" style={{ marginTop: 10 }} disabled={busy} onClick={choosePro}>{t.roleOptionPro}</button>
      {becomeProOpen && (
        <BecomeProSheet
          onClose={() => setBecomeProOpen(false)}
          onDone={async () => { setBecomeProOpen(false); await markRoleSelected(); onProSelected(); }}
        />
      )}
    </div>
  );
}
