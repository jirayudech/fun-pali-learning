-- Run in Supabase SQL Editor. This script is repeatable and does not delete learning history.
begin;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 60)
);
create table if not exists public.attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id text not null check (lesson_id in ('sounds','words','sentences')),
  score integer not null,
  total integer not null check (total > 0),
  created_at timestamptz not null default now(),
  check (score between 0 and total)
);
create index if not exists attempts_user_date on public.attempts(user_id, created_at desc);
create table if not exists public.question_bank (
  id text primary key,
  lesson_id text not null,
  position integer not null,
  question text not null,
  options jsonb not null,
  answer integer not null,
  explanation text not null,
  unique(lesson_id,position)
);
create table if not exists public.quiz_sessions (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 hour',
  submitted boolean not null default false
);
create index if not exists quizzes_user_date on public.quiz_sessions(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.attempts enable row level security;
alter table public.question_bank enable row level security;
alter table public.quiz_sessions enable row level security;
revoke all on public.profiles, public.attempts, public.question_bank, public.quiz_sessions from public, anon, authenticated;
grant select on public.profiles, public.attempts to authenticated;
drop policy if exists "Own profile" on public.profiles;
create policy "Own profile" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Own history" on public.attempts;
create policy "Own history" on public.attempts for select to authenticated using ((select auth.uid()) = user_id);
-- No browser INSERT grants: scores can only be saved by the server-side scoring function.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(user_id, display_name)
  values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), 'ผู้เรียน'), 60))
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
drop trigger if exists pali_new_user on auth.users;
create trigger pali_new_user after insert on auth.users for each row execute function public.handle_new_user();
insert into public.profiles(user_id,display_name)
select id, left(coalesce(nullif(trim(raw_user_meta_data->>'display_name'), ''), 'ผู้เรียน'), 60) from auth.users
on conflict (user_id) do nothing;

create or replace function public.start_quiz(p_lesson_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_token uuid;
  v_questions jsonb;
begin
  if v_user is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
  select jsonb_agg(jsonb_build_object('id',id,'text',question,'options',options) order by position)
    into v_questions from public.question_bank where lesson_id = p_lesson_id;
  if v_questions is null then raise exception 'ไม่พบบทเรียน'; end if;
  -- Serialize per-user creation so parallel requests cannot bypass the limit.
  perform 1 from public.profiles where user_id = v_user for update;
  if (select count(*) from public.quiz_sessions where user_id = v_user and created_at > now() - interval '10 minutes') >= 30
    then raise exception 'เริ่มแบบฝึกหัดบ่อยเกินไป กรุณารอสักครู่'; end if;
  delete from public.quiz_sessions where user_id = v_user and expires_at < now() - interval '1 day';
  insert into public.quiz_sessions(user_id,lesson_id) values (v_user,p_lesson_id) returning token into v_token;
  return jsonb_build_object('token',v_token,'questions',v_questions);
end;
$$;
revoke all on function public.start_quiz(text) from public, anon;
grant execute on function public.start_quiz(text) to authenticated;

create or replace function public.submit_quiz(p_token uuid, p_answers integer[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_quiz public.quiz_sessions%rowtype;
  v_total integer;
  v_score integer;
  v_feedback jsonb;
begin
  if v_user is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
  select * into v_quiz from public.quiz_sessions where token=p_token and user_id=v_user for update;
  if not found or v_quiz.submitted or v_quiz.expires_at < now()
    then raise exception 'แบบฝึกหัดหมดอายุหรือส่งแล้ว กรุณาเริ่มใหม่'; end if;
  select count(*) into v_total from public.question_bank where lesson_id=v_quiz.lesson_id;
  if p_answers is null or cardinality(p_answers) <> v_total or array_ndims(p_answers) <> 1 or array_lower(p_answers,1) <> 1
    then raise exception 'กรุณาตอบทุกข้อ'; end if;
  if exists (select 1 from public.question_bank q where q.lesson_id=v_quiz.lesson_id and
    (p_answers[q.position] is null or p_answers[q.position] < 0 or p_answers[q.position] >= jsonb_array_length(q.options)))
    then raise exception 'คำตอบไม่ถูกต้อง'; end if;
  select count(*) filter (where p_answers[position]=answer),
    jsonb_agg(jsonb_build_object('text',question,'correct',p_answers[position]=answer,'answer',options->>answer,'why',explanation) order by position)
    into v_score,v_feedback from public.question_bank where lesson_id=v_quiz.lesson_id;
  insert into public.attempts(user_id,lesson_id,score,total) values (v_user,v_quiz.lesson_id,v_score,v_total);
  update public.quiz_sessions set submitted=true where token=p_token;
  return jsonb_build_object('score',v_score,'total',v_total,'feedback',v_feedback);
end;
$$;
revoke all on function public.submit_quiz(uuid,integer[]) from public, anon;
grant execute on function public.submit_quiz(uuid,integer[]) to authenticated;

-- Question seed appended below.

insert into public.question_bank(id,lesson_id,position,question,options,answer,explanation) values
('sounds-1','sounds','1','สระ ā ในอักษรโรมันตรงกับเสียงใด?','["อะ","อา","อิ","อุ"]','1','ā ใช้แทนเสียงอา ซึ่งเป็นสระยาว'),
('sounds-2','sounds','2','จุดพินทุ (ฺ) ใต้พยัญชนะบอกอะไร?','["ออกเสียงยาว","ไม่มีเสียงสระอะตามหลัง","ขึ้นเสียงสูง","เป็นคำแปลภาษาไทย"]','1','พินทุบอกว่าพยัญชนะนั้นไม่มีสระอะตามหลัง เช่น ทฺ ใน พุทฺโธ'),
('sounds-3','sounds','3','นิคหิตในอักษรโรมันใช้เครื่องหมายใด?','["ā","ñ","ṃ","ī"]','2','ṃ ใช้แทนนิคหิต เช่น dhammaṃ = ธมฺมํ'),
('words-1','words','1','mettā ตรงกับคำใด?','["ปัญญา","เมตตา","ทุกข์","สระ"]','1','mettā คือเมตตา ความปรารถนาให้ผู้อื่นมีความสุข'),
('words-2','words','2','paññā แปลว่าอะไร?','["ปัญญา","ความทุกข์","เสียง","ผู้เรียน"]','0','paññā (ปญฺญา) หมายถึงปัญญา'),
('words-3','words','3','ควรเลือกคำแปลของ dhamma อย่างไร?','["แปลว่าคำสอนเสมอ","ดูบริบทของประโยค","ไม่ต้องแปล","แปลว่าพระสงฆ์เสมอ"]','1','dhamma มีหลายความหมาย การดูบริบทช่วยเลือกคำแปลที่เหมาะสม'),
('sentences-1','sentences','1','ใน Buddho dhammaṃ deseti คำใดเป็นประธาน?','["Buddho","dhammaṃ","deseti","ทุกคำ"]','0','Buddho เป็นประธาน ผู้ทรงแสดงธรรม'),
('sentences-2','sentences','2','dhammaṃ ทำหน้าที่ใดในประโยคตัวอย่าง?','["กริยา","ประธาน","กรรม","คำถาม"]','2','dhammaṃ เป็นกรรม คือธรรมที่ทรงแสดง'),
('sentences-3','sentences','3','deseti ในประโยคตัวอย่างหมายถึงอะไร?','["เดิน","แสดงหรือสอน","นอน","ฟัง"]','1','deseti เป็นกริยาหมายถึงแสดงหรือสอน')
on conflict (id) do update set lesson_id=excluded.lesson_id,position=excluded.position,question=excluded.question,options=excluded.options,answer=excluded.answer,explanation=excluded.explanation;
commit;
