-- Restore the original member intake URL; the marketing page now lives at /vip.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '10s';
do $$
declare
  v_definition text;
  v_old constant text := 'else ''/vip/deja-membre-original'' end';
  v_new constant text := 'else ''/vip/deja-membre'' end';
begin
  v_definition := pg_get_functiondef('public.vip_request_completion_action(uuid,integer,uuid,text[],text)'::regprocedure);
  if position(v_old in v_definition) = 0 then raise exception 'Expected archived member notification route not found'; end if;
  execute replace(v_definition, v_old, v_new);
end;
$$;
notify pgrst, 'reload schema';
commit;
