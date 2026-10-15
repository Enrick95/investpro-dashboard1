begin;

-- Only media configuration and the additive path allow-list change; posts and member data stay intact.
alter table public.vip_posts drop constraint vip_posts_image_path_check;
alter table public.vip_posts add constraint vip_posts_image_path_check check (
  image_path is null or image_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|gif)$'
);
update storage.buckets set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'vip-post-media';

-- No client storage policy is added: uploads are authorized only with admin-issued, non-upserting tokens.
-- Existing reactions, RPC permissions and the INSERT-only publication notification trigger are unchanged.
commit;
