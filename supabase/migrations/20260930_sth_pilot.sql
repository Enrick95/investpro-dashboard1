-- One in-flight mutation for the partner licence, across all Vercel instances.
create table if not exists public.investpro_sth_lock (
 id boolean primary key default true check (id), token uuid, expires_at timestamptz
);
alter table public.investpro_sth_lock enable row level security;
revoke all on public.investpro_sth_lock from anon, authenticated;
insert into public.investpro_sth_lock(id) values(true) on conflict do nothing;
create or replace function public.investpro_sth_acquire_lock(p_token uuid) returns boolean
language plpgsql security definer set search_path=public as $$
begin
 update public.investpro_sth_lock set token=p_token,expires_at=now()+interval '120 seconds'
 where id=true and (expires_at is null or expires_at<now());
 return found;
end;$$;
create or replace function public.investpro_sth_release_lock(p_token uuid) returns void
language sql security definer set search_path=public as $$
 update public.investpro_sth_lock set token=null,expires_at=null where id=true and token=p_token;
$$;
revoke all on function public.investpro_sth_acquire_lock(uuid) from public,anon,authenticated;
revoke all on function public.investpro_sth_release_lock(uuid) from public,anon,authenticated;
grant execute on function public.investpro_sth_acquire_lock(uuid) to service_role;
grant execute on function public.investpro_sth_release_lock(uuid) to service_role;
