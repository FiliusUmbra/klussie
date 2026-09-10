// Editing the account's own profile — shared by the customer and professional profile
// screens, which is why the pro fields are conditional rather than a second sheet.
//
// The avatar saves immediately on upload while the rest saves on submit: an image that
// has already been uploaded to storage is easier to commit than to hold, and it lets the
// customer see the result before deciding on the rest of the form.
import { useState, useRef } from "react";
import { useLang } from "../lib/lang";
import { useAuth } from "../lib/auth.jsx";
import { Avatar, Drawer } from "../design-system";
import { uploadAvatar } from "../lib/storage";
import { updateProProfile } from "../lib/pros";

export function EditProfileSheet({ onClose, onSaved }) {
  const { t } = useLang();
  const { profile, proProfile, updateProfile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [city, setCity] = useState(profile?.city || "");
  const [bio, setBio] = useState(proProfile?.bio || "");
  const [businessName, setBusinessName] = useState(proProfile?.business_name || "");
  const [vatNumber, setVatNumber] = useState(proProfile?.vat_number || "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setUploadingAvatar(true);
    try {
      const url = await uploadAvatar(profile.id, file);
      await updateProfile({ avatar_url: url });
      setAvatarUrl(url);
      if (onSaved) await onSaved();
    } catch {
      // A raw err.message here would be a raw Storage/Postgres error -- documents.js's
      // own header names this anti-pattern and its fix: a generic, localized message,
      // never the backend's own words.
      setError(t.avatarUploadFailed);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      await updateProfile({ full_name: fullName, city });
      if (proProfile) {
        await updateProProfile(profile.id, {
          bio,
          business_name: businessName.trim() || null,
          vat_number: vatNumber.trim() || null,
        });
        await refreshProfile();
      }
      if (onSaved) await onSaved();
      onClose();
    } catch {
      // Same anti-pattern, same fix as handleAvatarChange above.
      setError(t.editProfileSaveFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer onClose={onClose}>
      <div className="sheet-title">{t.editProfileTitle}</div>

      <div className="avatar-upload-row">
        <button type="button" className="avatar-upload" onClick={() => fileInputRef.current.click()} disabled={uploadingAvatar} aria-hidden="true" tabIndex={-1}>
          <Avatar url={avatarUrl} initials={fullName[0] || "?"} size="lg" />
        </button>
        <button type="button" className="btn-secondary" onClick={() => fileInputRef.current.click()} disabled={uploadingAvatar}>
          {t.uploadPhotoBtn}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarChange} />
      </div>

      <label className="field-label">{t.authFullNameLabel}</label>
      <div className="search" style={{ marginBottom: 14 }}>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>

      <label className="field-label">{t.cityLabel}</label>
      <div className="search" style={{ marginBottom: 14 }}>
        <input value={city} onChange={(e) => setCity(e.target.value)} />
      </div>

      {proProfile && (
        <>
          {/* Found live during a UX review, 2026-09-06: these were shown only once
              pro_type was ALREADY "business" -- but public.pro_profiles' own
              business_requires_details check constraint requires business_name and
              vat_number to already be set before pro_type can become "business" in the
              first place. A flexi pro had no reachable way to ever switch: Profile.jsx's
              own "Registered business" toggle failed the constraint with nothing to fill
              in, and this form never offered the fields until after a switch that could
              never succeed. Shown for either pro_type now, so a flexi pro can save these
              first, then switch successfully. */}
          <label className="field-label">{t.businessNameLabel}</label>
          <div className="search" style={{ marginBottom: 14 }}>
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </div>
          <label className="field-label">{t.vatNumberLabel}</label>
          <div className="search" style={{ marginBottom: 14 }}>
            <input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} />
          </div>
          <label className="field-label">{t.bioLabel}</label>
          <textarea className="textarea" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
        </>
      )}

      {error && <div className="fineprint" style={{ color: "#b3432f" }}>{error}</div>}
      <button className="btn-primary" disabled={busy} onClick={submit}>{t.saveChangesBtn}</button>
    </Drawer>
  );
}
