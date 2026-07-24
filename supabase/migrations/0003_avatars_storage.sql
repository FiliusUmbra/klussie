-- Public storage bucket for profile photos. Public so avatars can be shown to other
-- users (pros browsing leads, customers browsing pros) without signed URLs.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Objects are stored at "<user_id>/avatar" — RLS restricts writes to a user's own folder.
create policy "avatar images are publicly accessible"
on storage.objects for select
to public
using (bucket_id = 'avatars');

create policy "users can upload own avatar"
on storage.objects for insert
to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users can update own avatar"
on storage.objects for update
to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users can delete own avatar"
on storage.objects for delete
to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
