// Pro Workspace remarks, 2026-09-12 (Theme E) — "mocht de categorie niet bestaan, dan
// kan deze worden aangemaakt en door de Klussie AI herkend/gecategoriseerd" ("...should
// the service not exist, it can be created and recognized/categorized by the Klussie
// AI."). A pro types what they actually do, in their own words; api/suggest-service.js
// either matches it to a service already on the list (silently attached via the exact
// same updateProServices() write the chip picker itself uses — see Profile.jsx's own
// call site) or sends it to a real operator for review. See
// supabase/migrations/0221_service_catalog_suggestions.sql's own header for why a match
// is never a suggestion row.
//
// A SEPARATE ENTRY POINT, NOT A REDESIGN OF THE CHIP PICKER ITSELF
//
// The remark's own "should be a dialog with a dropdown, less bound to a few categories"
// describes a materially bigger picker redesign than this slice — deferred, likely
// separate work. This ships only the part that was actually missing: a way to ask for
// a service that isn't on the list at all, alongside the existing picker, not instead
// of it.
import { useState } from "react";
import { Check } from "lucide-react";
import { Drawer } from "../design-system";
import { suggestService } from "../lib/serviceSuggestions.js";

const MAX_DESCRIPTION_LENGTH = 500;

export function SuggestServiceSheet({ t, workspaceId, locale, onClose, onMatched }) {
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const submit = async () => {
    if (!description.trim()) return;
    setBusy(true);
    setError("");
    try {
      const outcome = await suggestService({ workspaceId, description: description.trim(), locale });
      if (outcome.outcome === "match") {
        // Same write the chip picker itself uses (Profile.jsx's own saveServices) — a
        // real match is an ordinary "pro offers this" write, never a suggestion.
        await onMatched(outcome.matchedServiceId);
      }
      setResult(outcome);
    } catch {
      setError(t.suggestServiceFailed);
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <Drawer onClose={onClose} closeLabel={t.closeBtn}>
        <div className="sheet-title">{t.suggestServiceTitle}</div>
        <div className="empty-block">
          <Check size={22} color="var(--forest)" />
          <p>{result.outcome === "match" ? t.suggestServiceMatchedMsg : t.suggestServiceSentMsg}</p>
        </div>
        <button className="btn-primary" onClick={onClose}>{t.closeBtn}</button>
      </Drawer>
    );
  }

  return (
    <Drawer onClose={onClose} closeLabel={t.closeBtn}>
      <div className="sheet-title">{t.suggestServiceTitle}</div>
      <p className="fineprint" style={{ justifyContent: "flex-start", marginBottom: 14 }}>{t.suggestServiceHint}</p>

      <label className="field-label" htmlFor="suggest-service-description">{t.suggestServiceDescriptionLabel}</label>
      <textarea
        id="suggest-service-description"
        className="textarea"
        rows={4}
        maxLength={MAX_DESCRIPTION_LENGTH}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      {error && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start", marginBottom: 8 }}>{error}</div>}

      <button className="btn-primary" disabled={busy || !description.trim()} onClick={submit}>
        {busy ? t.suggestServiceCheckingBtn : t.suggestServiceSubmitBtn}
      </button>
    </Drawer>
  );
}
