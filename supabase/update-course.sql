-- Apply AFTER schema.sql. Repeatable: preserves users, learning history and XP.
begin;
alter table public.attempts drop constraint if exists attempts_lesson_id_check;
alter table public.attempts add constraint attempts_lesson_id_check check (lesson_id in ('sounds','words','sentences','noun-roles','cases','number','verbs','pronouns','grammar-review','masculine','dative','genitive'));
alter table public.profiles add column if not exists board_alias text;
alter table public.profiles add column if not exists leaderboard_opt_in boolean not null default false;

create table if not exists public.game_bank (
  id text primary key,
  lesson_id text not null,
  data jsonb not null,
  answer integer[] not null,
  explanation text not null
);
create table if not exists public.game_runs (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id text not null,
  queue text[] not null,
  initial_total integer not null,
  step integer not null default 0,
  first_correct integer not null default 0,
  expires_at timestamptz not null default now() + interval '1 hour',
  created_at timestamptz not null default now()
);
create index if not exists game_runs_user_date on public.game_runs(user_id,created_at);
create table if not exists public.game_answers (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  run_token uuid not null references public.game_runs(token) on delete cascade,
  step integer not null,
  question_id text not null references public.game_bank(id),
  correct boolean not null,
  created_at timestamptz not null default now(),
  unique(run_token,step)
);
create index if not exists game_answers_user_date on public.game_answers(user_id,created_at);
create table if not exists public.game_credits (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null references public.game_bank(id),
  credit_day date not null default (now() at time zone 'Asia/Bangkok')::date,
  xp integer not null default 10 check (xp=10),
  primary key(user_id,question_id,credit_day)
);
alter table public.game_bank enable row level security;
alter table public.game_runs enable row level security;
alter table public.game_answers enable row level security;
alter table public.game_credits enable row level security;
revoke all on public.game_bank,public.game_runs,public.game_answers,public.game_credits from public,anon,authenticated;
grant select on public.game_answers,public.game_credits to authenticated;
drop policy if exists "Own game answers" on public.game_answers;
create policy "Own game answers" on public.game_answers for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists "Own XP" on public.game_credits;
create policy "Own XP" on public.game_credits for select to authenticated using ((select auth.uid())=user_id);

create or replace function public.start_game(p_lesson_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid(); v_queue text[]; v_token uuid; v_data jsonb;
begin
  if v_user is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
  perform 1 from public.profiles where user_id=v_user for update;
  if (select count(*) from public.game_runs where user_id=v_user and created_at>now()-interval '10 minutes')>=30
    then raise exception 'เริ่มเกมบ่อยเกินไป กรุณารอสักครู่'; end if;
  select array_agg(id order by random()) into v_queue from public.game_bank where lesson_id=p_lesson_id;
  if v_queue is null then raise exception 'ไม่พบด่านเกม'; end if;
  insert into public.game_runs(user_id,lesson_id,queue,initial_total) values(v_user,p_lesson_id,v_queue,cardinality(v_queue)) returning token into v_token;
  select data into v_data from public.game_bank where id=v_queue[1];
  return jsonb_build_object('token',v_token,'question',v_data,'step',0,'total',cardinality(v_queue),'initialTotal',cardinality(v_queue));
end;
$$;
revoke all on function public.start_game(text) from public,anon;
grant execute on function public.start_game(text) to authenticated;

create or replace function public.answer_game(p_token uuid,p_step integer,p_answer integer[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid(); v_run public.game_runs%rowtype; v_q public.game_bank%rowtype;
  v_correct boolean; v_tries integer; v_xp integer:=0; v_rows integer; v_next jsonb; v_done boolean; v_retry boolean:=false;
begin
  if v_user is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
  select * into v_run from public.game_runs where token=p_token and user_id=v_user for update;
  if not found or v_run.expires_at<now() or v_run.step>=cardinality(v_run.queue)
    then raise exception 'เกมหมดอายุหรือจบแล้ว กรุณาเริ่มใหม่'; end if;
  if p_step is null or p_step<>v_run.step then raise exception 'ข้อนี้ตรวจแล้ว กรุณาเริ่มเกมใหม่'; end if;
  select * into v_q from public.game_bank where id=v_run.queue[v_run.step+1];
  if p_answer is null or cardinality(p_answer)<>cardinality(v_q.answer) or array_ndims(p_answer)<>1 or array_lower(p_answer,1)<>1
    or exists(select 1 from unnest(p_answer) a where a is null or a<0 or a>=jsonb_array_length(v_q.data->'options'))
    then raise exception 'กรุณาตอบให้ครบ'; end if;
  if v_q.data->>'kind' in ('build','pair') and (select count(distinct a) from unnest(p_answer) a)<>cardinality(p_answer)
    then raise exception 'แต่ละตัวเลือกใช้ได้ครั้งเดียว'; end if;
  v_correct:=p_answer=v_q.answer;
  select count(*) into v_tries from public.game_answers where run_token=p_token and question_id=v_q.id;
  insert into public.game_answers(user_id,run_token,step,question_id,correct) values(v_user,p_token,p_step,v_q.id,v_correct);
  if v_correct then
    insert into public.game_credits(user_id,question_id) values(v_user,v_q.id) on conflict do nothing;
    get diagnostics v_rows = row_count;
    v_xp:=v_rows*10;
    if v_tries=0 then v_run.first_correct:=v_run.first_correct+1; end if;
  elsif v_tries<2 then
    v_run.queue:=array_append(v_run.queue,v_q.id); v_retry:=true;
  end if;
  v_run.step:=v_run.step+1;
  v_done:=v_run.step>=cardinality(v_run.queue);
  update public.game_runs set queue=v_run.queue,step=v_run.step,first_correct=v_run.first_correct where token=p_token;
  if v_done then
    insert into public.attempts(user_id,lesson_id,score,total) values(v_user,v_run.lesson_id,v_run.first_correct,v_run.initial_total);
  else select data into v_next from public.game_bank where id=v_run.queue[v_run.step+1]; end if;
  return jsonb_build_object('correct',v_correct,'answer',to_jsonb(v_q.answer),'why',v_q.explanation,'xp',v_xp,'retried',v_retry,
    'nextQuestion',v_next,'step',v_run.step,'total',cardinality(v_run.queue),'done',v_done,'firstTryCorrect',v_run.first_correct,'initialTotal',v_run.initial_total);
end;
$$;
revoke all on function public.answer_game(uuid,integer,integer[]) from public,anon;
grant execute on function public.answer_game(uuid,integer,integer[]) to authenticated;

create or replace function public.get_game_progress()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_week date:=date_trunc('week',now() at time zone 'Asia/Bangkok')::date;
begin
  if v_user is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
  return jsonb_build_object(
    'totalXP',coalesce((select sum(xp) from public.game_credits where user_id=v_user),0),
    'weekXP',coalesce((select sum(xp) from public.game_credits where user_id=v_user and credit_day>=v_week),0),
    'days',coalesce((select jsonb_agg(d order by d desc) from(select distinct (created_at at time zone 'Asia/Bangkok')::date d from public.game_answers where user_id=v_user) s),'[]'::jsonb),
    'alias',(select board_alias from public.profiles where user_id=v_user),
    'joined',coalesce((select leaderboard_opt_in from public.profiles where user_id=v_user),false));
end;
$$;
revoke all on function public.get_game_progress() from public,anon;
grant execute on function public.get_game_progress() to authenticated;

create or replace function public.set_leaderboard(p_alias text,p_join boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
  if p_join is null then raise exception 'เลือกการเข้าร่วม'; end if;
  if p_join and (p_alias is null or length(trim(p_alias))<2 or length(trim(p_alias))>24)
    then raise exception 'ชื่อเล่นต้องมี 2–24 ตัว'; end if;
  update public.profiles set leaderboard_opt_in=p_join,board_alias=case when p_join then trim(p_alias) else board_alias end where user_id=auth.uid();
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.set_leaderboard(text,boolean) from public,anon;
grant execute on function public.set_leaderboard(text,boolean) to authenticated;

create or replace function public.get_leaderboard()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_result jsonb; v_week date:=date_trunc('week',now() at time zone 'Asia/Bangkok')::date;
begin
  if v_user is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
  with totals as (
    select p.user_id,p.board_alias,coalesce(sum(c.xp),0)::bigint xp from public.profiles p
    left join public.game_credits c on c.user_id=p.user_id and c.credit_day>=v_week
    where p.leaderboard_opt_in and p.board_alias is not null group by p.user_id,p.board_alias
  ), ranked as (select *,dense_rank() over(order by xp desc) rank from totals), top as (
    select * from ranked order by xp desc,board_alias,user_id limit 20
  ) select jsonb_build_object('weekStart',v_week,
    'rows',coalesce((select jsonb_agg(jsonb_build_object('rank',rank,'alias',board_alias,'xp',xp,'isMe',user_id=v_user) order by xp desc,board_alias,user_id) from top),'[]'::jsonb),
    'myRank',(select rank from ranked where user_id=v_user), 'participants',(select count(*) from totals)) into v_result;
  return v_result;
end;
$$;
revoke all on function public.get_leaderboard() from public,anon;
grant execute on function public.get_leaderboard() to authenticated;

create table if not exists public.lesson_completions (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id text not null check(lesson_id in ('sounds','words','sentences','noun-roles','cases','number','verbs','pronouns','grammar-review','masculine','dative','genitive')),
  source text not null default 'learner_report' check(source='learner_report'),
  created_at timestamptz not null default now(),
  primary key(user_id,lesson_id)
);
alter table public.lesson_completions enable row level security;
revoke all on public.lesson_completions from public,anon,authenticated;
grant select on public.lesson_completions to authenticated;
drop policy if exists "Own reported completion" on public.lesson_completions;
create policy "Own reported completion" on public.lesson_completions for select to authenticated using ((select auth.uid())=user_id);
create or replace function public.mark_learned(p_lesson_ids text[])
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
  if p_lesson_ids is null or cardinality(p_lesson_ids)>12 or exists(select 1 from unnest(p_lesson_ids) l where l is null or l not in
    ('sounds','words','sentences','noun-roles','cases','number','verbs','pronouns','grammar-review','masculine','dative','genitive')) then raise exception 'ไม่พบบทเรียน'; end if;
  insert into public.lesson_completions(user_id,lesson_id) select auth.uid(),l from unnest(p_lesson_ids) l on conflict do nothing;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.mark_learned(text[]) from public,anon;
grant execute on function public.mark_learned(text[]) to authenticated;

-- Original grammar question seed follows.
insert into public.game_bank(id,lesson_id,data,answer,explanation) values
('noun-1','noun-roles','{"id":"noun-1","text":"Puriso dhammaṃ suṇāti. คำไหนเป็นผู้ฟัง?","options":["puriso","dhammaṃ","suṇāti"],"kind":"choose"}'::jsonb,ARRAY[0],'puriso เป็นประธาน: บุรุษเป็นผู้ฟัง'),
('noun-2','noun-roles','{"id":"noun-2","text":"ถ้าธรรมเป็นสิ่งที่บุรุษฟัง เลือกรูปกรรมเอกพจน์","options":["dhammo","dhammaṃ","dhammā"],"kind":"gap"}'::jsonb,ARRAY[1],'dhammaṃ เป็นรูปกรรมเอกพจน์ของ dhamma ในแบบนามนี้'),
('noun-3','noun-roles','{"id":"noun-3","text":"เรียงคำตามแบบประธาน–กรรม–กริยา: บุรุษฟังธรรม","options":["suṇāti","puriso","dhammaṃ"],"kind":"build"}'::jsonb,ARRAY[1,2,0],'puriso = บุรุษ; dhammaṃ = ธรรมที่ถูกฟัง; suṇāti = ฟัง ลำดับนี้เป็นแบบฝึก ไม่ใช่ลำดับเดียวที่ใช้ได้ในบาลี'),
('noun-4','noun-roles','{"id":"noun-4","text":"จับคู่คำกับหน้าที่ในประโยคตัวอย่าง","left":["puriso","dhammaṃ","suṇāti"],"options":["กริยา","ประธาน","กรรม"],"kind":"pair"}'::jsonb,ARRAY[1,2,0],'ประธานบอกผู้ทำ กรรมบอกสิ่งที่การกระทำมุ่งถึง กริยาบอกการกระทำ'),
('noun-5','noun-roles','{"id":"noun-5","text":"คำลงท้าย -o และ -aṃ ในบทนี้ใช้กับนามทุกชนิดหรือไม่?","options":["ใช้กับทุกชนิด","เป็นตัวอย่างของนามอการันต์เพศชาย","ไม่มีความหมาย"],"kind":"choose"}'::jsonb,ARRAY[1],'อการันต์ คือนามที่มีรูปฐานลงท้ายเสียงอะ เช่น ปุริส รูปที่เรียนนี้เป็นตัวอย่างนามอการันต์เพศชาย ไม่ใช่รูปลงท้ายของนามทุกชนิด'),
('case-1','cases','{"id":"case-1","text":"จับคู่รูปกับหน้าที่ในแบบที่เรียน","left":["puriso","purisaṃ","purisena"],"options":["กรรมเอกพจน์","ตติยาเอกพจน์","ประธานเอกพจน์"],"kind":"pair"}'::jsonb,ARRAY[2,0,1],'puriso ปฐมา; purisaṃ ทุติยา; purisena ตติยา ทั้งหมดเป็นเอกพจน์'),
('case-2','cases','{"id":"case-2","text":"Puriso ___ likhati. เลือกรูปที่แปลว่า “ด้วยมือ”","options":["hattho","hatthaṃ","hatthena"],"kind":"gap"}'::jsonb,ARRAY[2],'hatthena เป็นตติยาเอกพจน์ บอกเครื่องมือที่ใช้เขียน'),
('case-3','cases','{"id":"case-3","text":"ในตัวอย่างนี้ วิภัตติใดใช้บอกกรรม?","options":["ปฐมา","ทุติยา","ตติยา"],"kind":"choose"}'::jsonb,ARRAY[1],'ทุติยาใช้บอกกรรมในตัวอย่างพื้นฐานที่เรียน'),
('case-4','cases','{"id":"case-4","text":"เรียงตามแบบประธาน–เครื่องมือ–กริยา: บุรุษเขียนด้วยมือ","options":["hatthena","likhati","puriso"],"kind":"build"}'::jsonb,ARRAY[2,0,1],'puriso เป็นผู้เขียน hatthena บอกเครื่องมือ และ likhati คือเขียน'),
('case-5','cases','{"id":"case-5","text":"ตติยาแปลว่า “ด้วย” เหมือนกันทุกประโยคไหม?","options":["ต้องแปลด้วยเสมอ","ดูหน้าที่และบริบทด้วย","เป็นประธานเสมอ"],"kind":"choose"}'::jsonb,ARRAY[1],'ตติยาบอกความสัมพันธ์ได้หลายอย่าง เช่น เครื่องมือหรือความร่วม จึงต้องดูบริบท'),
('number-1','number','{"id":"number-1","text":"Purisā ___ . บุรุษหลายคนไป","options":["gacchati","gacchanti","gacchāmi"],"kind":"gap"}'::jsonb,ARRAY[1],'ประธานหลายคนใช้กริยาบุรุษที่สามพหูพจน์ gacchanti'),
('number-2','number','{"id":"number-2","text":"Puriso gacchati. ประธานมีกี่คน?","options":["หนึ่งคน","หลายคน","ประโยคนี้ไม่มีประธาน"],"kind":"choose"}'::jsonb,ARRAY[0],'puriso เป็นประธานเอกพจน์และเข้าคู่กับ gacchati'),
('number-3','number','{"id":"number-3","text":"จับคู่ประธานกับกริยา “ไป”","left":["puriso","purisā"],"options":["gacchanti","gacchati"],"kind":"pair"}'::jsonb,ARRAY[1,0],'puriso กับ gacchati เป็นเอกพจน์; purisā กับ gacchanti เป็นพหูพจน์'),
('number-4','number','{"id":"number-4","text":"เรียงคำ: บุรุษหลายคนไป","options":["gacchanti","purisā"],"kind":"build"}'::jsonb,ARRAY[1,0],'Purisā gacchanti. ใช้รูปพหูพจน์ทั้งประธานและกริยา'),
('number-5','number','{"id":"number-5","text":"บาลีในบทพื้นฐานนี้แบ่งวจนะเป็นอะไร?","options":["อดีตและอนาคต","เอกวจนะและพหุวจนะ","ประธานและกรรม"],"kind":"choose"}'::jsonb,ARRAY[1],'วจนะบอกจำนวน ได้แก่เอกวจนะกับพหุวจนะ ส่วนประธานกับกรรมเป็นหน้าที่'),
('verb-1','verbs','{"id":"verb-1","text":"จับคู่คำแปลกับรูป “ไป”","left":["ฉันไป","เธอไป","เขาไป"],"options":["gacchati","gacchāmi","gacchasi"],"kind":"pair"}'::jsonb,ARRAY[1,2,0],'บุรุษที่หนึ่ง gacchāmi; บุรุษที่สอง gacchasi; บุรุษที่สาม gacchati'),
('verb-2','verbs','{"id":"verb-2","text":"Ahaṃ ___ . ฉันไป","options":["gacchati","gacchāmi","gacchasi"],"kind":"gap"}'::jsonb,ARRAY[1],'ahaṃ คือฉัน ใช้ gacchāmi'),
('verb-3','verbs','{"id":"verb-3","text":"Tvaṃ ___ . เธอไป","options":["gacchasi","gacchanti","gacchāmi"],"kind":"gap"}'::jsonb,ARRAY[0],'tvaṃ คือเธอ ใช้ gacchasi'),
('verb-4','verbs','{"id":"verb-4","text":"เรียงคำ: ฉันไป","options":["gacchāmi","ahaṃ"],"kind":"build"}'::jsonb,ARRAY[1,0],'Ahaṃ gacchāmi. เป็นตัวอย่างบุรุษที่หนึ่งเอกพจน์'),
('verb-5','verbs','{"id":"verb-5","text":"gacchati ในบทนี้เป็นรูปใด?","options":["บุรุษที่หนึ่งเอกพจน์","บุรุษที่สามเอกพจน์","บุรุษที่สามพหูพจน์"],"kind":"choose"}'::jsonb,ARRAY[1],'gacchati เป็นรูปปัจจุบัน บุรุษที่สามเอกพจน์'),
('pronoun-1','pronouns','{"id":"pronoun-1","text":"จับคู่สรรพนามประธาน","left":["ahaṃ","tvaṃ","mayaṃ"],"options":["พวกเรา","ฉัน","เธอคนเดียว"],"kind":"pair"}'::jsonb,ARRAY[1,2,0],'ahaṃ ฉัน; tvaṃ เธอคนเดียว; mayaṃ พวกเรา'),
('pronoun-2','pronouns','{"id":"pronoun-2","text":"___ gacchāma. พวกเราไป","options":["ahaṃ","tvaṃ","mayaṃ"],"kind":"gap"}'::jsonb,ARRAY[2],'mayaṃ เป็นประธานพหูพจน์บุรุษที่หนึ่ง ใช้กับ gacchāma'),
('pronoun-3','pronouns','{"id":"pronoun-3","text":"เรียงคำ: พวกเราไป","options":["gacchāma","mayaṃ"],"kind":"build"}'::jsonb,ARRAY[1,0],'Mayaṃ gacchāma. เป็นประโยคบุรุษที่หนึ่งพหูพจน์'),
('pronoun-4','pronouns','{"id":"pronoun-4","text":"tvaṃ ในบริบทบทนี้หมายถึงใคร?","options":["ฉัน","เธอคนเดียว","พวกเรา"],"kind":"choose"}'::jsonb,ARRAY[1],'tvaṃ เป็นสรรพนามบุรุษที่สองเอกพจน์ รูปประธาน'),
('pronoun-5','pronouns','{"id":"pronoun-5","text":"สรรพนามเปลี่ยนรูปตามหน้าที่หรือไม่?","options":["ไม่เปลี่ยนเลย","เปลี่ยนได้ตามหน้าที่","มีรูปกรรมอย่างเดียว"],"kind":"choose"}'::jsonb,ARRAY[1],'สรรพนามมีการแจกวิภัตติ บทนี้เริ่มจากรูปประธาน'),
('review-1','grammar-review','{"id":"review-1","text":"เรียงตามแบบประธาน–กรรม–กริยา: บุรุษเห็นบุรุษอีกคน","options":["passati","purisaṃ","puriso"],"kind":"build"}'::jsonb,ARRAY[2,1,0],'Puriso purisaṃ passati. puriso ผู้เห็น; purisaṃ ผู้ถูกเห็น; passati เห็น'),
('review-2','grammar-review','{"id":"review-2","text":"Purisā dhammaṃ ___ . บุรุษหลายคนฟังธรรม","options":["suṇāti","suṇanti","gacchāmi"],"kind":"gap"}'::jsonb,ARRAY[1],'ประธาน purisā หลายคนจึงใช้ suṇanti'),
('review-3','grammar-review','{"id":"review-3","text":"จับคู่คำกับบทบาทใน Puriso hatthena likhati.","left":["puriso","hatthena","likhati"],"options":["เครื่องมือ","กริยา","ประธาน"],"kind":"pair"}'::jsonb,ARRAY[2,0,1],'บุรุษเป็นประธาน มือเป็นเครื่องมือ และเขียนเป็นกริยา'),
('review-4','grammar-review','{"id":"review-4","text":"ประธานหลายคน ต้องมีกรรมหลายสิ่งเสมอไหม?","options":["ต้องเท่ากันเสมอ","ไม่จำเป็น","ประธานหลายคนไม่มีกรรม"],"kind":"choose"}'::jsonb,ARRAY[1],'จำนวนของกรรมไม่จำเป็นต้องตรงกับประธาน เช่นคนหลายคนฟังธรรม'),
('review-5','grammar-review','{"id":"review-5","text":"เมื่อเจอประโยคใหม่ ควรทำอะไรก่อน?","options":["เดาจากตำแหน่งเท่านั้น","ดูรูปศัพท์และหน้าที่ แล้วพิจารณาบริบท","แปลทุกคำเป็นประธาน"],"kind":"choose"}'::jsonb,ARRAY[1],'รูปศัพท์ หน้าที่ และบริบทช่วยให้แปลได้แม่นกว่าการเดาจากตำแหน่ง'),
('masculine-1','masculine','{"id":"masculine-1","text":"ปุงลิงค์ หมายถึงอะไร?","options":["รูปฐานลงท้ายเสียงอะ","เพศชายทางไวยากรณ์","หลายคน"],"kind":"choose"}'::jsonb,ARRAY[1],'ปุงลิงค์บอกเพศชายทางไวยากรณ์ ส่วนอการันต์บอกสระท้ายรูปฐาน'),
('masculine-2','masculine','{"id":"masculine-2","text":"ปุริส เป็นอการันต์ปุงลิงค์ คำว่า “อการันต์” บอกอะไร?","options":["สระท้ายรูปฐาน","จำนวนคำ","ความยาวประโยค"],"kind":"choose"}'::jsonb,ARRAY[0],'อการันต์บอกว่ารูปฐานลงท้ายเสียงอะ ส่วนปุงลิงค์บอกเพศ'),
('masculine-3','masculine','{"id":"masculine-3","text":"จับคู่ศัพท์ที่เรียนกับความหมาย","left":["อการันต์","ปุงลิงค์"],"options":["เพศชายทางไวยากรณ์","รูปฐานลงท้ายเสียงอะ"],"kind":"pair"}'::jsonb,ARRAY[1,0],'ดูคนละเรื่อง: อการันต์ดูสระท้ายรูปฐาน ปุงลิงค์ดูเพศทางไวยากรณ์'),
('masculine-4','masculine','{"id":"masculine-4","text":"ธมฺม เป็นปุงลิงค์ หมายความว่าธรรมเป็นผู้ชายหรือไม่?","options":["เป็นผู้ชาย","ไม่ใช่ เป็นเพศของคำทางไวยากรณ์","เป็นหลายคน"],"kind":"choose"}'::jsonb,ARRAY[1],'เพศทางไวยากรณ์ของนามไม่ได้หมายถึงเพศของสิ่งที่คำเรียกเสมอไป'),
('masculine-5','masculine','{"id":"masculine-5","text":"เรียงตามแบบประธาน–กรรม–กริยา: บุรุษฟังธรรม","options":["dhammaṃ","suṇāti","puriso"],"kind":"build"}'::jsonb,ARRAY[2,0,1],'ปุริส และ ธมฺม เป็นนามอการันต์ปุงลิงค์ ในประโยคใช้ ปุริโส เป็นประธาน ธมฺมํ เป็นกรรม'),
('dative-1','dative','{"id":"dative-1","text":"จตุตถีในประโยคการให้ของบทนี้บอกอะไร?","options":["ผู้รับ","ผู้ให้เสมอ","จำนวนคน"],"kind":"choose"}'::jsonb,ARRAY[0],'ในตัวอย่างนี้จตุตถีบอกผู้รับ แปลว่าแก่'),
('dative-2','dative','{"id":"dative-2","text":"Puriso buddhassa pupphaṃ deti. คำใดบอกผู้รับ?","options":["puriso","buddhassa","pupphaṃ"],"kind":"choose"}'::jsonb,ARRAY[1],'พุทฺธสฺส บอกผู้รับในประโยคนี้: แก่พระพุทธเจ้า'),
('dative-3','dative','{"id":"dative-3","text":"Puriso ___ pupphaṃ deti. เลือกรูปที่บอก “แก่พระพุทธเจ้า”","options":["buddho","buddhassa","buddhaṃ"],"kind":"gap"}'::jsonb,ARRAY[1],'พุทฺธสฺส เป็นรูปจตุตถีเอกพจน์ในบริบทการให้'),
('dative-4','dative','{"id":"dative-4","text":"เรียงตามแบบผู้ให้–ผู้รับ–สิ่งที่ให้–กริยา","options":["deti","pupphaṃ","puriso","buddhassa"],"kind":"build"}'::jsonb,ARRAY[2,3,1,0],'ปุริโส พุทฺธสฺส ปุปฺผํ เทติ เป็นตัวอย่างแต่งเพื่อเรียน ไม่ใช่ข้อความอ้างในคัมภีร์'),
('dative-5','dative','{"id":"dative-5","text":"จับคู่คำกับบทบาทในประโยคการให้","left":["puriso","buddhassa","pupphaṃ"],"options":["สิ่งที่ให้","ผู้ให้","ผู้รับ"],"kind":"pair"}'::jsonb,ARRAY[1,2,0],'ประธานเป็นผู้ให้ จตุตถีเป็นผู้รับ และกรรมเป็นสิ่งที่ให้ในตัวอย่างนี้'),
('genitive-1','genitive','{"id":"genitive-1","text":"ฉัฏฐีที่ฝึกในบทนี้มักแปลว่าอะไร?","options":["ของ","แก่ทุกครั้ง","หลายคน"],"kind":"choose"}'::jsonb,ARRAY[0],'ในบทนี้ฝึกฉัฏฐีที่บอกความเป็นเจ้าของหรือความเกี่ยวข้อง แปลว่าของ'),
('genitive-2','genitive','{"id":"genitive-2","text":"Buddhassa dhammo. คำใดแปลว่า “ของพระพุทธเจ้า”?","options":["dhammo","buddhassa","ทั้งสองคำเป็นกริยา"],"kind":"choose"}'::jsonb,ARRAY[1],'พุทฺธสฺส บอกความเกี่ยวข้องกับ ธมฺโม ในกลุ่มคำนี้'),
('genitive-3','genitive','{"id":"genitive-3","text":"จับคู่บริบทกับหน้าที่ของ พุทฺธสฺส","left":["ให้แก่พระพุทธเจ้า","ธรรมของพระพุทธเจ้า"],"options":["ฉัฏฐี","จตุตถี"],"kind":"pair"}'::jsonb,ARRAY[1,0],'แก่ผู้รับเป็นจตุตถี ส่วนของที่บอกความเกี่ยวข้องเป็นฉัฏฐี'),
('genitive-4','genitive','{"id":"genitive-4","text":"เรียงตามแบบผู้เกี่ยวข้อง–สิ่งที่เกี่ยวข้อง: ธรรมของพระพุทธเจ้า","options":["dhammo","buddhassa"],"kind":"build"}'::jsonb,ARRAY[1,0],'พุทฺธสฺส ธมฺโม คือธรรมของพระพุทธเจ้า ตัวอย่างนี้เป็นกลุ่มคำ ไม่มีกริยาปรากฏ'),
('genitive-5','genitive','{"id":"genitive-5","text":"เมื่อเจอคำลงท้าย -สฺส ควรเลือก “แก่” หรือ “ของ” อย่างไร?","options":["แปลแก่เสมอ","แปลของเสมอ","ดูความสัมพันธ์และบริบท"],"kind":"choose"}'::jsonb,ARRAY[2],'รูปเดียวใช้ได้มากกว่าหนึ่งวิภัตติในแบบนามนี้ การอ่านบริบทจึงจำเป็น')
on conflict (id) do update set lesson_id=excluded.lesson_id,data=excluded.data,answer=excluded.answer,explanation=excluded.explanation;

DO $$
declare v_user uuid;
begin
  if (select count(*) from auth.users) <> 1 then raise exception 'ต้องมีผู้ใช้เพียงบัญชีเดียวเพื่อใช้ไฟล์กู้สถานะนี้'; end if;
  select id into v_user from auth.users;
  insert into public.lesson_completions(user_id,lesson_id)
  select v_user,l from unnest(array['sounds','words','sentences','noun-roles','cases','number','verbs','pronouns','grammar-review']) l
  on conflict do nothing;
end;
$$;
commit;
