-- Enable Realtime replication for the tables the frontend subscribes to via
-- supabase.channel(...).on('postgres_changes', ...). Without this, postgres_changes
-- listeners join successfully but never receive any events — inserts/updates on these
-- tables are invisible to Realtime until they're added to the supabase_realtime publication.
alter publication supabase_realtime add table public.service_requests;
alter publication supabase_realtime add table public.quotes;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;
