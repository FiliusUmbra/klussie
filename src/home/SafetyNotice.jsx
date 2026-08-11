// The interruption shown when a customer's own words mention gas, fire, flooding,
// electricity, or something structural.
//
// Deliberately an interruption and not a banner: continuing to collect answers for a
// booking while somebody is describing a gas smell would be the product optimising
// for conversion against the customer's interest, which Constitution Rule 9 exists to
// stop. It says what to do first, states plainly that Klussie is not diagnosing
// anything, and still lets the customer proceed — this is a prompt to check, not a
// gate that traps them.
//
// role="alert" so a screen-reader user hears it the moment it replaces the composer,
// rather than discovering it by tabbing.
import { AlertTriangle } from "lucide-react";

export function SafetyNotice({ t, onContinue, onBack }) {
  return (
    <div className="safety-notice" role="alert">
      <div className="safety-notice-head">
        <span className="safety-notice-glyph" aria-hidden="true"><AlertTriangle size={16} /></span>
        <h3 className="safety-notice-title">{t.safetyTitle}</h3>
      </div>
      <p className="safety-notice-body">{t.safetyBody}</p>
      <div className="safety-notice-actions">
        <button type="button" className="btn-secondary" onClick={onBack}>{t.safetyBack}</button>
        <button type="button" className="btn-secondary safety-notice-continue" onClick={onContinue}>
          {t.safetyContinue}
        </button>
      </div>
    </div>
  );
}
