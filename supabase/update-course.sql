-- Apply AFTER schema.sql. Repeatable: preserves users, learning history and XP.
begin;
alter table public.attempts drop constraint if exists attempts_lesson_id_check;
alter table public.attempts add constraint attempts_lesson_id_check check (lesson_id in ('sounds','words','sentences','noun-roles','cases','number','verbs','pronouns','grammar-review','masculine','dative','genitive','phonetics','sandhi','feminine','neuter','place-origin','numerals','verb-parts','passive','participles','compounds','taddhita','translation-method'));
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
  lesson_id text not null check(lesson_id in ('sounds','words','sentences','noun-roles','cases','number','verbs','pronouns','grammar-review','masculine','dative','genitive','phonetics','sandhi','feminine','neuter','place-origin','numerals','verb-parts','passive','participles','compounds','taddhita','translation-method')),
  source text not null default 'learner_report' check(source='learner_report'),
  created_at timestamptz not null default now(),
  primary key(user_id,lesson_id)
);
alter table public.lesson_completions drop constraint if exists lesson_completions_lesson_id_check;
alter table public.lesson_completions add constraint lesson_completions_lesson_id_check check(lesson_id in ('sounds','words','sentences','noun-roles','cases','number','verbs','pronouns','grammar-review','masculine','dative','genitive','phonetics','sandhi','feminine','neuter','place-origin','numerals','verb-parts','passive','participles','compounds','taddhita','translation-method'));
alter table public.lesson_completions enable row level security;
revoke all on public.lesson_completions from public,anon,authenticated;
grant select on public.lesson_completions to authenticated;
drop policy if exists "Own reported completion" on public.lesson_completions;
create policy "Own reported completion" on public.lesson_completions for select to authenticated using ((select auth.uid())=user_id);
create or replace function public.mark_learned(p_lesson_ids text[])
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
  if p_lesson_ids is null or cardinality(p_lesson_ids)>24 or exists(select 1 from unnest(p_lesson_ids) l where l is null or l not in
    ('sounds','words','sentences','noun-roles','cases','number','verbs','pronouns','grammar-review','masculine','dative','genitive','phonetics','sandhi','feminine','neuter','place-origin','numerals','verb-parts','passive','participles','compounds','taddhita','translation-method')) then raise exception 'ไม่พบบทเรียน'; end if;
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
('genitive-5','genitive','{"id":"genitive-5","text":"เมื่อเจอคำลงท้าย -สฺส ควรเลือก “แก่” หรือ “ของ” อย่างไร?","options":["แปลแก่เสมอ","แปลของเสมอ","ดูความสัมพันธ์และบริบท"],"kind":"choose"}'::jsonb,ARRAY[2],'รูปเดียวใช้ได้มากกว่าหนึ่งวิภัตติในแบบนามนี้ การอ่านบริบทจึงจำเป็น'),
('phonetics-1','phonetics','{"text":"อักขระบาลีตามแบบเรียนแบ่งเป็นสระและพยัญชนะจำนวนเท่าใด?","options":["สระ 8 พยัญชนะ 33","สระ 33 พยัญชนะ 8","สระ 5 พยัญชนะ 25"],"kind":"choose","id":"phonetics-1"}'::jsonb,ARRAY[0],'รวม 41 ตัว โดยแบ่งเป็นสระ 8 และพยัญชนะ 33'),
('phonetics-2','phonetics','{"text":"กลุ่มใดมีแต่สระสั้นตามแบบเรียน?","options":["อา อี อู","อ อิ อุ","เอ โอ อา"],"kind":"choose","id":"phonetics-2"}'::jsonb,ARRAY[1],'อ อิ อุ เป็นสระสั้น ส่วนห้าตัวที่เหลือจัดเป็นสระยาว'),
('phonetics-3','phonetics','{"text":"จับคู่จำนวนกับกลุ่มอักษร","left":["สระ","พยัญชนะวรรค","พยัญชนะอวรรค"],"options":["25","8 (อวรรค)","8 (สระ)"],"kind":"pair","id":"phonetics-3"}'::jsonb,ARRAY[2,0,1],'สระ 8; พยัญชนะวรรค 25; อวรรค 8 รวมอักขระ 41'),
('phonetics-4','phonetics','{"text":"นิคคหิต ํ อยู่ในกลุ่มใดตามการนับในแบบเรียน?","options":["สระ","พยัญชนะอวรรค","กวรรค"],"kind":"choose","id":"phonetics-4"}'::jsonb,ARRAY[1],'นิคคหิตเป็นหนึ่งในอวรรค 8 ตัวตามแบบเรียน'),
('phonetics-5','phonetics','{"text":"เรียงกวรรคตามแบบเรียน","options":["ค","ง","ก","ฆ","ข"],"kind":"build","id":"phonetics-5"}'::jsonb,ARRAY[2,4,0,3,1],'ก ข ค ฆ ง เป็นกวรรค อย่าใช้ลำดับอักษรไทยทั้งหมดแทนลำดับวรรคบาลี'),
('sandhi-1','sandhi','{"text":"สนธิช่วยอธิบายสิ่งใด?","options":["รอยต่อเสียงของคำ","จำนวนคนในประโยคเท่านั้น","ลิงค์ของทุกคำโดยไม่ดูบริบท"],"kind":"choose","id":"sandhi-1"}'::jsonb,ARRAY[0],'สนธิศึกษาการเปลี่ยนแปลงเสียงเมื่อคำเชื่อมกัน'),
('sandhi-2','sandhi','{"text":"นตฺถิ (natthi) ในตัวอย่างที่เรียนแยกอย่างไร?","options":["น (na) + อตฺถิ (atthi)","น (na) + ตฺวํ (tvaṃ)","ตตฺร (tatra) + อยํ (ayaṃ)"],"kind":"choose","id":"sandhi-2"}'::jsonb,ARRAY[0],'น + อตฺถิ รวมความหมายว่า ไม่มี'),
('sandhi-3','sandhi','{"text":"จับคู่รูปเชื่อมกับคำก่อนเชื่อม","left":["ตตฺรายํ (tatrāyaṃ)","เอวเมตํ (evametaṃ)"],"options":["เอวํ (evaṃ) + เอตํ (etaṃ)","ตตฺร (tatra) + อยํ (ayaṃ)"],"kind":"pair","id":"sandhi-3"}'::jsonb,ARRAY[1,0],'ทั้งสองรูปต้องดูเสียงที่รอยต่อร่วมกับความหมาย'),
('sandhi-4','sandhi','{"text":"แยกสนธิแล้วควรตรวจอะไรต่อ?","options":["ความหมายและรูปคำในบริบท","จำนวนตัวอักษรเท่านั้น","ให้ทุกคำเป็นประธาน"],"kind":"choose","id":"sandhi-4"}'::jsonb,ARRAY[0],'รูปที่แยกควรใช้ได้ทั้งทางไวยากรณ์และทางความหมาย'),
('sandhi-5','sandhi','{"text":"เรียงขั้นตอนตรวจสนธิ","options":["ตรวจความหมายรวม","สังเกตรอยต่อ","ลองแยกคำ"],"kind":"build","id":"sandhi-5"}'::jsonb,ARRAY[1,2,0],'สังเกตเสียง ลองคืนรูปคำ แล้วตรวจว่าประโยคยังมีความหมายสมเหตุสมผล'),
('feminine-1','feminine','{"text":"อิตถีลิงค์ในไวยากรณ์หมายถึงอะไร?","options":["ประเภทเพศหญิงของศัพท์","คำเรียกผู้หญิงเท่านั้น","กริยาปัจจุบัน"],"kind":"choose","id":"feminine-1"}'::jsonb,ARRAY[0],'ลิงค์เป็นประเภทของศัพท์ คำเรียกสภาวะก็มีลิงค์ได้'),
('feminine-2','feminine','{"text":"กญฺญา คามํ คจฺฉติ. คำใดเป็นประธาน?","options":["คามํ (gāmaṃ)","กญฺญา (kaññā)","คจฺฉติ (gacchati)"],"kind":"choose","id":"feminine-2"}'::jsonb,ARRAY[1],'กญฺญาเป็นประธานเอกวจนะของตัวอย่างแต่ง'),
('feminine-3','feminine','{"text":"จับคู่รูป กญฺญา ในบริบทที่ฝึก","left":["กญฺญา (kaññā) ไป","เห็น กญฺญํ (kaññaṃ)"],"options":["กรรมเอกวจนะ","ประธานเอกวจนะ"],"kind":"pair","id":"feminine-3"}'::jsonb,ARRAY[1,0],'ปฐมา กญฺญา; ทุติยา กญฺญํ ในแบบนามนี้'),
('feminine-4','feminine','{"text":"เรียงตามแบบประธาน–กรรม–กริยา: บุรุษเห็นหญิงสาว","options":["ปสฺสติ (passati)","กญฺญํ (kaññaṃ)","ปุริโส (puriso)"],"kind":"build","id":"feminine-4"}'::jsonb,ARRAY[2,1,0],'ปุริโส กญฺญํ ปสฺสติ เป็นประโยคแต่งเพื่อฝึก'),
('feminine-5','feminine','{"text":"เจอคำลงท้าย อา ควรสรุปว่าเป็นพหุวจนะทันทีหรือไม่?","options":["ควรทุกครั้ง","ไม่ควร ต้องดูแบบนามและบริบท","เป็นกริยาเสมอ"],"kind":"choose","id":"feminine-5"}'::jsonb,ARRAY[1],'กญฺญาในตัวอย่างเป็นเอกวจนะ จึงใช้สระท้ายเพียงอย่างเดียวตัดสินไม่ได้'),
('neuter-1','neuter','{"text":"ผลํ (phalaṃ) ใน ผลํ ปตติ (phalaṃ patati) เป็นอะไร?","options":["ประธาน","กรรมเสมอ","กริยา"],"kind":"choose","id":"neuter-1"}'::jsonb,ARRAY[0],'ผลไม้เป็นสิ่งที่ตก จึงเป็นประธานในประโยคนี้'),
('neuter-2','neuter','{"text":"ปุริโส ผลํ ขาทติ. ผลํ มีหน้าที่ใด?","options":["ประธาน","กรรม","คำบอกเวลา"],"kind":"choose","id":"neuter-2"}'::jsonb,ARRAY[1],'ผู้กินคือปุริโส ส่วนผลไม้เป็นสิ่งที่ถูกกิน'),
('neuter-3','neuter','{"text":"จับคู่รูปกับจำนวนในนามที่ฝึก","left":["ผลํ (phalaṃ)","ผลานิ (phalāni)"],"options":["พหุวจนะ","เอกวจนะ"],"kind":"pair","id":"neuter-3"}'::jsonb,ARRAY[1,0],'ปฐมาและทุติยาของนามอการันต์นปุงสกลิงค์: ผลํ เอกวจนะ ผลานิ พหุวจนะ'),
('neuter-4','neuter','{"text":"เรียงตามแบบประธาน–กรรม–กริยา: บุรุษกินผลไม้","options":["ผลํ (phalaṃ)","ขาทติ (khādati)","ปุริโส (puriso)"],"kind":"build","id":"neuter-4"}'::jsonb,ARRAY[2,0,1],'ปุริโส ผลํ ขาทติ เป็นประโยคแต่ง'),
('neuter-5','neuter','{"text":"รูปปฐมากับทุติยาเหมือนกัน ควรทำอย่างไร?","options":["อ่านความสัมพันธ์กับกริยาและบริบท","แปลเป็นกรรมทุกคำ","ตัดคำนั้นทิ้ง"],"kind":"choose","id":"neuter-5"}'::jsonb,ARRAY[0],'รูปคำอาจเหมือนกัน หน้าที่ต้องดูประโยคประกอบ'),
('place-origin-1','place-origin','{"text":"คามสฺมา ในประโยค “มาจากหมู่บ้าน” สัมพันธ์อย่างไร?","options":["บอกที่มา","บอกผู้รับ","บอกเจ้าของ"],"kind":"choose","id":"place-origin-1"}'::jsonb,ARRAY[0],'ปัญจมีในบริบทนี้แสดงที่มา'),
('place-origin-2','place-origin','{"text":"วิหาเร วสติ. วิหาเร หมายถึงอะไรในตัวอย่าง?","options":["แก่วิหาร","ในวิหาร","วิหารหลายแห่งเสมอ"],"kind":"choose","id":"place-origin-2"}'::jsonb,ARRAY[1],'วิหาเรเป็นสัตตมีเอกวจนะในบริบทที่บอกสถานที่อยู่'),
('place-origin-3','place-origin','{"text":"จับคู่บริบทกับวิภัตติ","left":["มาจากหมู่บ้าน","อยู่ในวิหาร"],"options":["สัตตมี","ปัญจมี"],"kind":"pair","id":"place-origin-3"}'::jsonb,ARRAY[1,0],'เริ่มจำจากหน้าที่ แล้วตรวจรูปที่ใช้'),
('place-origin-4','place-origin','{"text":"เรียงตามแบบประธาน–ที่มา–กริยา: บุรุษมาจากหมู่บ้าน","options":["อาคจฺฉติ (āgacchati)","ปุริโส (puriso)","คามสฺมา (gāmasmā)"],"kind":"build","id":"place-origin-4"}'::jsonb,ARRAY[1,2,0],'ปุริโส คามสฺมา อาคจฺฉติ เป็นประโยคแต่ง'),
('place-origin-5','place-origin','{"text":"รู้ว่าเป็นสัตตมีแล้ว ยังต้องดูอะไร?","options":["บริบทและความสัมพันธ์","ไม่ต้องดูอะไรอีก","ทำนองสวดเท่านั้น"],"kind":"choose","id":"place-origin-5"}'::jsonb,ARRAY[0],'หน้าที่และคำแปลละเอียดขึ้นกับประโยค ไม่ใช่ชื่อวิภัตติอย่างเดียว'),
('numerals-1','numerals','{"text":"ข้อใดเป็นปูรณสังขยาในรูปที่ฝึก?","options":["เอโก (eko)","ปฐโม (paṭhamo)","เทฺว (dve)"],"kind":"choose","id":"numerals-1"}'::jsonb,ARRAY[1],'ปฐโมบอกลำดับที่หนึ่ง ส่วนเอโกและเทฺวบอกจำนวนนับ'),
('numerals-2','numerals','{"text":"เทฺว ปุริสา. ปุริสา เป็นวจนะใด?","options":["เอกวจนะ","พหุวจนะ","ทวิวจนะที่ต้องเพิ่มใหม่"],"kind":"choose","id":"numerals-2"}'::jsonb,ARRAY[1],'สองคนใช้พหุวจนะในระบบที่ฝึก'),
('numerals-3','numerals','{"text":"จับคู่รูปสังขยาปฐมาปุงลิงค์กับจำนวน","left":["เอโก (eko)","เทฺว (dve)","ตโย (tayo)"],"options":["สาม","หนึ่ง","สอง"],"kind":"pair","id":"numerals-3"}'::jsonb,ARRAY[1,2,0],'รูปที่ยกมาคือเอโก หนึ่ง; เทฺว สอง; ตโย สาม'),
('numerals-4','numerals','{"text":"เรียงตามแบบจำนวน–นาม–กริยา: บุรุษสามคนไป","options":["คจฺฉนฺติ (gacchanti)","ปุริสา (purisā)","ตโย (tayo)"],"kind":"build","id":"numerals-4"}'::jsonb,ARRAY[2,1,0],'ตโย ปุริสา คจฺฉนฺติ เป็นประโยคแต่ง กริยาเป็นพหุวจนะ'),
('numerals-5','numerals','{"text":"สังขยารูปเดียวใช้กับทุกลิงค์และวิภัตติหรือไม่?","options":["ใช่เสมอ","ไม่เสมอ ต้องตรวจแบบแจก","ไม่มีความสัมพันธ์กับนาม"],"kind":"choose","id":"numerals-5"}'::jsonb,ARRAY[1],'สังขยาบางคำมีการแจกตามลิงค์และวิภัตติ อย่าจำจากรูปตัวอย่างเพียงรูปเดียว'),
('verb-parts-1','verb-parts','{"text":"ส่วนใดบอกความหมายหลักว่า “หุง” ในแบบที่เรียน?","options":["ติ วิภัตติ","ปจฺ ธาตุ","อ ปัจจัย"],"kind":"choose","id":"verb-parts-1"}'::jsonb,ARRAY[1],'ปจฺ ธาตุหมายถึงหุงหรือต้ม ส่วนอื่นช่วยประกอบรูปกริยา'),
('verb-parts-2','verb-parts','{"text":"ปฐมบุรุษตามศัพท์แบบเรียนไทยกล่าวถึงใคร?","options":["เขาหรือผู้ที่กล่าวถึง","เธอผู้ฟัง","ฉันผู้พูด"],"kind":"choose","id":"verb-parts-2"}'::jsonb,ARRAY[0],'ปฐมบุรุษในชื่อแบบเรียนบาลีไทยคือเขา แตกต่างจากการเรียก first person ในภาษาอังกฤษ'),
('verb-parts-3','verb-parts','{"text":"จับคู่ส่วนของ ปจติ กับชื่อ","left":["ปจฺ","อ","ติ"],"options":["วิภัตติ","ธาตุ","ปัจจัย"],"kind":"pair","id":"verb-parts-3"}'::jsonb,ARRAY[1,2,0],'ปจฺ ธาตุ + อ ปัจจัย + ติ วิภัตติ ในรูปที่เรียน'),
('verb-parts-4','verb-parts','{"text":"เรียงส่วนประกอบในคำอธิบายรูป ปจติ","options":["ติ วิภัตติ","ปจฺ ธาตุ","อ ปัจจัย"],"kind":"build","id":"verb-parts-4"}'::jsonb,ARRAY[1,2,0],'แยกเพื่ออธิบายรูปตามแบบเรียน ไม่ใช่กฎแยกรูปกริยาทุกคำด้วยการตัดอักษร'),
('verb-parts-5','verb-parts','{"text":"คจฺฉติ ควรหาธาตุโดยตัดท้ายแบบเดียวกับทุกคำหรือไม่?","options":["ควรทุกคำ","ไม่ควร ต้องรู้การเปลี่ยนรูปธาตุด้วย","ไม่มีกริยาในบาลี"],"kind":"choose","id":"verb-parts-5"}'::jsonb,ARRAY[1],'บางธาตุเปลี่ยนรูปเมื่อประกอบปัจจัย จึงต้องตรวจแบบรูปศัพท์'),
('passive-1','passive','{"text":"ปุริเสน โอทโน ปจียติ. คำใดเป็นประธาน?","options":["ปุริเสน (purisena)","โอทโน (odano)","ปจียติ (pacīyati)"],"kind":"choose","id":"passive-1"}'::jsonb,ARRAY[1],'โอทโนคือข้าวที่ถูกหุง เป็นประธานในกัมมวาจก'),
('passive-2','passive','{"text":"ปุริเสน ในประโยคนี้ทำหน้าที่ใด?","options":["ผู้ทำในรูปตติยา","กรรมทุติยา","ประธานปฐมา"],"kind":"choose","id":"passive-2"}'::jsonb,ARRAY[0],'ตติยาในกัมมวาจกใช้บอกผู้กระทำ ไม่ใช่เครื่องมืออย่างเดียว'),
('passive-3','passive','{"text":"จับคู่รูปกริยากับวาจกในตัวอย่าง","left":["ปจติ (pacati)","ปจียติ (pacīyati)"],"options":["กัมมวาจก","กัตตุวาจก"],"kind":"pair","id":"passive-3"}'::jsonb,ARRAY[1,0],'ปจติ หุง; ปจียติ ถูกหุง ในประโยคที่ยกมา'),
('passive-4','passive','{"text":"เรียงตามแบบผู้ทำตติยา–ประธาน–กริยา: ข้าวถูกบุรุษหุง","options":["ปจียติ (pacīyati)","ปุริเสน (purisena)","โอทโน (odano)"],"kind":"build","id":"passive-4"}'::jsonb,ARRAY[1,2,0],'ปุริเสน โอทโน ปจียติ เป็นประโยคแต่งเพื่อเห็นความสัมพันธ์'),
('passive-5','passive','{"text":"แปล ปจียติ เป็น “บุรุษหุง” โดยไม่ดูประธาน ผิดเพราะอะไร?","options":["ทำให้สลับผู้ทำกับสิ่งที่ถูกทำ","คำนี้ไม่มีธาตุ","ต้องลบคำนามทุกคำ"],"kind":"choose","id":"passive-5"}'::jsonb,ARRAY[0],'ต้องตรวจวาจกและวิภัตติร่วมกัน เพื่อรักษาความสัมพันธ์เดิม'),
('participles-1','participles','{"text":"คนฺตฺวา ในประโยคไปแล้วฟังธรรม บอกอะไร?","options":["การไปก่อนการฟัง","การฟังก่อนการไป","จำนวนวิหาร"],"kind":"choose","id":"participles-1"}'::jsonb,ARRAY[0],'ในบริบทนี้แปลว่าไปแล้ว โดยเชื่อมการกระทำก่อนประโยคหลัก'),
('participles-2','participles','{"text":"คโต ปุริโส. คโต ทำหน้าที่อย่างไรในกลุ่มคำนี้?","options":["ขยายบุรุษว่าไปแล้ว","เป็นกรรมที่ได้ยิน","บอกเจ้าของเท่านั้น"],"kind":"choose","id":"participles-2"}'::jsonb,ARRAY[0],'คโตสัมพันธ์กับปุริโส เป็นรูปที่แจกให้สอดคล้องกับนาม'),
('participles-3','participles','{"text":"จับคู่รูปกับลักษณะการแจกในบทนี้","left":["คโต (gato)","คนฺตฺวา (gantvā)"],"options":["ไม่แจกตามลิงค์และวจนะในการใช้นี้","แจกให้สัมพันธ์กับนาม"],"kind":"pair","id":"participles-3"}'::jsonb,ARRAY[1,0],'อย่าเหมารวมกิตก์ทุกปัจจัยว่ามีลักษณะการแจกเหมือนกัน'),
('participles-4','participles','{"text":"เรียงเหตุการณ์ในตัวอย่างไปแล้วฟังธรรม","options":["ฟังธรรม","ไปวิหาร"],"kind":"build","id":"participles-4"}'::jsonb,ARRAY[1,0],'คนฺตฺวาในประโยคนี้บอกการไปก่อนการฟัง'),
('participles-5','participles','{"text":"ควรอ่านรูปลงท้าย ตฺวา แยกขาดจากกริยาหลักหรือไม่?","options":["ไม่ควร ต้องเชื่อมลำดับและผู้ทำ","ควรเสมอ","เป็นประธานทุกครั้ง"],"kind":"choose","id":"participles-5"}'::jsonb,ARRAY[0],'ต้องอ่านความสัมพันธ์กับประโยคหลัก เพื่อไม่ให้เหตุการณ์สลับกัน'),
('compounds-1','compounds','{"text":"ราชปุตฺโต สื่อความสัมพันธ์ใด?","options":["บุตรของพระราชา","พระราชากินบุตร","บุรุษสองคน"],"kind":"choose","id":"compounds-1"}'::jsonb,ARRAY[0],'ในตัวอย่างนี้คืนความสัมพันธ์เป็น รญฺโญ ปุตฺโต'),
('compounds-2','compounds','{"text":"คำหลักของ ราชปุตฺโต ในความหมายที่เรียนคืออะไร?","options":["บุตร","ของ","ไป"],"kind":"choose","id":"compounds-2"}'::jsonb,ARRAY[0],'คำรวมนี้เรียกบุตร ไม่ได้เรียกการไป'),
('compounds-3','compounds','{"text":"จับคู่ตัวอย่างกับความสัมพันธ์","left":["ราชปุตฺโต (rājaputto)","มหาปุริโส (mahāpuriso)"],"options":["คำขยายกับนาม","ผู้เกี่ยวข้องในความหมายว่า ของ"],"kind":"pair","id":"compounds-3"}'::jsonb,ARRAY[1,0],'ตัวอย่างแรกมีความเป็นเจ้าของ/เกี่ยวข้อง ตัวอย่างหลังเป็นคำขยาย'),
('compounds-4','compounds','{"text":"เรียงขั้นตอนอ่านสมาส","options":["เรียกชื่อชนิด","แปลและคืนศัพท์","ตรวจความสัมพันธ์"],"kind":"build","id":"compounds-4"}'::jsonb,ARRAY[1,2,0],'เริ่มจากความหมายและความสัมพันธ์ แล้วจึงระบุชนิด ไม่เดาจากความยาวของคำ'),
('compounds-5','compounds','{"text":"มหาปุริโส ในตัวอย่างนี้ฝึกสมาสประเภทใด?","options":["กัมมธารยสมาส","เป็นกริยาอาขยาต","เป็นสนธิอย่างเดียว"],"kind":"choose","id":"compounds-5"}'::jsonb,ARRAY[0],'คำขยายมหากับปุริสใช้เป็นตัวอย่างกัมมธารยสมาส'),
('taddhita-1','taddhita','{"text":"ตัทธิตในบทนี้เน้นกระบวนการใด?","options":["ประกอบปัจจัยกับศัพท์","เติมเวลาให้กริยาเท่านั้น","ลบคำนามทั้งหมด"],"kind":"choose","id":"taddhita-1"}'::jsonb,ARRAY[0],'ตัทธิตประกอบปัจจัยกับศัพท์ เพื่อให้ความหมายตามแบบปัจจัยนั้น'),
('taddhita-2','taddhita','{"text":"ธนวา ในรูปที่ฝึกหมายถึงอะไร?","options":["ผู้มีทรัพย์","ทรัพย์ที่ตก","คนเดิน"],"kind":"choose","id":"taddhita-2"}'::jsonb,ARRAY[0],'เป็นรูปปฐมาเอกวจนะปุงลิงค์ของธนวนฺตุ ผู้มีทรัพย์'),
('taddhita-3','taddhita','{"text":"จับคู่ตัวอย่างกับกระบวนการ","left":["ราชปุตฺต","ธนวนฺตุ"],"options":["ศัพท์กับปัจจัยตัทธิต","ศัพท์รวมแบบสมาส"],"kind":"pair","id":"taddhita-3"}'::jsonb,ARRAY[1,0],'ราชปุตฺตเป็นคำรวม ส่วนธนวนฺตุประกอบวนฺตุปัจจัยในความมี'),
('taddhita-4','taddhita','{"text":"เรียงส่วนในคำอธิบายการสร้างศัพท์","options":["ความหมายว่าผู้มีทรัพย์","ธน ศัพท์","วนฺตุ ปัจจัย"],"kind":"build","id":"taddhita-4"}'::jsonb,ARRAY[1,2,0],'เริ่มจากศัพท์ธน ประกอบวนฺตุปัจจัย ให้ความหมายว่าผู้มีทรัพย์'),
('taddhita-5','taddhita','{"text":"เห็น ธนวา ลงท้าย อา ต้องเป็นฐานอาการันต์เสมอหรือไม่?","options":["ใช่ทุกครั้ง","ไม่ใช่ ต้องคืนรูปฐานและตรวจการแจก","ไม่ต้องมีรูปฐาน"],"kind":"choose","id":"taddhita-5"}'::jsonb,ARRAY[1],'รูปที่ใช้ในประโยคอาจต่างจากรูปฐานของศัพท์ เช่นธนวนฺตุมีรูปธนวา'),
('translation-method-1','translation-method','{"text":"ประโยคที่ฝึกมีการกระทำหลักใด?","options":["ฟังธรรม","ไปก่อนแต่ไม่มีการฟัง","หุงข้าว"],"kind":"choose","id":"translation-method-1"}'::jsonb,ARRAY[0],'สุณาติเป็นกริยาหลัก ส่วนคนฺตฺวาเชื่อมการไปก่อนหน้า'),
('translation-method-2','translation-method','{"text":"คำว่า น (na) ในประโยคควรทำอย่างไรเวลาแปล?","options":["รักษาความปฏิเสธ","ตัดทิ้งได้เสมอ","แปลเป็นจำนวนหนึ่ง"],"kind":"choose","id":"translation-method-2"}'::jsonb,ARRAY[0],'การตกคำปฏิเสธอาจทำให้ความหมายกลับด้าน'),
('translation-method-3','translation-method','{"text":"จับคู่แนวการแปลกับจุดเน้น","left":["โดยพยัญชนะ","โดยอรรถ"],"options":["ความหมายเป็นไทยโดยรักษาสาระ","แสดงรูปและความสัมพันธ์ละเอียด"],"kind":"pair","id":"translation-method-3"}'::jsonb,ARRAY[1,0],'ทั้งสองแบบต้องรักษาความหมายเดิม แต่จุดเน้นของสำนวนต่างกัน'),
('translation-method-4','translation-method','{"text":"เรียงการตรวจประโยคในแนวฝึกนี้","options":["เติมส่วนขยายและคำเชื่อม","หาประธานกับกริยาหลัก","ตรวจความหมายทั้งประโยค"],"kind":"build","id":"translation-method-4"}'::jsonb,ARRAY[1,0,2],'ใช้เป็นขั้นตอนฝึก ไม่ใช่กฎว่าทุกประโยคบาลีต้องแปลลำดับเดียวกัน'),
('translation-method-5','translation-method','{"text":"แปลโดยอรรถแล้วลบการไปก่อนฟังออกทั้งหมด เหมาะหรือไม่?","options":["ไม่เหมาะ เพราะเหตุการณ์สำคัญหายไป","เหมาะเสมอเพราะภาษาไทยสั้นลง","ต้องลบกริยาทุกคำ"],"kind":"choose","id":"translation-method-5"}'::jsonb,ARRAY[0],'สำนวนอ่านง่ายได้ แต่สาระและลำดับสำคัญต้องยังอยู่')
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
