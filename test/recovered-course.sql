\set ON_ERROR_STOP on
do $$ begin
  if (select count(*) from public.lesson_completions)<>9 then raise exception 'Recovery must mark exactly the original nine lessons'; end if;
  if exists(select 1 from public.lesson_completions where lesson_id in ('masculine','dative','genitive')) then raise exception 'New lessons incorrectly completed'; end if;
  if (select count(*) from public.attempts)<>0 or (select count(*) from public.game_credits)<>0 then raise exception 'Recovery fabricated scores or XP'; end if;
end $$;
