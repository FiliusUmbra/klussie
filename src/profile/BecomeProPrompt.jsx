// What the professional side of the app shows to an account that has switched roles but
// has no pro profile yet — an invitation rather than an error, since having no profile is
// the normal starting state, not a fault.
import { Briefcase } from "lucide-react";
import { useLang } from "../lib/lang";

export function BecomeProPrompt({ onStart }) {
  const { t } = useLang();
  return (
    <div className="pad">
      <div className="empty-block">
        <Briefcase size={26} color="var(--ink-soft)" />
        <p>{t.becomeProPrompt}</p>
        <button className="btn-primary" onClick={onStart}>{t.becomeProBtn}</button>
      </div>
    </div>
  );
}
