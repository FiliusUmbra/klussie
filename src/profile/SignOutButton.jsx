// SLICE_5_UNIFIED_PROFILE_DESIGN.md §1/§3a — the one shared action all three Profile
// surfaces already carried, but Operator's own copy was hand-written rather than reused
// (checked directly: identical `btn-secondary` + LogOut markup, three separate places).
// `label` stays a prop rather than a localized default so Operator can keep passing its
// own established hardcoded-English string (OperatorApp.jsx's own stated, deliberate
// non-localization exemption) while Customer/Pro pass `t.authSignOut`.
import { LogOut } from "lucide-react";

export function SignOutButton({ onClick, label, style }) {
  return (
    <button className="btn-secondary" style={style} onClick={onClick}>
      <LogOut size={13} /> {label}
    </button>
  );
}
