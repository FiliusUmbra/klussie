// How a service request is summarised, wherever one is shown. Customer and professional
// surfaces both render these three together, so they are imported as a set rather than
// individually — keeping the three call sites in step is the point of the boundary.
export { JobDetailsSummary } from "./JobDetailsSummary.jsx";
export { AiAnalysisSummary } from "./AiAnalysisSummary.jsx";
export { RequestPhotosStrip } from "./RequestPhotosStrip.jsx";
export { StatusPill } from "./StatusPill.jsx";
export { ServiceRecordSummary } from "./ServiceRecordSummary.jsx";
