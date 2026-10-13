\set ON_ERROR_STOP on
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
select public.mark_learned(array['sounds','words','masculine']);
do $$ begin
  if (select count(*) from public.lesson_completions)<>3 then raise exception 'Reported completion not saved'; end if;
  if exists(select 1 from public.game_credits where question_id like 'masculine-%') then raise exception 'Reporting completion created XP'; end if;
  begin
    insert into public.lesson_completions(user_id,lesson_id) values(auth.uid(),'genitive');
    raise exception 'Uncontrolled write allowed';
  exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
do $$ begin
  if (select count(*) from public.lesson_completions)<>0 then raise exception 'Reported completion exposed to other account'; end if;
end $$;
select public.mark_learned(array['dative']);
do $$ begin
  if (select count(*) from public.lesson_completions)<>1 then raise exception 'Current account completion not isolated'; end if;
end $$;
reset role;
select 'Learner-reported completion is isolated and does not fabricate XP' as result;
