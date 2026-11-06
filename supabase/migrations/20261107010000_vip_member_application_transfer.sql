-- Dossiers « nouveau membre » : rattachement d'un compte déjà existant chez le broker.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

alter table public.vip_member_applications
  add column if not exists broker_account_kind text not null default 'new' check (broker_account_kind in ('new','existing')),
  add column if not exists broker_email text check (broker_email is null or (broker_email = lower(btrim(broker_email)) and length(broker_email) between 3 and 254)),
  add column if not exists transfer_requested_on date;

alter table public.vip_member_applications
  add constraint vip_member_application_transfer_fields check (
    broker_account_kind = 'new' or broker_email is not null
  );

-- La validation reprend le type de compte (nouveau ou rattachement) et l'e-mail broker dans la demande VIP.
do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef('public.vip_claim_member_application(uuid,uuid,text,timestamp with time zone,text,text)'::regprocedure) into v_def;
  v_new := replace(v_def, $old$'new','new',v_app.broker_account_id,p_email,$old$, $new$'new',v_app.broker_account_kind,v_app.broker_account_id,coalesce(v_app.broker_email,p_email),$new$);
  if v_new = v_def then raise exception 'vip_claim_member_application: motif introuvable'; end if;
  execute v_new;
end $$;

commit;
