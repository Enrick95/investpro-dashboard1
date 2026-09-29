-- Exécuter une fois dans Supabase > SQL Editor. Aucun changement à vip_trades.
begin;
create table if not exists public.investpro_telegram_events (
 chat_id text not null,
 message_id bigint not null,
 revision bigint not null,
 update_id bigint not null,
 date bigint not null,
 reply_to bigint,
 parsed jsonb not null,
 received_at timestamptz not null default now(),
 primary key(chat_id,message_id)
);
alter table public.investpro_telegram_events enable row level security;
revoke all on public.investpro_telegram_events from anon,authenticated;
grant select,insert,update on public.investpro_telegram_events to service_role;
-- Atomic upsert: repeated deliveries and older edits cannot overwrite latest content.
create or replace function public.investpro_receive_telegram(
 p_chat text,p_message bigint,p_revision bigint,p_update bigint,
 p_date bigint,p_reply bigint,p_parsed jsonb
) returns void language sql security invoker set search_path='' as $$
 insert into public.investpro_telegram_events(chat_id,message_id,revision,update_id,date,reply_to,parsed)
 values(p_chat,p_message,p_revision,p_update,p_date,p_reply,p_parsed)
 on conflict(chat_id,message_id) do update set
 revision=excluded.revision,update_id=excluded.update_id,date=excluded.date,
 reply_to=excluded.reply_to,parsed=excluded.parsed,received_at=now()
 where (excluded.revision,excluded.update_id)>(investpro_telegram_events.revision,investpro_telegram_events.update_id);
$$;
revoke all on function public.investpro_receive_telegram(text,bigint,bigint,bigint,bigint,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.investpro_receive_telegram(text,bigint,bigint,bigint,bigint,bigint,jsonb) to service_role;
commit;
