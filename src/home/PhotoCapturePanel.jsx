// Runs the analysis needed for the on-photo confidence tag, then hands the file
// onward together with that analysis, so the photo path costs one AI call and not two
// — pinned by "asks the model about the photo exactly once" in the homepage tests.
//
// previewUrl is created by whoever picked the file and revoked by that same owner, not
// here. Creating it in this component and revoking it from a cleanup breaks under
// StrictMode's double-invoke — the first cleanup revokes the only URL and the image is
// left pointing at a dead blob.
import { useEffect, useRef, useState } from "react";
import { PhotoCapture } from "../design-system";
import { useLang } from "../lib/lang";
import { analyzeJobRequest } from "../lib/aiIntake";

export function PhotoCapturePanel({ file, previewUrl, onDone, onCancel }) {
  const { t, langCode, BASE_SERVICES, serviceInfo } = useLang();
  const [analyzing, setAnalyzing] = useState(true);
  const [tag, setTag] = useState(null);
  const analysisRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const services = BASE_SERVICES.map((s) => ({ id: s.id, name: serviceInfo(s.id).name, category: s.cat, blurb: serviceInfo(s.id).blurb }));
    analyzeJobRequest({ photos: [file], services, locale: langCode })
      .then((res) => {
        if (cancelled) return;
        // Kept so the canvas can reuse it rather than asking the model the same question
        // twice about the same photo.
        analysisRef.current = res;
        // Prefer what the model actually saw; fall back to the problem title. Confidence
        // is shown as-is, including when it's low — that's the honest signal.
        const label = res.brandDetected || res.problem;
        setTag(label ? `${label} · ${Math.round(res.confidence)}%` : null);
      })
      .catch(() => { if (!cancelled) setTag(null); })
      .finally(() => { if (!cancelled) setAnalyzing(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  return (
    <div className="conv-capture">
      <PhotoCapture
        previewUrl={previewUrl}
        alt={t.convPhotoAlt}
        analyzing={analyzing}
        tag={tag}
        analyzingLabel={t.convPhotoAnalyzing}
        confirmLabel={t.convPhotoConfirm}
        retakeLabel={t.convPhotoRetake}
        onConfirm={() => onDone(file, analysisRef.current)}
        onRetake={onCancel}
      />
    </div>
  );
}
