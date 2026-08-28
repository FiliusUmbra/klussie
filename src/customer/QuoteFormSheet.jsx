// The manual path to a request: pick a timing, answer whatever structured questions the
// service has, describe the rest, attach photos.
//
// The AI intake sheet is the primary route now, but this stays the fallback that always
// works — no model call, no confidence score, nothing to go wrong. Both produce the same
// payload shape, which is why either can create a request.
import { useState, useRef } from "react";
import { X, Send, Camera, ShieldCheck } from "lucide-react";
import { useLang } from "../lib/lang";
import { useAuth } from "../lib/auth.jsx";
import { Drawer } from "../design-system";
import { SERVICE_QUESTIONS } from "../lib/serviceQuestions";
import { WHEN_PREFS } from "../lib/requestStatus.js";
import { ServiceLocationField } from "./ServiceLocationField.jsx";

export function QuoteFormSheet({ service, onClose, onSubmit }) {
  const { t, serviceInfo, whenLabel } = useLang();
  const { profile, activeWorkspace } = useAuth();
  const info = serviceInfo(service.id);
  const questions = SERVICE_QUESTIONS[service.id];
  const [details, setDetails] = useState("");
  const [whenPref, setWhenPref] = useState("this_week");
  const [budget, setBudget] = useState("");
  const [city, setCity] = useState(profile?.city || "");
  const [fields, setFields] = useState({});
  const [photos, setPhotos] = useState([]);
  const [location, setLocation] = useState(null);
  const photoInputRef = useRef(null);

  const setField = (key, value) => setFields((f) => ({ ...f, [key]: value }));

  const addPhotos = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (picked.length === 0) return;
    setPhotos((p) => [...p, ...picked.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
  };

  const removePhoto = (previewUrl) => {
    setPhotos((p) => p.filter((ph) => ph.previewUrl !== previewUrl));
    URL.revokeObjectURL(previewUrl);
  };

  return (
    <Drawer onClose={onClose}>
      <div className="sheet-title">{t.quoteFormTitle}</div>
      <div className="sheet-sub">{t.forService} {info.name}</div>

      <label className="field-label">{t.whenLabel}</label>
      <div className="chiprow">
        {WHEN_PREFS.map((w) => (
          <button key={w} className={"chip" + (whenPref === w ? " chip-on" : "")} onClick={() => setWhenPref(w)}>{whenLabel(w)}</button>
        ))}
      </div>

      {questions && (
        <>
          <label className="field-label">{t.jobDetailsTitle}</label>
          {questions.map((f) => (
            <div key={f.key} className="job-field">
              <div className="job-field-label">{t[f.label]}</div>
              {f.type === "number" && (
                <div className="search" style={{ marginBottom: 0 }}>
                  <input type="number" min="0" placeholder={f.placeholder} value={fields[f.key] ?? ""} onChange={(e) => setField(f.key, e.target.value)} />
                </div>
              )}
              {f.type === "boolean" && (
                <div className="chiprow">
                  <button type="button" className={"chip" + (fields[f.key] === true ? " chip-on" : "")} onClick={() => setField(f.key, true)}>{t.yesLabel}</button>
                  <button type="button" className={"chip" + (fields[f.key] === false ? " chip-on" : "")} onClick={() => setField(f.key, false)}>{t.noLabel}</button>
                </div>
              )}
              {f.type === "select" && (
                <div className="chiprow">
                  {f.options.map((o) => (
                    <button type="button" key={o.value} className={"chip" + (fields[f.key] === o.value ? " chip-on" : "")} onClick={() => setField(f.key, o.value)}>{t[o.label]}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      <label className="field-label">{t.detailsLabel}</label>
      <textarea className="textarea" rows={3} placeholder={t.detailsPlaceholder} value={details} onChange={(e) => setDetails(e.target.value)} />

      <label className="field-label">{t.jobPhotosLabel}</label>
      <div className="portfolio-grid">
        {photos.map((p) => (
          <div key={p.previewUrl} className="portfolio-thumb">
            <img src={p.previewUrl} alt="" />
            <button type="button" className="photo-remove-btn" onClick={() => removePhoto(p.previewUrl)} aria-label="Remove photo"><X size={12} /></button>
          </div>
        ))}
        <button type="button" className="portfolio-thumb portfolio-add" onClick={() => photoInputRef.current.click()}>
          <Camera size={20} />
        </button>
        <input ref={photoInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={addPhotos} />
      </div>

      <ServiceLocationField workspaceId={activeWorkspace?.workspace_id} onChange={setLocation} />

      <label className="field-label">{t.cityLabel}</label>
      <div className="search" style={{ marginBottom: 14 }}>
        <input value={city} onChange={(e) => setCity(e.target.value)} />
      </div>

      <label className="field-label">{t.budgetLabel}</label>
      <div className="search" style={{ marginBottom: 18 }}>
        {/* Literal escape sequence preserved verbatim — see the note in ServiceSheet.jsx. */}
        <span style={{ color: "var(--ink-soft)", fontFamily: "var(--font-mono)" }}>\u20ac</span>
        <input placeholder={t.budgetPlaceholder} value={budget} onChange={(e) => setBudget(e.target.value)} />
      </div>

      <button
        className="btn-primary"
        disabled={!location}
        onClick={() => onSubmit({ whenPref, details: details || "—", detailsJson: fields, budget, city, location, photos: photos.map((p) => p.file) })}
      >
        <Send size={15} /> {t.sendRequestBtn}
      </button>
      <div className="fineprint"><ShieldCheck size={12} /> {t.privacyNote}</div>
    </Drawer>
  );
}
