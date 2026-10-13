\set ON_ERROR_STOP on
insert into auth.users(id,raw_user_meta_data) values
 ('00000000-0000-4000-8000-000000000001','{"display_name":"ผู้เรียนหนึ่ง"}'),
 ('00000000-0000-4000-8000-000000000002','{"display_name":"ผู้เรียนสอง"}');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
do $$ begin
  if (select count(*) from public.profiles) <> 1 then raise exception 'Profile isolation failed'; end if;
  if (select display_name from public.profiles) <> 'ผู้เรียนหนึ่ง' then raise exception 'Profile trigger failed'; end if;
end $$;
select public.start_quiz('sounds')->>'token' as first_token \gset
select public.submit_quiz(:'first_token'::uuid,array[1,1,2]) as result \gset
do $$ begin
  if (select count(*) from public.attempts where score=3 and total=3) <> 1 then raise exception 'Scoring or history failed'; end if;
  begin
    insert into public.attempts(user_id,lesson_id,score,total) values (auth.uid(),'sounds',3,3);
    raise exception 'Client forged a score';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.question_bank;
    raise exception 'Answer bank is exposed';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.quiz_sessions;
    raise exception 'Private quiz tokens are exposed';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('test.first_token', :'first_token', false);
do $$ begin
  begin
    perform public.submit_quiz(current_setting('test.first_token')::uuid,array[1,1,2]);
    raise exception 'Duplicate submission succeeded';
  exception when raise_exception then
    if sqlerrm <> 'แบบฝึกหัดหมดอายุหรือส่งแล้ว กรุณาเริ่มใหม่' then raise; end if;
  end;
end $$;
select public.start_quiz('sounds')->>'token' as second_token \gset
select set_config('test.second_token', :'second_token', false);
do $$ begin
  begin
    perform public.submit_quiz(current_setting('test.second_token')::uuid,array[1]);
    raise exception 'Incomplete answers accepted';
  exception when raise_exception then
    if sqlerrm <> 'กรุณาตอบทุกข้อ' then raise; end if;
  end;
  begin
    perform public.submit_quiz(current_setting('test.second_token')::uuid,array[null,1,2]);
    raise exception 'Null answers accepted';
  exception when raise_exception then
    if sqlerrm <> 'คำตอบไม่ถูกต้อง' then raise; end if;
  end;
end $$;

set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
do $$ begin
  if (select count(*) from public.attempts) <> 0 then raise exception 'Another user can see history'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'Another user can see profiles'; end if;
  begin
    perform public.submit_quiz(current_setting('test.second_token')::uuid,array[1,1,2]);
    raise exception 'Another user submitted the first user quiz';
  exception when raise_exception then
    if sqlerrm <> 'แบบฝึกหัดหมดอายุหรือส่งแล้ว กรุณาเริ่มใหม่' then raise; end if;
  end;
end $$;
select public.start_quiz('words')->>'token' as words_token \gset
select public.submit_quiz(:'words_token'::uuid,array[0,0,1]);
do $$ begin
  if (select count(*) from public.attempts where score=2 and total=3) <> 1 then raise exception 'Partial scoring failed'; end if;
end $$;
reset role;
update public.quiz_sessions set expires_at=now()-interval '1 second' where token=:'second_token'::uuid;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
do $$ begin
  begin
    perform public.submit_quiz(current_setting('test.second_token')::uuid,array[1,1,2]);
    raise exception 'Expired quiz accepted';
  exception when raise_exception then
    if sqlerrm <> 'แบบฝึกหัดหมดอายุหรือส่งแล้ว กรุณาเริ่มใหม่' then raise; end if;
  end;
end $$;
reset role;
set role anon;
do $$ begin
  begin
    perform public.start_quiz('sounds');
    raise exception 'Anonymous quiz creation allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.attempts;
    raise exception 'Anonymous history read allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'Database scoring and access isolation checks passed' as result;
