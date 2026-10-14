\set ON_ERROR_STOP on
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
do $$
declare v jsonb; t uuid; a integer[]; i integer;
begin
  if (select count(*) from public.game_bank)<>105 then raise exception 'Expanded grammar bank incomplete'; end if;
  perform public.mark_learned(array['phonetics','sandhi','feminine','neuter','place-origin','numerals','verb-parts','passive','participles','compounds','taddhita','translation-method']);
  if (select count(*) from public.lesson_completions where lesson_id='taddhita' and user_id=auth.uid())<>1 then raise exception 'New completion constraint not upgraded'; end if;
  v:=public.start_game('taddhita');t:=(v->>'token')::uuid;
  for i in 0..4 loop
    select answer into a from public.game_bank where id=(select queue[i+1] from public.game_runs where token=t);
    v:=public.answer_game(t,i,a);
  end loop;
  if not (v->>'done')::boolean or (v->>'firstTryCorrect')::integer<>5 then raise exception 'New grammar game did not finish'; end if;
  if not exists(select 1 from public.attempts where lesson_id='taddhita' and score=5 and total=5 and user_id=auth.uid()) then raise exception 'New attempt constraint not upgraded'; end if;
end $$;
select 'Expanded course migration and scoring verified' as result;
