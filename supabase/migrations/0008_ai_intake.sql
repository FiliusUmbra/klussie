-- Full structured output from the AI intake pipeline (confidence, possible causes,
-- recommended materials, vision/OCR notes, follow-up Q&A actually asked, etc.) —
-- kept separate from details_json, which stays shaped to match SERVICE_QUESTIONS
-- (App.jsx) so JobDetailsSummary renders identically regardless of which intake path
-- (manual form vs AI) produced the request.
alter table public.service_requests add column ai_analysis jsonb;
