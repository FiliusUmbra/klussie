// Shown alongside JobDetailsSummary wherever a request is rendered — the AI-derived
// possible causes / recommended materials give the professional extra context before
// quoting, beyond the structured fields already covered by JobDetailsSummary.
import { useLang } from "../lib/lang";
import { AIMessage } from "../design-system";

export function AiAnalysisSummary({ aiAnalysis }) {
  const { t } = useLang();
  if (!aiAnalysis) return null;
  const { possibleCauses, recommendedMaterials, confidence } = aiAnalysis;
  if (!possibleCauses?.length && !recommendedMaterials?.length) return null;
  return (
    <AIMessage label={t.aiAnalysisLabel} confidence={confidence}>
      {possibleCauses?.length > 0 && (
        <>
          <div className="job-field-label" style={{ marginBottom: 0 }}>{t.aiPossibleCausesLabel}</div>
          <ul>{possibleCauses.map((c) => <li key={c}>{c}</li>)}</ul>
        </>
      )}
      {recommendedMaterials?.length > 0 && (
        <>
          <div className="job-field-label" style={{ marginBottom: 0, marginTop: 6 }}>{t.aiRecommendedMaterialsLabel}</div>
          <ul>{recommendedMaterials.map((m) => <li key={m}>{m}</li>)}</ul>
        </>
      )}
    </AIMessage>
  );
}
