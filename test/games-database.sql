\set ON_ERROR_STOP on
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
do $$
declare v jsonb; t uuid; v_answer integer[]; i integer;
begin
  v:=public.start_game('noun-roles'); t:=(v->>'token')::uuid;
  if v->'question' ? 'answer' or v->'question' ? 'why' then raise exception 'Answer leaked before submission'; end if;
  update public.game_runs set queue=array['noun-1'],initial_total=1 where token=t;
  v:=public.answer_game(t,0,array[2]);
  if (v->>'correct')::boolean or (v->>'xp')::integer<>0 or (v->>'total')::integer<>2 then raise exception 'Wrong-answer retry failed'; end if;
  begin
    perform public.answer_game(t,0,array[0]);
    raise exception 'Duplicate step accepted';
  exception when raise_exception then if sqlerrm<>'ข้อนี้ตรวจแล้ว กรุณาเริ่มเกมใหม่' then raise; end if; end;
  v:=public.answer_game(t,1,array[0]);
  if not (v->>'correct')::boolean or (v->>'xp')::integer<>10 or not (v->>'done')::boolean or (v->>'firstTryCorrect')::integer<>0 then raise exception 'Recovery scoring failed'; end if;
  begin
    perform public.answer_game(t,2,array[0]);
    raise exception 'Finished run accepted';
  exception when raise_exception then if sqlerrm<>'เกมหมดอายุหรือจบแล้ว กรุณาเริ่มใหม่' then raise; end if; end;
  v:=public.start_game('noun-roles'); t:=(v->>'token')::uuid;
  update public.game_runs set queue=array['noun-1'],initial_total=1 where token=t;
  v:=public.answer_game(t,0,array[0]);
  if (v->>'xp')::integer<>0 then raise exception 'Daily XP farming succeeded'; end if;
  v:=public.start_game('cases'); t:=(v->>'token')::uuid;
  for i in 0..4 loop
    select answer into v_answer from public.game_bank where id=(select queue[i+1] from public.game_runs where token=t);
    v:=public.answer_game(t,i,v_answer);
  end loop;
  if not (v->>'done')::boolean or (v->>'firstTryCorrect')::integer<>5 then raise exception 'Full game did not finish'; end if;
  if (public.get_game_progress()->>'totalXP')::integer<>60 then raise exception 'XP total incorrect'; end if;
  perform public.set_leaderboard('ผู้เรียน A',true);
end $$;

set role authenticated;
do $$ begin
  begin
    insert into public.game_credits(user_id,question_id,xp) values(auth.uid(),'noun-2',10);
    raise exception 'Client forged XP';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.game_bank;
    raise exception 'Client can read answers';
  exception when insufficient_privilege then null; end;
end $$;
select public.start_game('verbs')->>'token' as private_game \gset
select set_config('test.private_game',:'private_game',false);
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
do $$ declare v jsonb; begin
  if (select count(*) from public.game_credits)<>0 or (select count(*) from public.game_answers)<>0 then raise exception 'Other user history exposed'; end if;
  begin
    perform public.answer_game(current_setting('test.private_game')::uuid,0,array[0]);
    raise exception 'Other user game accepted';
  exception when raise_exception then if sqlerrm<>'เกมหมดอายุหรือจบแล้ว กรุณาเริ่มใหม่' then raise; end if; end;
  v:=public.get_leaderboard();
  if jsonb_array_length(v->'rows')<>1 or v->>'myRank' is not null then raise exception 'Opt-in visibility failed'; end if;
  if v::text like '%user_id%' or v::text like '%email%' or v::text like '%00000000-0000%' then raise exception 'Leaderboard identity exposed'; end if;
  perform public.set_leaderboard('ผู้เรียน B',true);
  v:=public.get_leaderboard();
  if jsonb_array_length(v->'rows')<>2 or (v->>'myRank')::integer<>2 then raise exception 'Leaderboard ordering failed'; end if;
end $$;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
select public.set_leaderboard(null,false);
do $$ begin
  if jsonb_array_length(public.get_leaderboard()->'rows')<>1 then raise exception 'Withdrawal failed'; end if;
end $$;
reset role;
set role anon;
do $$ begin
  begin perform public.get_leaderboard(); raise exception 'Anonymous leaderboard access allowed';
  exception when insufficient_privilege then null; end;
  begin perform public.start_game('verbs'); raise exception 'Anonymous game allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'Game retries, scoring, daily XP, isolation, opt-in and ranking passed' as result;
