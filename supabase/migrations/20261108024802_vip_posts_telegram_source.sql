begin;

-- Publications mirrored from the private Telegram channel. Additive: existing rows and endpoints are unchanged.
alter table public.vip_posts
  add column telegram_chat_id text,
  add column telegram_message_id bigint,
  add column telegram_revision bigint,
  add column thread_post_id uuid references public.vip_posts(id) on delete set null;

-- One publication per channel message: a repeated webhook delivery cannot publish or alert twice.
alter table public.vip_posts add constraint vip_posts_telegram_source_check check (
  (telegram_chat_id is null and telegram_message_id is null and telegram_revision is null)
  or (telegram_chat_id is not null and telegram_message_id is not null and telegram_revision is not null)
);
create unique index vip_posts_telegram_message_key on public.vip_posts(telegram_chat_id, telegram_message_id)
  where telegram_message_id is not null;

-- An update belongs to the thread of a single signal.
alter table public.vip_posts add constraint vip_posts_thread_check check (
  thread_post_id is null or (category = 'followup' and thread_post_id <> id)
);
create index vip_posts_thread_idx on public.vip_posts(thread_post_id) where thread_post_id is not null;

commit;
