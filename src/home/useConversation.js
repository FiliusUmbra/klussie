// The conversation canvas's state machine: capture → recap → understanding →
// professional → booking → relief.
//
// The six states in EXPERIENCE_VISION.md §4 are internal state, never navigation
// (§2's IA decision) — this hook is where they live, so the view that renders them
// holds no fetching, no AI call, and no booking rule.
//
// Extracted from src/App.jsx's ConversationHome without behaviour changes; the
// homepage redesign wraps it, it does not replace it.
import { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "../lib/lang";
import { useAuth } from "../lib/auth.jsx";
import { analyzeJobRequest } from "../lib/aiIntake";
import { findBestProForService } from "../lib/pros";
import { fetchPortfolioItems } from "../lib/portfolio";
import { createDirectedRequest } from "../lib/requests";
import { uploadRequestPhoto } from "../lib/requestPhotos";

const RECENT_WORK_LIMIT = 3;

export function useConversation({ onStart }) {
  const { langCode, BASE_SERVICES, serviceInfo } = useLang();
  const { profile, activeWorkspace } = useAuth();
  const workspaceId = activeWorkspace?.workspace_id;
  const [capture, setCapture] = useState(null); // null | "voice" | { file, previewUrl }
  // null | { recap, text?, photos?, analyzing, analysis, failed, pro?, work? }
  const [conversation, setConversation] = useState(null);
  // null | "saving" | "done" | "error" — the Booking and Relief states (§4).
  const [booking, setBooking] = useState(null);

  const servicesForModel = useCallback(
    () => BASE_SERVICES.map((s) => ({ id: s.id, name: serviceInfo(s.id).name, category: s.cat, blurb: serviceInfo(s.id).blurb })),
    [BASE_SERVICES, serviceInfo]
  );

  // The capture session owns the preview URL for its whole life: created here when the
  // file is picked, revoked by closeCapture or on unmount. Keeping both sides in event
  // handlers (rather than an effect) is what makes it survive StrictMode's double-mount.
  const pickPhoto = (e) => {
    const file = (e.target.files || [])[0];
    e.target.value = "";
    if (file) setCapture({ file, previewUrl: URL.createObjectURL(file) });
  };

  const closeCapture = () => {
    if (capture && capture.previewUrl) URL.revokeObjectURL(capture.previewUrl);
    setCapture(null);
  };

  // Covers leaving the tab mid-capture, which never runs closeCapture. The ref is synced
  // in an effect rather than during render so the unmount cleanup sees the latest value
  // without reading state through a stale closure.
  const captureRef = useRef(null);
  useEffect(() => { captureRef.current = capture; }, [capture]);
  useEffect(() => () => {
    const open = captureRef.current;
    if (open && open.previewUrl) URL.revokeObjectURL(open.previewUrl);
  }, []);

  const beginConversation = async ({ recap, text, photos, analysis: precomputed }) => {
    // The photo path already analyzed this exact photo to render its on-photo tag —
    // reuse that result rather than asking the model the same question again.
    if (precomputed) {
      setConversation({ recap, text, photos, analyzing: false, analysis: precomputed, failed: false });
      return;
    }
    setConversation({ recap, text, photos, analyzing: true, analysis: null, failed: false });
    try {
      const analysis = await analyzeJobRequest({
        text,
        photos: (photos || []).map((p) => p.file),
        services: servicesForModel(),
        locale: langCode,
      });
      setConversation((c) => (c ? { ...c, analyzing: false, analysis } : c));
    } catch {
      // Not a dead end: the customer can still continue into the sheet, which will
      // analyze again. Silence here would be the worse failure (UX_PATTERNS.md names
      // missing error handling as this app's biggest gap).
      setConversation((c) => (c ? { ...c, analyzing: false, failed: true } : c));
    }
  };

  const continueToSheet = () => {
    const c = conversation;
    setConversation(null);
    onStart({ text: c.text, photos: c.photos, result: c.analysis });
  };

  const reset = () => {
    setConversation(null);
    setBooking(null);
  };

  // Runs once an analysis names a service; a null result is a real outcome (no pro
  // offers that service in this city yet), not an error to hide.
  useEffect(() => {
    const serviceId = conversation?.analysis?.matchedServiceId;
    if (!serviceId || conversation.pro !== undefined) return;
    let cancelled = false;
    const service = BASE_SERVICES.find((s) => s.id === serviceId);
    findBestProForService({ serviceId, city: profile?.city || null, certifiedOnly: !!service?.certifiedOnly })
      .then(async (pro) => {
        if (cancelled) return;
        // Portfolio is fetched only for the one professional actually being shown.
        const work = pro ? await fetchPortfolioItems(pro.id).catch(() => []) : [];
        // fetchPortfolioItems returns raw rows; the design system takes camelCase, and
        // shouldn't have to know database column names.
        const shaped = work.slice(0, RECENT_WORK_LIMIT).map((w) => ({ id: w.id, imageUrl: w.image_url, caption: w.caption }));
        if (!cancelled) setConversation((c) => (c ? { ...c, pro, work: shaped } : c));
      })
      .catch(() => { if (!cancelled) setConversation((c) => (c ? { ...c, pro: null, work: [] } : c)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.analysis?.matchedServiceId]);

  // Implements ADR-0012. One tap directs the request at this one professional and
  // records the ceiling the customer just accepted with the estimate. It does not book
  // the job: the professional's own quote at or under that ceiling is what does, through
  // the unchanged handle_quote_accepted() path.
  //
  // Requires an estimate. Without one there is no ceiling, and a directed request with no
  // ceiling would be an open-ended commitment the customer never actually made — so the
  // button simply isn't offered, rather than defaulting to some number.
  const canDirectBook = !!(conversation?.pro && conversation?.analysis?.estimatedBudget?.max > 0);

  const bookProfessional = async () => {
    const c = conversation;
    const service = BASE_SERVICES.find((s) => s.id === c.analysis.matchedServiceId);
    if (!service) return;
    setBooking("saving");
    try {
      const request = await createDirectedRequest({
        customerId: profile.id,
        workspaceId,
        serviceId: service.id,
        categoryId: service.cat,
        proId: c.pro.id,
        autoAcceptMax: c.analysis.estimatedBudget.max,
        details: c.text || c.analysis.description || c.recap,
        aiAnalysis: c.analysis,
        // 'low' is the only urgency that isn't a this-week job; the schema has no
        // finer-grained option to map the other two onto.
        whenPref: c.analysis.urgency === "low" ? "flexible" : "this_week",
        city: profile?.city || null,
      });
      // The photo the customer showed is the clearest thing the professional will see;
      // a failed upload shouldn't undo a request that already exists, so it's reported
      // separately rather than rolling the booking back.
      await Promise.all(
        (c.photos || []).map((p) => uploadRequestPhoto(request.id, profile.id, workspaceId, p.file))
      ).catch(() => {});
      setBooking("done");
    } catch {
      setBooking("error");
    }
  };

  return {
    capture, setCapture, pickPhoto, closeCapture,
    conversation, beginConversation, continueToSheet, reset,
    booking, bookProfessional, canDirectBook,
  };
}
