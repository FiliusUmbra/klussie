-- Caches on-demand translations of a message, keyed by locale code (e.g. "fr", "en").
-- Populated lazily the first time a recipient actually views the conversation in a
-- given UI language — see saveMessageTranslation in src/lib/messages.js — rather than
-- eagerly translating into all 8 supported locales at send time.
alter table public.messages add column translations jsonb;
