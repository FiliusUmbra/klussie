// A request's status as a badge. The status→tone→label mapping lives in
// src/lib/requestStatus.js, which is also what drives the timeline on the detail sheet —
// one table, so a badge and a timeline can never disagree about what "booked" means.
import { useLang } from "../lib/lang";
import { Badge } from "../design-system";
import { statusPresentation } from "../lib/requestStatus.js";

export function StatusPill({ status }) {
  const { t } = useLang();
  const { labelKey, tone } = statusPresentation(status);
  return <Badge tone={tone}>{labelKey ? t[labelKey] : status}</Badge>;
}
