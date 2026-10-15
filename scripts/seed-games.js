import { readFileSync, writeFileSync } from 'node:fs';
import { gameQuestions } from '../grammar.js';
import { lessons } from '../lessons.js';
const quote = v => `'${String(v).replaceAll("'", "''")}'`;
const path = new URL('../supabase/games.sql', import.meta.url);
const ids = lessons.map(l => quote(l.id)).join(',');
const base = readFileSync(path, 'utf8').split('-- Original grammar question seed follows.')[0]
  .replace(/lesson_id in \([^)]*\)/g, `lesson_id in (${ids})`)
  .replace(/cardinality\(p_lesson_ids\)>\d+/, `cardinality(p_lesson_ids)>${lessons.length}`)
  .replace(/l not in\s*\([^)]*\)/g, `l not in (${ids})`);
const rows = gameQuestions.map(({ answer, why, lessonId, ...data }) => `(${quote(data.id)},${quote(lessonId)},${quote(JSON.stringify(data))}::jsonb,ARRAY[${answer.join(',')}],${quote(why)})`);
writeFileSync(path, base + '-- Original grammar question seed follows.\ninsert into public.game_bank(id,lesson_id,data,answer,explanation) values\n' + rows.join(',\n') + '\non conflict (id) do update set lesson_id=excluded.lesson_id,data=excluded.data,answer=excluded.answer,explanation=excluded.explanation;\ncommit;\n');
// A separate, explicit recovery operation for the user who reported completing the original course.
// Abort if identity is ambiguous; never mark all accounts complete or fabricate score/XP.
const recovery = `
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
`;
writeFileSync(new URL('../supabase/update-course.sql', import.meta.url), readFileSync(path, 'utf8').replace(/commit;\s*$/, () => recovery));
